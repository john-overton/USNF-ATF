"""Reader for "brent's relocatable format" (BRF) object-type source files.

``.PT`` (plane), ``.JT`` (projectile / weapon), ``.NT`` (NPC: ships,
vehicles, SAM sites) and ``.OT`` (static object) files in ``USNF_2.LIB`` /
``ATF_2.LIB`` are not binary records: each is a small text file in an
assembler-like data language that starts with the line
``[brent's_relocatable_format]``.  The game evidently assembles the file into
a C struct at load time.  See Docs/formats/pt.md.

Grammar (one statement per line, CRLF line endings, ``;`` starts a comment):

    byte  N            8-bit field
    word  N            16-bit field
    dword N            32-bit field
    ptr   LABEL        32-bit pointer to a ``:LABEL`` block in the same file
    symbol NAME        32-bit pointer to an engine-side symbol (``_PLANEProc``)
    string "text"      NUL-terminated string (only inside a ``:LABEL`` block)
    :LABEL             defines a label at the current position
    end                end of file

Numbers are decimal, ``$hex``, or ``^N``.  The caret prefix marks a value the
assembler scales into internal units (altitudes, ranges, accelerations); the
raw integer is kept and ``Token.scaled`` is set.

Section boundaries are comment lines of the form
``;---------------- START OF PLANE_TYPE ----------------``; ATF Gold files
additionally carry a ``; fieldName`` comment after most statements, which is
where the field names in :mod:`retail.pt` come from.  USNF'97 files are the
same layout without the comments.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

MAGIC = "[brent's_relocatable_format]"
SIZES = {"byte": 1, "word": 2, "dword": 4, "ptr": 4, "symbol": 4}

_STMT = re.compile(r"^\s*(byte|word|dword|ptr|symbol|string|end)\b\s*([^;]*?)\s*(?:;\s*(.*?))?\s*$")
_START = re.compile(r"^;-+\s*START OF (\w+)")
_HARD = re.compile(r"^;-+\s*hardpoint\s+(\d+)")
_ENV = re.compile(r"^;-+\s*envelope for G\s*=\s*(-?\d+)")


class BRFError(ValueError):
    pass


@dataclass(frozen=True)
class Token:
    """One data statement."""

    section: str        # OBJ_TYPE, NPC_TYPE, PLANE_TYPE, PROJ_TYPE, HARD, ENV, or a label name
    kind: str           # byte | word | dword | ptr | symbol | string
    value: int | str    # int for numeric kinds, label/symbol/string text otherwise
    comment: str = ""   # ATF Gold field-name comment, "" in USNF'97 files
    scaled: bool = False  # value was written with the ``^`` prefix
    line: int = 0

    @property
    def size(self) -> int:
        return SIZES.get(self.kind, 0)


@dataclass
class BRFFile:
    tokens: list[Token] = field(default_factory=list)
    labels: dict[str, list[str]] = field(default_factory=dict)  # :label -> strings
    comments: list[tuple[int, str]] = field(default_factory=list)  # free-form comments (line, text)

    def section(self, name: str) -> list[Token]:
        return [t for t in self.tokens if t.section == name]

    @property
    def sections(self) -> list[str]:
        seen: list[str] = []
        for t in self.tokens:
            if t.section not in seen:
                seen.append(t.section)
        return seen

    @property
    def labeled(self) -> bool:
        """True when the file carries ATF-style field-name comments."""
        return sum(1 for t in self.tokens if t.comment) > 10

    def strings(self, label: str) -> list[str]:
        return self.labels.get(label, [])

    def string(self, label: str, index: int = 0) -> str | None:
        s = self.labels.get(label)
        return s[index] if s and index < len(s) else None


def parse_number(text: str) -> tuple[int, bool]:
    """Return (value, scaled) for a BRF numeric literal."""
    text = text.strip()
    scaled = text.startswith("^")
    if scaled:
        text = text[1:]
    neg = text.startswith("-")
    if neg:
        text = text[1:]
    if text.startswith("$"):
        v = int(text[1:], 16)
    else:
        v = int(text, 10)
    return (-v if neg else v), scaled


def fold(v: int, kind: str) -> int:
    """Truncate to the field width and sign-fold, as the assembler does
    (``word $ffff8000`` is -32768, ``dword $80000000`` is INT32_MIN)."""
    bits = SIZES.get(kind, 4) * 8
    v &= (1 << bits) - 1
    return v - (1 << bits) if v >= 1 << (bits - 1) else v


def loads(text: str) -> BRFFile:
    lines = text.splitlines()
    if not lines or lines[0].strip() != MAGIC:
        raise BRFError("missing BRF magic line")
    out = BRFFile()
    section = "HEADER"
    cur_label: str | None = None
    for no, raw in enumerate(lines[1:], start=2):
        s = raw.strip()
        if not s:
            continue
        if s.startswith(";"):
            m = _START.match(s)
            if m:
                section = m.group(1)
            elif _HARD.match(s):
                section = "HARD"
            elif _ENV.match(s):
                section = "ENV"
            else:
                out.comments.append((no, s[1:].strip()))
            continue
        if s.startswith(":"):
            cur_label = s[1:].strip()
            if cur_label == "hards":
                section = "HARD"
            elif cur_label == "env":
                section = "ENV"
            else:
                section = cur_label
            out.labels.setdefault(cur_label, [])
            continue
        m = _STMT.match(raw)
        if not m:
            raise BRFError(f"line {no}: cannot parse {raw!r}")
        kind, arg, comment = m.group(1), m.group(2), m.group(3) or ""
        if kind == "end":
            break
        if kind == "string":
            if not (arg.startswith('"') and arg.endswith('"')):
                raise BRFError(f"line {no}: bad string literal {arg!r}")
            val: int | str = arg[1:-1]
            if cur_label is not None:
                out.labels[cur_label].append(val)
            out.tokens.append(Token(section, kind, val, comment, False, no))
            continue
        if kind in ("ptr", "symbol"):
            out.tokens.append(Token(section, kind, arg.strip(), comment, False, no))
            continue
        try:
            v, scaled = parse_number(arg)
        except ValueError as e:
            raise BRFError(f"line {no}: bad number {arg!r}") from e
        out.tokens.append(Token(section, kind, fold(v, kind), comment, scaled, no))
    return out


def load(path: str) -> BRFFile:
    with open(path, "rb") as f:
        return loads(f.read().decode("latin-1"))


# ---------------------------------------------------------------------------
# Positional labelling.  A schema is a sequence of (kind, name); USNF'97 files
# have no comments, so names are assigned by position after checking kinds.

Schema = Sequence[tuple[str, str]]


def apply_schema(tokens: Sequence[Token], schema: Schema, *, optional: Iterable[str] = ()) -> dict[str, Token]:
    """Map schema names onto ``tokens`` in order.

    Entries named in ``optional`` are skipped when the token kind at that
    position does not match (used for the ``year`` dword that ATF Gold adds).
    ``ptr`` and ``dword`` are interchangeable (a null pointer is written as
    ``dword 0``).  Raises BRFError on any other mismatch so a wrong schema
    never yields silently mislabelled data.
    """
    optional = set(optional)
    out: dict[str, Token] = {}
    ti = 0
    for kind, name in schema:
        if ti >= len(tokens):
            if name in optional:
                continue
            raise BRFError(f"ran out of tokens at schema field {name!r}")
        tok = tokens[ti]
        if not _kind_ok(kind, tok.kind):
            if name in optional:
                continue
            raise BRFError(f"field {name!r}: expected {kind}, found {tok.kind} at line {tok.line}")
        if tok.comment and not _same_field(tok.comment, name):
            raise BRFError(f"field {name!r}: file comment says {tok.comment!r} (line {tok.line})")
        out[name] = tok
        ti += 1
    if ti != len(tokens):
        raise BRFError(f"{len(tokens) - ti} unlabelled tokens left after schema (line {tokens[ti].line})")
    return out


def _kind_ok(want: str, have: str) -> bool:
    if want == have:
        return True
    return {want, have} <= {"ptr", "dword", "symbol"}


def _basename(name: str) -> str:
    """'sigs[2]' and 'sigs [i]' -> 'sigs'; 'env [ii].data [j].alt' -> 'env.data.alt'."""
    return re.sub(r"\s*\[[^\]]*\]", "", name).replace(" ", "")


def _same_field(comment: str, name: str) -> bool:
    """A schema name matches a source comment when the bracket-stripped names agree
    or one is the dotted tail of the other ('env.data.alt' vs 'alt')."""
    a, b = _basename(comment), _basename(name)
    return a == b or a.endswith("." + b) or b.endswith("." + a)
