"""``*.MNU`` / ``*.DLG`` UI table decoder (USNF'97 / ATF Gold).

These are not text and not the BRF language.  They are data-only Phar Lap
``PL\\0\\0`` images of the same family as ``.FNT`` (see Docs/formats/fnt.md) and
``.HUD``: an ``MZ`` stub, a ``CODE`` section holding the table, ``.reloc``
listing every pointer in it, and — for ``.DLG`` — an ``.idata`` importing from
``main.dll``, which as Docs/formats/ai.md established for the AI plug-ins is the
host executable's own symbol table rather than a file on disc.

The only x86 present is a run of six-byte ``jmp [IAT]`` import thunks at the end
of ``CODE``.  Every widget record begins with a relocated pointer to one of
them, so the imported name *is* the widget class: ``_DrawAction``, ``_DrawDial``,
``_DrawRocker``, ``_DrawListBox``, ``_DrawEditBox`` and the rest.

Record boundaries are therefore recovered from the relocation table rather than
assumed: a relocated dword that resolves to a thunk starts a widget, and a
relocated dword that points into the string pool is that widget's label.  Sizes
differ by class and are reported, not hard-coded.  Fields beyond the ones named
below are emitted as ``unknown`` hex rather than guessed at.

``.MNU`` files carry no imports.  They are menu-bar trees of nodes linked by
relocated next-pointers, each with an inline NUL-terminated label in which
``\\x01`` separates the accelerator (``"Exit to Windows"`` / ``"Alt-F4"``).  The
node flag and submenu bytes are **not** pinned; they are reported raw.
"""

from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

SIGNATURES = (b"PE\0\0", b"PL\0\0")
# Offsets within a widget record, recovered from CHOOSEAC.DLG and re-verified on
# LOADORD.DLG.  Only the label pointer is self-checking, through .reloc.
X_OFFSET, Y_OFFSET = 0x04, 0x06
COMMAND_OFFSET, WIDTH_OFFSET, LABEL_OFFSET = 0x11, 0x12, 0x14
# The dialog header: a handler pointer, then the rect the screen art is cut to.
HEADER_RECT = 0x04
MAX_LABEL = 128


class MNUError(ValueError):
    pass


@dataclass
class Widget:
    """One ``_Draw*`` record.  ``command``/``width``/``label`` are present only
    when the record actually carries a relocated label pointer."""

    type: str
    offset: int
    x: int
    y: int
    size: int
    command: Optional[int] = None
    width: Optional[int] = None
    label: Optional[str] = None
    #: A label the host supplies, such as ``_okString``; the text is not in the file.
    label_import: Optional[str] = None
    #: The label slot points at zeroed storage the host fills in at run time.
    runtime_text: Optional[bool] = None
    unknown: str = ""


@dataclass
class MenuEntry:
    """One ``.MNU`` node.  Only the text is pinned."""

    offset: int
    label: str
    accelerator: Optional[str] = None
    pointers: List[int] = field(default_factory=list)
    unknown: str = ""


@dataclass
class UiTable:
    name: str
    kind: str                       # 'dialog' or 'menu'
    rect: Optional[Tuple[int, int, int, int]] = None
    handler: Optional[str] = None
    widgets: List[Widget] = field(default_factory=list)
    entries: List[MenuEntry] = field(default_factory=list)
    imports: List[str] = field(default_factory=list)
    unresolved: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        out: dict = {"name": self.name, "kind": self.kind}
        if self.rect is not None:
            x, y, w, h = self.rect
            out["header"] = {"x": x, "y": y, "w": w, "h": h}
        if self.handler:
            out["handler"] = self.handler
        if self.widgets:
            out["widgets"] = [
                {k: v for k, v in vars(w).items() if v is not None and v != ""}
                for w in self.widgets
            ]
        if self.entries:
            out["entries"] = [
                {k: v for k, v in vars(e).items() if v not in (None, "", [])}
                for e in self.entries
            ]
        if self.imports:
            out["imports"] = self.imports
        if self.unresolved:
            out["unresolved"] = self.unresolved
        return out


