"""Export the retail menu artwork, layouts and sounds as one attributed bundle.

Mirrors `retail.cockpit`: the media stays on the user's disc, and what leaves
here is a JSON manifest the engine validates before it trusts a byte of it (see
`engine/src/data/retail-menu.ts`). Nothing retail is committed.

The layouts come from `retail.mnu`, so the buttons land where `CHOOSEAC.DLG`
says rather than where they look about right. The chrome is the nine-slice
`ACTION*` strip the original composites at run time, which is why the background
art has no buttons drawn into it at all.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .audio import decode_pcm
from .mnu import load_ui
from .pic import KIND_RAW, load_base_palette, load_pic, to_png

GAMES = {"usnf97": "USNF", "atf-gold": "ATF"}

#: Screen id -> (dialog file or None, background .PIC or None). A screen with no
#: dialog is background only; there is no retail aircraft chooser to recover.
SCREENS: Dict[str, Tuple[Optional[str], Optional[str]]] = {
    "main-menu": ("CHOOSEAC.DLG", "CHOOSEAC.PIC"),
    "quick-fight": ("QUIKMISS.DLG", "QUIKMISS.PIC"),
    "paused": ("BRIEFSCR.DLG", "BRIEFSC3.PIC"),
    "loadout": ("LOADORD.DLG", "ORD_KITT.PIC"),
    "debrief": (None, "DEBSC1.PIC"),
}

#: Sprite id -> state -> .PIC. `ACTION0..3` and `ACTIOD0..3` are four variants of
#: the same button whose meaning is **not** decoded: measured on the local media,
#: `ACTION0M`..`ACTION3M` draw 30, 18, 16 and 14 opaque rows inside boxes 30, 30,
#: 28 and 26 tall, which reads as a size set rather than as hover/pressed states.
#: Only the pair the file names pin is exported — the enabled button and its
#: disabled twin, at the full 30-row size that matches the recovered 32 px row
#: pitch. That reading is corroborated on the artwork: the button well drawn into
#: CHOOSEAC.PIC averages (172, 188, 144), ACTIOD0M averages (147, 155, 108) and so
#: blends into it, while ACTION0M averages (212, 196, 163) and stands proud of it.
#: Hover and pressed are left to CSS rather than guessed at.
BUTTON_STATES = {"normal": "ACTION0", "disabled": "ACTIOD0"}
BUTTON_PARTS = {"action-left": "L", "action-middle": "M", "action-right": "R"}

#: Our name -> the retail sample. The `&` set in the second LIB is the menu bank.
SOUNDS = {
    "click": "&CLICK.11K",
    "button": "&BUTTON.11K",
    "toggle": "&TOGGLE1.5K",
    "reject": "&SQACK1.5K",
    "arm-weapon": "&ARMWPN.5K",
    "arm-rounds": "&ARMBLLT.5K",
    "fuel": "&ARMDRIP.11K",
}

LIMITATIONS = [
    "Widget positions are the recovered .DLG values; only classes carrying a text label have a verified x/y pair (Docs/formats/mnu.md).",
    "ACTION0..3 and ACTIOD0..3 are four variants of the same button; measured opaque row counts (30, 18, 16, 14) read as a size set, not as hover and pressed states, so only the enabled button and its disabled twin are exported. Which of the pair is disabled is read from mean colour against the button well drawn into the background art, not decoded.",
    "Proportional retail menu fonts are not part of this bundle; menu text is drawn with the app's own font.",
    "Sample rates follow the file extension convention; the executable's mixer rates are not recovered.",
]


class MenuExportError(ValueError):
    pass


def _image(path: Path, palette: List, name: str) -> dict:
    pic = load_pic(str(path))
    if pic.width > 1024 or pic.height > 1024:
        raise MenuExportError(f"{name}: {pic.width}x{pic.height} exceeds the bundle's image cap")
    png = to_png(pic, palette if pic.kind == KIND_RAW and not pic.palette else palette)
    return {
        "source": path.name,
        "width": pic.width,
        "height": pic.height,
        "pngBase64": base64.b64encode(png).decode("ascii"),
    }


def _widgets(dialog) -> List[dict]:
    return [
        {
            "type": widget.type,
            "x": widget.x,
            "y": widget.y,
            "width": widget.width if widget.width is not None else 0,
            "command": widget.command,
            "label": widget.label,
        }
        for widget in dialog.widgets
    ]


def export(source_root: Path, game: str) -> Tuple[dict, dict]:
    """Return the (screens, sounds) manifests for one game's local media."""
    if game not in GAMES:
        raise MenuExportError(f"unknown game {game}")
    prefix = GAMES[game]
    art = source_root / game / f"{prefix}_1.LIB"
    data = source_root / game / f"{prefix}_2.LIB"
    for folder in (art, data):
        if not folder.is_dir():
            raise MenuExportError(f"missing local media: {folder}")
    palette = load_base_palette(str(data / "PALETTE.PAL"))
    hashes: Dict[str, str] = {}

    def record(path: Path) -> Path:
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        return path

    screens: Dict[str, dict] = {}
    for screen, (dialog_file, background_file) in SCREENS.items():
        entry: dict = {"source": dialog_file or (background_file or ""), "widgets": []}
        if dialog_file:
            path = data / dialog_file
            if not path.is_file():
                continue
            dialog = load_ui(record(path))
            if dialog.rect is None:
                raise MenuExportError(f"{dialog_file}: no dialog rect")
            x, y, width, height = dialog.rect
            entry["rect"] = {"x": x, "y": y, "width": width, "height": height}
            entry["widgets"] = _widgets(dialog)
        else:
            # A background-only screen still needs a rect; use the whole screen.
            entry["rect"] = {"x": 0, "y": 0, "width": 640, "height": 480}
        if background_file:
            path = art / background_file
            if path.is_file():
                entry["background"] = _image(record(path), palette, background_file)
        screens[screen] = entry

    sprites: Dict[str, List[dict]] = {}
    for sprite, part in BUTTON_PARTS.items():
        states = []
        for state, stem in BUTTON_STATES.items():
            path = art / f"{stem}{part}.PIC"
            if not path.is_file():
                continue
            states.append({"state": state, "image": _image(record(path), palette, path.name)})
        if states:
            sprites[sprite] = states

    clips: Dict[str, dict] = {}
    # Store thumbnails used by the three currently importable aircraft. They are
    # optional: another title or incomplete media can still draw text-only cards.
    weapon_palette = palette
    palette_file = art / "AR_BACK.PIC"
    if palette_file.is_file():
        weapon_palette = load_base_palette(str(record(palette_file)))
    for name in ("AIM54C", "F250", "AIM120", "AIM9M", "MK82", "F150", "LAU61", "AGM65G", "AIM9X"):
        path = art / f"${name}.PIC"
        if path.is_file():
            sprites[f"store-{name.lower()}"] = [{"state": "normal", "image": _image(record(path), weapon_palette, path.name)}]
    for name, filename in SOUNDS.items():
        path = data / filename
        if path.is_file():
            clips[name] = decode_pcm(record(path).read_bytes(), path.name)

    bundle = {
        "version": 1,
        "source": {"game": game, "sha256": hashes},
        "screens": screens,
        "sprites": sprites,
        "limitations": LIMITATIONS,
    }
    sounds = {"version": 1, "source": {"game": game}, "sounds": clips}
    # TITLE95.SEQ explicitly plays this PCM recording during the title sequence.
    # Reusing it for the activity menu is an authored choice, not XMI playback.
    theme = source_root / game / f"{prefix}_8.LIB" / "^MF.11K"
    if game == "usnf97" and theme.is_file():
        sounds["music"] = decode_pcm(record(theme).read_bytes(), theme.name)
    return bundle, sounds


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=Path("extracted"))
    parser.add_argument("--game", default="usnf97", choices=sorted(GAMES))
    parser.add_argument("--out", type=Path, required=True, help="output directory")
    args = parser.parse_args()
    bundle, sounds = export(args.source_root, args.game)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "screens.json").write_text(json.dumps(bundle, separators=(",", ":")) + "\n")
    (args.out / "sounds.json").write_text(json.dumps(sounds, separators=(",", ":")) + "\n")
    widgets = sum(len(screen["widgets"]) for screen in bundle["screens"].values())
    print(
        f"Menu bundle: {len(bundle['screens'])} screens, {widgets} widgets, "
        f"{len(bundle['sprites'])} sprites, {len(sounds['sounds'])} sounds"
    )


if __name__ == "__main__":
    main()
