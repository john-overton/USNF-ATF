"""PKWare Data Compression Library (DCL) "implode" decoder.

This is a pure-Python port of Mark Adler's ``blast.c`` (zlib, contrib/blast,
public domain-style zlib licence), restructured for speed: instead of pulling
one bit per loop iteration, each Huffman alphabet is expanded into a flat
2**13-entry lookup table indexed by the next 13 stream bits (LSB first), so a
symbol costs one table lookup and a couple of shifts.

Stream format (see Docs/formats/dcl.md):

    byte 0   literal mode: 0 = literals are raw 8-bit bytes, 1 = Huffman coded
    byte 1   dictionary size log2 - 6: 4, 5 or 6 (1 KiB, 2 KiB, 4 KiB window)
    then a bit stream, LSB first within each byte:
        0 bit  -> literal (8 raw bits, or a code from the literal table)
        1 bit  -> length code (+ extra bits), then distance code (+ extra bits)
    length 519 (symbol 15 + 255 extra) terminates the stream.
"""

from __future__ import annotations

MAXBITS = 13
MAXWIN = 4096
END_LENGTH = 519

# Run-length encoded code lengths, exactly as in blast.c.  Each byte holds
# (repeat count - 1) << 4 | bit length.
_LITLEN = bytes([
    11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8,
    9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5,
    7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12,
    8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27,
    44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45,
    44, 173])
_LENLEN = bytes([2, 35, 36, 53, 38, 23])
_DISTLEN = bytes([2, 20, 53, 230, 247, 151, 248])

_BASE = (3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264)
_EXTRA = (0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8)


class DCLError(ValueError):
    """Raised for a malformed or truncated DCL stream."""


def _expand_lengths(rep: bytes) -> list[int]:
    lengths: list[int] = []
    for b in rep:
        lengths.extend([b & 15] * ((b >> 4) + 1))
    return lengths


def _build_table(rep: bytes) -> tuple[int, ...]:
    """Build a 2**MAXBITS lookup table: entry = symbol << 4 | code length.

    Codes are canonical (blast.c ``construct``): symbols sorted by length, then
    by symbol value; the first code of the shortest length is 0.  On the wire
    the bits of a code appear MSB-first *inverted* (blast.c ``decode`` does
    ``code |= (bit ^ 1)``), so the table key for stream bits b1..bL (b1 read
    first, i.e. LSB of the key) is derived by inverting the canonical code.
    """
    lengths = _expand_lengths(rep)
    n = len(lengths)
    count = [0] * (MAXBITS + 1)
    for length in lengths:
        count[length] += 1
    count[0] = 0
    left = 1
    for length in range(1, MAXBITS + 1):
        left = (left << 1) - count[length]
        if left < 0:
            raise DCLError("over-subscribed code")
    # Canonical code assignment: next_code[len]
    next_code = [0] * (MAXBITS + 2)
    code = 0
    for length in range(1, MAXBITS + 1):
        next_code[length] = code
        code = (code + count[length]) << 1
    table = [0] * (1 << MAXBITS)
    for symbol in range(n):
        length = lengths[symbol]
        if length == 0:
            continue
        canon = next_code[length]
        next_code[length] += 1
        # bit i of the stream (0 = first read) = inverted bit (length-1-i) of canon
        key = 0
        for i in range(length):
            bit = ((canon >> (length - 1 - i)) & 1) ^ 1
            key |= bit << i
        entry = (symbol << 4) | length
        step = 1 << length
        for k in range(key, 1 << MAXBITS, step):
            table[k] = entry
    return tuple(table)


_LIT_TABLE = _build_table(_LITLEN)
_LEN_TABLE = _build_table(_LENLEN)
_DIST_TABLE = _build_table(_DISTLEN)
_MASK = (1 << MAXBITS) - 1


def explode(data: bytes, expected_size: int | None = None) -> bytes:
    """Decompress a PKWare DCL implode stream.

    ``expected_size``, when given, is enforced: a stream that ends early or
    late (before/after producing exactly that many bytes) raises DCLError.
    Without it, decoding runs until the end-of-stream code.
    """
    if len(data) < 2:
        raise DCLError("stream too short for header")
    lit = data[0]
    dict_bits = data[1]
    if lit > 1:
        raise DCLError(f"bad literal mode {lit}")
    if dict_bits < 4 or dict_bits > 6:
        raise DCLError(f"bad dictionary size code {dict_bits}")

    out = bytearray()
    append = out.append
    lit_table = _LIT_TABLE
    len_table = _LEN_TABLE
    dist_table = _DIST_TABLE
    base = _BASE
    extra = _EXTRA
    dict_mask = (1 << dict_bits) - 1

    # Bit buffer: `bb` holds `bc` unread bits, LSB = next bit.  Refills read
    # up to four bytes at a time; reads past the end supply zero bytes and are
    # caught afterwards by comparing the consumed bit count to the input.
    src = data
    n = len(src)
    pos = 2
    bb = 0
    bc = 0
    limit = expected_size if expected_size is not None else -1

    while True:
        # Ensure at least 1 + 13 + 8 + 13 + 8 bits = 43?  Keep it simple:
        # top up to >= 32 bits whenever below 24 so any single decode step
        # (flag + code + extra, at most 1+13+8 = 22 bits) never runs dry.
        if bc < 24:
            while bc <= 24:
                if pos < n:
                    bb |= src[pos] << bc
                pos += 1
                bc += 8
        if bb & 1:
            bb >>= 1
            e = len_table[bb & _MASK]
            length = e & 15
            bb >>= length
            symbol = e >> 4
            bc -= 1 + length
            eb = extra[symbol]
            length = base[symbol]
            if eb:
                length += bb & ((1 << eb) - 1)
                bb >>= eb
                bc -= eb
            if length == END_LENGTH:
                break
            if bc < 24:
                while bc <= 24:
                    if pos < n:
                        bb |= src[pos] << bc
                    pos += 1
                    bc += 8
            e = dist_table[bb & _MASK]
            clen = e & 15
            bb >>= clen
            bc -= clen
            if length == 2:
                dist = ((e >> 4) << 2) + (bb & 3) + 1
                bb >>= 2
                bc -= 2
            else:
                dist = ((e >> 4) << dict_bits) + (bb & dict_mask) + 1
                bb >>= dict_bits
                bc -= dict_bits
            cur = len(out)
            if dist > cur:
                raise DCLError(f"distance {dist} too far back at output {cur}")
            if dist >= length:
                out += out[cur - dist:cur - dist + length]
            else:
                chunk = out[cur - dist:cur]
                reps, rem = divmod(length, dist)
                out += chunk * reps + chunk[:rem]
            if limit >= 0 and len(out) > limit:
                raise DCLError(f"output exceeds expected size {limit}")
        else:
            bb >>= 1
            bc -= 1
            if lit:
                e = lit_table[bb & _MASK]
                clen = e & 15
                bb >>= clen
                bc -= clen
                append(e >> 4)
            else:
                append(bb & 0xFF)
                bb >>= 8
                bc -= 8
            if limit >= 0 and len(out) > limit:
                raise DCLError(f"output exceeds expected size {limit}")

    consumed_bits = pos * 8 - bc
    if consumed_bits > n * 8:
        raise DCLError("stream truncated")
    if limit >= 0 and len(out) != limit:
        raise DCLError(f"expected {limit} bytes, got {len(out)}")
    return bytes(out)