@dataclass
class _Section:
    va: int
    size: int
    data: bytes


def _sections(data: bytes, name: str) -> Dict[str, _Section]:
    if data[:2] != b"MZ" or len(data) < 0x40:
        raise MNUError(f"{name}: not an MZ image")
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe : pe + 4] not in SIGNATURES:
        raise MNUError(f"{name}: signature {data[pe:pe + 4]!r} not recognised")
    machine, count = struct.unpack_from("<HH", data, pe + 4)
    if machine != 0x14C:
        raise MNUError(f"{name}: machine {machine:#x} is not i386")
    optional = struct.unpack_from("<H", data, pe + 20)[0]
    sections: Dict[str, _Section] = {}
    for index in range(count):
        entry = pe + 24 + optional + 40 * index
        raw, vsize, va, rsize, roff = struct.unpack_from("<8sIIII", data, entry)
        length = min(vsize, rsize) if rsize else vsize
        if roff + length > len(data):
            raise MNUError(f"{name}: section exceeds file")
        sections[raw.rstrip(b"\0").decode("latin1")] = _Section(
            va, vsize, data[roff : roff + length]
        )
    if "CODE" not in sections:
        raise MNUError(f"{name}: no CODE section")
    return sections


def _relocations(sections: Dict[str, _Section], code: _Section) -> List[int]:
    """Offsets within CODE that hold a pointer, from the .reloc base table."""
    reloc = sections.get(".reloc")
    if reloc is None:
        return []
    offsets: List[int] = []
    cursor = 0
    while cursor + 8 <= len(reloc.data):
        page, size = struct.unpack_from("<II", reloc.data, cursor)
        if size < 8 or cursor + size > len(reloc.data):
            break
        for entry in range(cursor + 8, cursor + size, 2):
            value = struct.unpack_from("<H", reloc.data, entry)[0]
            if value >> 12 == 0:
                continue                    # ABSOLUTE: a padding entry
            address = page + (value & 0xFFF)
            if code.va <= address < code.va + code.size:
                offsets.append(address - code.va)
        cursor += size
    return sorted(set(offsets))


def _imports(sections: Dict[str, _Section]) -> Tuple[Dict[int, str], List[str]]:
    """Map each import address table slot to the name it resolves to."""
    idata = sections.get(".idata")
    if idata is None:
        return {}, []
    def read(va: int, length: int) -> bytes:
        start = va - idata.va
        if start < 0 or start + length > len(idata.data):
            raise MNUError(f"import pointer {va:#x} outside .idata")
        return idata.data[start : start + length]

    slots: Dict[int, str] = {}
    names: List[str] = []
    cursor = 0
    while cursor + 20 <= len(idata.data):
        lookup, _stamp, _chain, _name, first = struct.unpack_from("<5I", idata.data, cursor)
        if lookup == 0 and first == 0:
            break
        table = first or lookup
        slot = table
        while True:
            entry = struct.unpack_from("<I", read(slot, 4))[0]
            if entry == 0:
                break
            # IMAGE_IMPORT_BY_NAME: a two-byte hint, then the NUL-terminated name.
            raw = read(entry + 2, min(64, idata.va + len(idata.data) - entry - 2))
            name = raw.split(b"\0", 1)[0].decode("latin1")
            slots[slot] = name
            names.append(name)
            slot += 4
        cursor += 20
    return slots, sorted(set(names))


def _thunks(code: _Section, slots: Dict[int, str]) -> Dict[int, str]:
    """Six-byte ``jmp [IAT]`` stubs; the only machine code in the file."""
    found: Dict[int, str] = {}
    for offset in range(len(code.data) - 5):
        if code.data[offset] != 0xFF or code.data[offset + 1] != 0x25:
            continue
        target = struct.unpack_from("<I", code.data, offset + 2)[0]
        if target in slots:
            found[code.va + offset] = slots[target]
    return found


