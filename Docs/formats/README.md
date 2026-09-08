# Retail format notes

Original engineering notes on the file formats found on the Jane's USNF'97
and ATF Gold CDs. Structure only; no retail bytes are reproduced here.
Tooling lives in `tools/retail/` (run `PYTHONPATH=tools/retail python3 -m
retail stats gameassets/usnf97` to regenerate the counts).

Counts are logical files, uncompressed bytes, from `python -m retail stats`
over the whole disc (ESA-embedded LIBs, root LIBs, and loose ESA files).

| Format | Status | Note | USNF'97 (files / bytes) | ATF Gold (files / bytes) |
|---|---|---|---|---|
| EALIB (`*.LIB`) | decoded | [ealib.md](ealib.md) | 6 archives | 6 archives |
| ESA (`SETUP.ESA`) | decoded | [esa.md](esa.md) | 16 entries | 18 entries |
| DCL (PKWare implode) | decoded | [dcl.md](dcl.md) | 3,271 LIB streams + 13 ESA | 5,142 LIB streams + 14 ESA |
| PAL | unknown (768 bytes; 256 × RGB, 6-bit values 0..63) | | 1 / 768 | 1 / 768 |
| PIC | unknown | | 1,665 / 159,387,489 | 2,518 / 242,688,377 |
| FNT | unknown | | 12 / 151,552 | 12 / 161,792 |
| SH | unknown | 3D shapes | 353 / 2,691,072 | 1,043 / 11,892,224 |
| PT | unknown | plane types | 48 / 573,085 | 105 / 2,136,446 |
| OT | unknown | object types | 110 / 136,820 | 130 / 249,396 |
| JT | unknown | | 90 / 244,428 | 120 / 551,214 |
| NT | unknown | | 64 / 116,558 | 66 / 180,024 |
| M | unknown | missions | 209 / 5,001,327 | 247 / 7,546,660 |
| MT | unknown | mission text | 178 / 282,619 | 172 / 229,947 |
| T2 | unknown | terrain | 11 / 1,463,944 | 4 / 580,526 |
| HUD | unknown | | 16 / 65,536 | 37 / 170,496 |
| MNU / LAY / DLG | unknown | UI | 10+8+76 / 511,000 | 12+20+88 / 856,064 |
| 5K / 8K / 11K | unknown | audio | 594+1+213 / 60,682,679 | 781+1+255 / 83,581,983 |
| XMI | unknown | music (XMIDI) | 104 / 495,528 | 102 / 534,492 |
| SEQ | unknown | | 104 / 10,347 | 32 / 6,434 |
| VDO / FBC / CB8 | unknown | video | 355+355+23 / 542,432,692 | 0+0+35 / 486,496,234 |

Other extensions seen, all unknown: `MM`, `PTS`, `MC`, `AI`, `BI`, `MUS`,
`SEE`, `CAM`, `HGR`, `ECM`, `BIN`, `GAS`, `INF` (encyclopedia text), `SMS`,
plus the Windows `EXE`/`DLL`/`TXT`/`URL` loose files in the ESA.

Totals: USNF'97 4,921 files, 777.5 MB; ATF Gold 6,252 files, 843.9 MB.

## PALETTE.PAL first look

`PALETTE.PAL` in `USNF_2.LIB` decompresses to exactly 768 bytes and every
byte is in 0..63, so it is a classic 256-entry VGA DAC palette (6 bits per
channel; scale by 4 or `v * 255 // 63` for 8-bit). Entry 0 is black and
entries 1..15 are all (63, 0, 63), the usual magenta placeholder for the
reserved low slots. PIC decoding is a separate task.
