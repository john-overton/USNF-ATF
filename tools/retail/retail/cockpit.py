"""Export reviewed retail cockpit frames; never execute the native HUD module."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
from pathlib import Path

from .pic import load_pic, load_base_palette, to_png, KIND_SPANS, Pic
from .png import encode_png

# A4E.PT explicitly selects f4.HUD, whose strings name ~f4h.
# ATF F31.PT has no HUD field; F31.HUD names its corresponding ~f31h frame.
RECIPES = {
    'f14': ('usnf97', 'USNF', 'F14', 'F14.HUD', 'USNF97 F-14 cockpit'),
    'a4e': ('usnf97', 'USNF', 'F4', 'F4.HUD', 'USNF97 shared F-4 cockpit selected by A4E.PT'),
    'x31': ('atf-gold', 'ATF', 'F31', 'F31.HUD', 'ATF-GOLD X-31 cockpit'),
}


def extract_mirrors(pic: Pic, seeds: list[tuple[str, int, int]]) -> list[dict]:
    """Flood reviewed flat mirror fills; retain their exact silhouette as an alpha mask.

    Seeds are authored identification hints, not recovered native mirror cameras.
    Refuse a leak into a large region rather than remove unrelated cockpit art.
    """
    if pic.mask is None:
        raise ValueError('Mirror extraction requires a transparent cockpit frame')
    mask = bytearray(pic.mask)
    mirrors = []
    for name, sx, sy in seeds:
        start = sy * pic.width + sx
        if not (0 <= sx < pic.width and 0 <= sy < pic.height) or not mask[start]:
            raise ValueError('Mirror seed outside opaque frame')
        color = pic.pixels[start]
        todo, region = [start], set()
        while todo:
            at = todo.pop()
            if at in region or not mask[at] or pic.pixels[at] != color:
                continue
            region.add(at)
            if len(region) > pic.width * pic.height // 8:
                raise ValueError('Mirror fill leaked outside reviewed size bound')
            x, y = at % pic.width, at // pic.width
            if x: todo.append(at - 1)
            if x + 1 < pic.width: todo.append(at + 1)
            if y: todo.append(at - pic.width)
            if y + 1 < pic.height: todo.append(at + pic.width)
        if not region:
            raise ValueError('Empty mirror fill')
        x0 = min(i % pic.width for i in region)
        x1 = max(i % pic.width for i in region) + 1
        y0 = min(i // pic.width for i in region)
        y1 = max(i // pic.width for i in region) + 1
        rgba = bytearray((x1 - x0) * (y1 - y0) * 4)
        for at in region:
            mask[at] = 0
            offset = ((at // pic.width - y0) * (x1 - x0) + at % pic.width - x0) * 4
            rgba[offset:offset + 4] = b'\xff\xff\xff\xff'
        png = encode_png(x1 - x0, y1 - y0, bytes(rgba), 'RGBA')
        mirrors.append({
            'id': name, 'x': x0 / pic.width, 'y': y0 / pic.height,
            'width': (x1 - x0) / pic.width, 'height': (y1 - y0) / pic.height,
            'maskPngBase64': base64.b64encode(png).decode('ascii'),
        })
    pic.mask = bytes(mask)
    return mirrors


def export_cockpit(source_root: Path, aircraft: str) -> dict:
    game, lib, stem, module, label = RECIPES[aircraft]
    art = source_root / game / f'{lib}_1.LIB' / f'~{stem}H.PIC'
    palette = source_root / game / f'{lib}_2.LIB' / 'PALETTE.PAL'
    hud = source_root / game / f'{lib}_2.LIB' / module
    if f'~{stem.lower()}h'.encode() not in hud.read_bytes().lower():
        raise ValueError(f'{hud}: expected cockpit frame reference not present')
    pic = load_pic(str(art))
    if pic.kind != KIND_SPANS or (pic.width, pic.height) != (1280, 490):
        raise ValueError(f'{art}: expected reviewed transparent 1280x490 high-resolution frame')
    seeds = [] if aircraft == 'x31' else [('center', 640, 40), ('left', 180, 240), ('right', 1100, 240)]
    if aircraft == 'a4e':
        seeds = [('center', 640, 40), ('left', 230, 240), ('right', 1050, 240)]
    mirrors = extract_mirrors(pic, seeds)
    png = to_png(pic, load_base_palette(str(palette)))
    return {
        'version': 1, 'aircraftId': aircraft, 'label': label,
        'width': pic.width, 'height': pic.height,
        'pngBase64': base64.b64encode(png).decode('ascii'),
        'mirrors': mirrors,
        'source': {
            'game': game, 'frame': art.name, 'hud': hud.name,
            'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (art, palette, hud)},
        },
        'limitations': [
            'Static forward cockpit artwork; native HUD DLL and gauges are not executed. Mirror fill masks are extracted for original rear-view rendering.',
            'Viewport scaling and continuous look offsets are original presentation, not recovered native projection.',
            'Side and rear views have no reconstructed cockpit geometry.',
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--aircraft', choices=RECIPES, required=True)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = export_cockpit(args.source_root, args.aircraft)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Cockpit: {result["label"]} -> {args.out}')


if __name__ == '__main__':
    main()