def _string(code: _Section, va: int) -> Optional[str]:
    offset = va - code.va
    if offset < 0 or offset >= len(code.data):
        return None
    end = code.data.find(b"\0", offset)
    if end < 0 or end - offset > MAX_LABEL:
        return None
    raw = code.data[offset:end]
    if not raw or any(byte < 0x09 or byte > 0x7E for byte in raw if byte != 0x01):
        return None
    return raw.decode("latin1")


def _is_blank(code: _Section, va: int, length: int = 16) -> bool:
    offset = va - code.va
    if offset < 0 or offset >= len(code.data):
        return False
    return not any(code.data[offset : offset + length])


def _widgets(
    code: _Section, relocs: Sequence[int], thunks: Dict[int, str]
) -> Tuple[List[Widget], List[str]]:
    def pointer_at(offset: int) -> int:
        return struct.unpack_from("<I", code.data, offset)[0]

    pointer = {offset: pointer_at(offset) for offset in relocs}
    # The operand of each ``jmp [IAT]`` stub is relocated too; it is code, not a record.
    in_thunk = {va - code.va + 2 for va in thunks}
    # A record starts at a relocated pointer to a thunk — except at the label slot
    # of the record already open, because a shared label such as "OK" is itself an
    # import (`_okString`) and so has a thunk of its own.
    starts: List[int] = []
    labels: Dict[int, int] = {}
    for offset in relocs:
        if not offset or offset in in_thunk:
            continue                       # the dialog handler, or a thunk operand
        if starts and offset == starts[-1] + LABEL_OFFSET:
            labels[starts[-1]] = offset
            continue
        if pointer[offset] in thunks:
            starts.append(offset)
            continue
        # A record whose class pointer is null still relocates its label slot, so
        # the record begins LABEL_OFFSET earlier. The host supplies the class for
        # these; QUIKMISS.DLG's wizard rows are all of this shape.
        candidate = offset - LABEL_OFFSET
        if candidate >= 0 and (not starts or candidate > starts[-1]):
            starts.append(candidate)
            labels[candidate] = offset
    unresolved: List[str] = []
    widgets: List[Widget] = []
    seen: Dict[Tuple[int, int], str] = {}
    # The record array ends where the string pool and the thunks begin.
    tail = min(
        [len(code.data)]
        + [va - code.va for va in thunks]
        + [pointer[slot] - code.va for slot in labels.values() if pointer[slot] not in thunks]
    )
    for index, offset in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else max(tail, offset)
        label = label_import = None
        runtime_text = False
        if offset in labels:
            target = pointer[labels[offset]]
            label_import = thunks.get(target)
            label = None if label_import else _string(code, target)
            if label is None and label_import is None:
                # A pointer into a zeroed run is storage the host fills in at run
                # time — an edit box, or a wizard row whose text is built per game.
                runtime_text = _is_blank(code, target)
                if not runtime_text:
                    unresolved.append(
                        f"label pointer at {labels[offset]:#x} does not read as text"
                    )
        widget = Widget(
            type=thunks.get(pointer_at(offset), "(host-supplied)"),
            offset=offset,
            x=struct.unpack_from("<h", code.data, offset + X_OFFSET)[0],
            y=struct.unpack_from("<h", code.data, offset + Y_OFFSET)[0],
            size=end - offset,
        )
        if offset in labels:
            widget.command = code.data[offset + COMMAND_OFFSET]
            widget.width = struct.unpack_from("<H", code.data, offset + WIDTH_OFFSET)[0]
            widget.label = label
            widget.label_import = label_import
            widget.runtime_text = runtime_text or None
            known = {X_OFFSET, X_OFFSET + 1, Y_OFFSET, Y_OFFSET + 1, COMMAND_OFFSET}
            known |= {WIDTH_OFFSET, WIDTH_OFFSET + 1, *range(LABEL_OFFSET, LABEL_OFFSET + 4)}
        else:
            known = {X_OFFSET, X_OFFSET + 1, Y_OFFSET, Y_OFFSET + 1}
        rest = bytes(
            code.data[offset + i]
            for i in range(4, min(end - offset, LABEL_OFFSET + 4))
            if i not in known
        )
        widget.unknown = rest.hex()
        # Two widgets at one position means the +4/+6 pair is not this class's
        # position; it is verified for _DrawAction and assumed for the rest.
        previous = seen.get((widget.x, widget.y))
        if previous and (widget.x or widget.y):
            unresolved.append(
                f"{widget.type} at {widget.offset:#x} decodes to the same position as {previous}"
            )
        seen[(widget.x, widget.y)] = f"{widget.type} at {widget.offset:#x}"
        widgets.append(widget)
    return widgets, unresolved


