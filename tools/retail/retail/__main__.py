"""Command line: python3 -m retail {list,extract,cat,stats} ...

    list    <disc|lib|esa>            one line per logical file
    extract <disc|lib|esa> <outdir>   decompress everything to <outdir>/<archive>/<name>
    cat     <disc|lib|esa> <name>     write one file's bytes to stdout
    stats   <disc|lib|esa>            per-extension counts and uncompressed sizes
"""

from __future__ import annotations

import argparse
import collections
import os
import sys
import time

from .disc import iter_sources
from .esa import ESAEntry


def _describe(src, e) -> str:
    if isinstance(e, ESAEntry):
        return f"{src.name:14s} {e.name:24s} {e.codec:4s} {e.csize:10d} -> {e.size:10d}  {e.label}"
    usize = src.uncompressed_size(e)
    codec = "DCL " if e.compressed else "----"
    return f"{src.name:14s} {e.name:24s} {codec} {e.size:10d} -> {usize:10d}"


def cmd_list(args) -> int:
    for src in iter_sources(args.source):
        for e in src.entries():
            print(_describe(src, e))
    return 0


def cmd_extract(args) -> int:
    t0 = time.time()
    count = failures = dups = 0
    total = 0
    for src in iter_sources(args.source):
        outdir = os.path.join(args.outdir, src.name)
        os.makedirs(outdir, exist_ok=True)
        seen: set[str] = set()
        for e in src.entries():
            target = os.path.join(outdir, e.name.replace("\\", "_").replace("/", "_"))
            if target.upper() in seen:      # USNF_2.LIB lists 52 XMIs twice
                dups += 1
            seen.add(target.upper())
            try:
                data = src.read(e)
            except Exception as ex:  # report and continue; never hide failures
                failures += 1
                print(f"FAIL {src.name}/{e.name}: {ex}", file=sys.stderr)
                continue
            with open(target, "wb") as f:
                f.write(data)
            count += 1
            total += len(data)
        print(f"{src.name}: done", file=sys.stderr)
    print(f"extracted {count} entries ({dups} duplicate names overwritten), {total} bytes, "
          f"{failures} failures, {time.time() - t0:.1f}s", file=sys.stderr)
    return 1 if failures else 0


def cmd_cat(args) -> int:
    want = args.name.upper()
    for src in iter_sources(args.source):
        for e in src.entries():
            if e.name.upper() == want or f"{src.name}/{e.name}".upper() == want:
                sys.stdout.buffer.write(src.read(e))
                return 0
    print(f"not found: {args.name}", file=sys.stderr)
    return 2


def cmd_stats(args) -> int:
    counts: dict[str, int] = collections.Counter()
    sizes: dict[str, int] = collections.Counter()
    per_archive: dict[str, tuple[int, int]] = {}
    for src in iter_sources(args.source):
        n = b = 0
        for e in src.entries():
            ext = e.extension or "(none)"
            usize = src.uncompressed_size(e)
            counts[ext] += 1
            sizes[ext] += usize
            n += 1
            b += usize
        per_archive[src.name] = (n, b)
    print(f"{'archive':16s} {'files':>6s} {'bytes':>12s}")
    for name, (n, b) in per_archive.items():
        print(f"{name:16s} {n:6d} {b:12d}")
    print()
    print(f"{'ext':8s} {'files':>6s} {'bytes':>12s}")
    for ext, n in sorted(counts.items(), key=lambda kv: -sizes[kv[0]]):
        print(f"{ext:8s} {n:6d} {sizes[ext]:12d}")
    print(f"{'total':8s} {sum(counts.values()):6d} {sum(sizes.values()):12d}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m retail", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list"); p.add_argument("source"); p.set_defaults(fn=cmd_list)
    p = sub.add_parser("extract"); p.add_argument("source"); p.add_argument("outdir"); p.set_defaults(fn=cmd_extract)
    p = sub.add_parser("cat"); p.add_argument("source"); p.add_argument("name"); p.set_defaults(fn=cmd_cat)
    p = sub.add_parser("stats"); p.add_argument("source"); p.set_defaults(fn=cmd_stats)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
