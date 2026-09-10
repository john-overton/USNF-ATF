# Retail format notes

Original engineering notes on the file formats found on the Jane's USNF'97
and ATF Gold CDs. Structure only; no retail bytes are reproduced here.
Tooling lives in `tools/retail/` (run `PYTHONPATH=tools/retail python3 -m
retail stats gameassets/usnf97` to regenerate the counts).

Coverage and reproducible review measurements: [phase 0 baseline](../baselines/phase-0.md). Decoded layouts do not imply complete semantic understanding or in-app support.

Counts are logical files, uncompressed bytes, from `python -m retail stats`
over the whole disc (ESA-embedded LIBs, root LIBs, and loose ESA files).

| Format | Status | Note | USNF'97 (files / bytes) | ATF Gold (files / bytes) |
|---|---|---|---|---|
| EALIB (`*.LIB`) | decoded | [ealib.md](ealib.md) | 6 archives | 6 archives |
| ESA (`SETUP.ESA`) | decoded | [esa.md](esa.md) | 16 entries | 18 entries |
| DCL (PKWare implode) | decoded | [dcl.md](dcl.md) | 3,965 LIB streams + 13 ESA | 6,070 LIB streams + 14 ESA |
| PAL | decoded | [pal.md](pal.md) | 1 / 768 | 1 / 768 |
| PIC | decoded | [pic.md](pic.md) raw rows or span sprites, optional embedded palette | 1,665 / 159,387,489 | 2,518 / 242,688,377 |
| FNT | decoded | [fnt.md](fnt.md) PE with one x86 routine per glyph | 12 / 151,552 | 12 / 161,792 |
| SH | partial, in progress | [sh.md](sh.md) drawing program; vertex indexing/export unresolved | 353 / 2,691,072 | 1,043 / 11,892,224 |
| PT | decoded | [pt.md](pt.md) text data language, C field names from ATF comments | 48 / 573,085 | 105 / 2,136,446 |
| OT | decoded | [object-types.md](object-types.md) | 110 / 136,820 | 130 / 249,396 |
| JT | decoded | [jt.md](jt.md) weapons | 90 / 244,428 | 120 / 551,214 |
| NT | decoded | [object-types.md](object-types.md) | 64 / 116,558 | 66 / 180,024 |
| SEE | decoded | [sensors.md](sensors.md) sensors; BRF `STORE_ITEM`, 25 statements | 50 / 23,768 | 43 / 31,530 |
| ECM | decoded | [sensors.md](sensors.md) countermeasures; 20 statements | 29 / 10,146 | 27 / 15,654 |
| GAS | decoded | [sensors.md](sensors.md) drop tanks; 5 statements | 4 / 819 | 4 / 967 |
| AI | partial, in progress | [ai.md](ai.md) plaintext source of the scripted AI VM | 8 / 62,841 | 9 / 81,664 |
| BI | partial, in progress | [ai.md](ai.md) compiled `.AI`; headerless Win32 PE against the EXE's own export table | 8 / 53,248 | 9 / 70,144 |
| M | partial | [mission.md](mission.md) plain text | 209 / 5,001,327 | 247 / 7,546,660 |
| MT | decoded | [mission.md](mission.md) plain text | 178 / 282,619 | 172 / 229,947 |
| T2 | partial | [t2.md](t2.md) header and cell grid; elevation units open | 11 / 1,463,944 | 4 / 580,526 |
| HUD | identified | PL/PE-like i386 plug-in; original practice HUD ([hud.md](hud.md)) | 16 / 65,536 | 37 / 170,496 |
| MNU / DLG | decoded | [mnu.md](mnu.md) data-only PL images; a widget table whose classes are `main.dll` imports | 10+76 / 364,544 | 12+88 / 477,184 |
| LAY | identified | **not UI**: sky and sea layer plug-ins naming `wave1.SH` and `ocean*06.PIC`, selected by a mission's `layer` key ([mission.md](mission.md)) | 8 / 147,456 | 20 / 378,880 |
| 5K / 8K / 11K | unknown | audio | 594+1+213 / 60,682,679 | 781+1+255 / 83,581,983 |
| XMI | unknown | music (XMIDI) | 104 / 495,528 | 102 / 534,492 |
| SEQ | unknown | | 104 / 10,347 | 32 / 6,434 |
| VDO / FBC / CB8 | unknown | video | 355+355+23 / 542,432,692 | 0+0+35 / 486,496,234 |

Other extensions seen, all unknown: `MM`, `PTS` (PE plug-in, not plane data), `MUS`,
`HGR`, `BIN`, `INF` (encyclopedia text), `SMS`,
plus the Windows `EXE`/`DLL`/`TXT`/`URL` loose files in the ESA.
`MC` (19 / 81,920 and 4 / 18,432) and `CAM` (3 / 16,384 and 3 / 26,112) are
also still unknown, but under active documentation alongside `AI`/`BI`; see
[ai.md](ai.md). `SEE`, `ECM` and `GAS` moved into the table above once
[sensors.md](sensors.md) decoded them.

Totals: USNF'97 4,921 files, 777.5 MB; ATF Gold 6,252 files, 843.9 MB.

The `SEE`, `ECM`, `GAS`, `AI`, `BI`, `MC` and `CAM` figures were measured
on 2026-09-09 over the locally extracted tree rather than by
`python -m retail stats`; they are uncompressed bytes on the same basis as
the rest of the table, but regenerate them with the stats command before
quoting them alongside the older rows.

## PALETTE.PAL first look

`PALETTE.PAL` in `USNF_2.LIB` decompresses to exactly 768 bytes and every
byte is in 0..63, so it is a classic 256-entry VGA DAC palette (6 bits per
channel; scale by 4 or `v * 255 // 63` for 8-bit). Entry 0 is black and
entries 1..15 are all (63, 0, 63), the usual magenta placeholder for the
reserved low slots. PIC decoding is implemented; runtime palette gaps remain (see [pic.md](pic.md) and [pal.md](pal.md)).

- [Flight audio](audio.md): PT-selected raw PCM, inferred rates and local playback.

- [Native ground and gear pitch](native-gear-pitch.md): speed-dependent display offset, terrain slope, F-14 zero field and 1,021 isolated x86 checks.

- [Sensors, countermeasures and drop tanks](sensors.md): `.SEE`/`.ECM`/`.GAS`, the shared `STORE_ITEM` shape, confirmed angle and range units, and how sensors bind to `.PT` hardpoints.

- [Damage model](damage.md): `hitPoints` ranges, `damage[0..4]` as damage inflicted, why there is no per-object armour and no per-aircraft subsystem table, and the damage→performance arithmetic recovered from the executables.