def _entries(code: _Section, relocs: Sequence[int]) -> List[MenuEntry]:
    """``.MNU`` nodes: a run of text, ``\x01``, the accelerator, then NUL.

    The nodes themselves are linked by relocated pointers whose meaning is only
    partly clear, so this pins the text and reports the rest.
    """
    pointers = [struct.unpack_from("<I", code.data, offset)[0] for offset in relocs]
    entries: List[MenuEntry] = []
    offset = start = 0
    text = lambda byte: 0x20 <= byte <= 0x7E or byte == 0x01  # noqa: E731
    while offset < len(code.data):
        if not text(code.data[offset]):
            offset += 1
            start = offset
            continue
        end = offset
        while end < len(code.data) and text(code.data[end]):
            end += 1
        run = code.data[start:end]
        if end < len(code.data) and code.data[end] == 0 and len(run) > 1:
            label, _, accelerator = run.decode("latin1").partition("\x01")
            entries.append(
                MenuEntry(
                    offset=start,
                    label=label,
                    accelerator=accelerator or None,
                    pointers=[p for p in pointers if p - code.va == start],
                    # The byte in front of a label is the node's flag/submenu field.
                    unknown=code.data[max(0, start - 1) : start].hex(),
                )
            )
        offset = end + 1
        start = offset
    return entries


def load_ui(path: str | Path) -> UiTable:
    file = Path(path)
    data = file.read_bytes()
    sections = _sections(data, file.name)
    code = sections["CODE"]
    relocs = _relocations(sections, code)
    slots, names = _imports(sections)
    thunks = _thunks(code, slots)
    kind = "menu" if not thunks else "dialog"
    table = UiTable(name=file.name, kind=kind, imports=names)
    if kind == "dialog":
        if len(code.data) >= HEADER_RECT + 8:
            table.rect = struct.unpack_from("<4h", code.data, HEADER_RECT)
        head = struct.unpack_from("<I", code.data, 0)[0]
        table.handler = thunks.get(head)
        table.widgets, table.unresolved = _widgets(code, relocs, thunks)
    else:
        table.entries = _entries(code, relocs)
        table.unresolved = [
            "menu node flag and submenu bytes are not decoded; see Docs/formats/mnu.md"
        ]
    return table


def main() -> None:
    parser = argparse.ArgumentParser(description="Decode .MNU / .DLG UI tables")
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--json", action="store_true", help="emit one JSON object per file")
    args = parser.parse_args()
    tables = [load_ui(path) for path in args.files]
    if args.json:
        print(json.dumps([table.to_dict() for table in tables], indent=1))
        return
    for table in tables:
        if table.kind == "dialog":
            rect = table.rect or (0, 0, 0, 0)
            print(f"{table.name}: dialog at {rect}, {len(table.widgets)} widgets")
            for widget in table.widgets:
                text = f' "{widget.label}"' if widget.label else ""
                width = f" w={widget.width}" if widget.width is not None else ""
                command = f" cmd={widget.command}" if widget.command is not None else ""
                print(
                    f"  {widget.offset:#06x} {widget.type:<18} x={widget.x:<4} y={widget.y:<4}"
                    f"{width}{command}{text}"
                )
        else:
            print(f"{table.name}: menu, {len(table.entries)} entries")
            for entry in table.entries:
                accelerator = f"  [{entry.accelerator}]" if entry.accelerator else ""
                print(f"  {entry.offset:#06x} {entry.label}{accelerator}")


if __name__ == "__main__":
    main()
