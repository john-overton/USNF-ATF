# MNU and DLG (`*.MNU`, `*.DLG`)

Status: **decoded** for the widget table, medium-high confidence; the `.MNU`
node links and flag bytes are **partial**. Decoder:
`tools/retail/retail/mnu.py`; batch:
`python3 -m retail.mnu <files...>` prints, `--json` emits the table.

Verified 2026-09-10 against local media: 182 of the 186 `.MNU` and `.DLG`
files across both discs decode, yielding 1,113 widget records, 113 labels
that live in the file, 242 labels the host supplies, and 62 menu entries. The
remaining four are ATF network dialogs (`NETIPX2`, `NETJOIN`, `NETNEW`,
`NEWNET`) that have no `CODE` section at all — only `.reloc` and a `$$DOSX`
stub — and therefore carry no table.

This note corrects [README.md](README.md), which listed `MNU`/`LAY`/`DLG` as
one row of "unknown — UI". `.LAY` is not UI at all; see the bottom of this
file.

## What these files are

They are not text and not the BRF language. Each is a data-only Phar Lap
`PL\0\0` image of the same family as [fnt.md](fnt.md) and `.HUD`: an `MZ`
stub, a `CODE` section holding the table, `.reloc` listing every pointer in
it, and — for `.DLG` — an `.idata` importing from `main.dll`.

`main.dll` is not a file on either disc. As [ai.md](ai.md) established for the
AI plug-ins, it names the host executable's own export table, so the imports
resolve inside the running game.

The only x86 in the file is a run of six-byte `jmp [IAT]` thunks at the end of
`CODE`. That matters more than it sounds: **the imported name is the widget
class.** A record points at a thunk, the thunk points at an import address
table slot, and the slot names `_DrawAction`. Nothing has to be inferred from
the shape of the data.

Classes observed, with record counts across both discs:

| Class | Records | Class | Records |
|---|---|---|---|
| `_DrawAction` | 307 | `_DrawText320` | 16 |
| `_DrawText` | 270 | `_DrawDial` | 16 |
| (host-supplied, see below) | 202 | `_DrawDial320` | 12 |
| `_DrawListBox` | 70 | `_DrawCheck320` | 12 |
| `_DrawCheck` | 56 | `_DrawCancel320` | 6 |
| `_DrawRocker` | 48 | `_DrawDone320` / `_DrawOK320` | 4 each |
| `_DrawSliderVert` | 20 | `_DrawYes320` / `_DrawNo320` | 2 each |
| `_DrawLight` | 19 | `_DrawToggle`, `_DrawSwitch320` | 2 each |
| `_SliderVert320` | 18 | `_DrawFormattedText` | 2 |
| `_DrawEditBox` | 17 | `_DrawMissList`, `_DrawCampaignList` | 2 each |

The `320` suffix marks the low-resolution variants, exactly as the `00`/`01`/
`11` font suffixes do. Three imports are shared *strings* rather than draw
routines — `_okString`, `_cancelString`, `_exitString` — and appear in a
record's label slot, not at its head.

Some files also import a per-screen setup routine that the dialog header
points at: `_ChoosePreload`, `_GrafPrefPreload`, `_SndPrefPreload`,
`_MultiPreload`, `_Info640Preload`, `_Info2640Preload`, `_TopCenterDialog`.

## Dialog layout

```
CODE+0x00  u32   pointer to the screen's setup routine, or 0
CODE+0x04  i16   x        the dialog rect, in 640x480 screen pixels
CODE+0x06  i16   y
CODE+0x08  i16   width
CODE+0x0a  i16   height
CODE+0x15  ...   the widget records
           ...   the string pool
           ...   the jmp [IAT] thunks
```

One widget record:

```
+0x00  u32   pointer to a thunk: the widget class. May be 0.
+0x04  i16   x, relative to the dialog rect
+0x06  i16   y
+0x11  u8    command id, as passed back to the screen's handler
+0x12  u16   width in pixels
+0x14  u32   pointer to the label
```

**Record boundaries are measured, not assumed.** Every pointer in the table is
listed in `.reloc`, so a relocated dword that resolves to a thunk starts a
record, and the dword at `start+0x14` is that record's label. The decoder
walks the relocation table rather than striding a fixed 38 bytes, because the
size differs by class: 38 bytes is the common `_DrawAction` record, but
`LOADORD.DLG` packs a `_DrawRocker` in 39 and a `_DrawDial` in 31, and the
last record in a file is followed by the string pool 34 bytes in.

A record whose class pointer is 0 is drawn by a class the host chooses. The
24-page quick-mission wizard is built this way: `QUIKMISS.DLG` has two real
`_DrawAction` buttons and 61 further records whose class is null and whose
label slot points at an 80-byte run of zeroes — storage the game fills in at
run time. The decoder reports these as `(host-supplied)` with
`runtime_text: true` rather than inventing a class for them.

### What is verified, and what is not

`CHOOSEAC.DLG` (USNF'97) decodes to the main menu, and the rect it gives lands
on the panel drawn in the already converted `CHOOSEAC.png` (640x480). Measured
by counting differing pixels between adjacent rows and columns of that image:
the strongest vertical edge in the picture is at x=379 (448 of 480 rows differ)
with its pair at x=616-617, and the top edge is at y=80, where exactly 238
pixels change across the dialog's own width. Left, right and top therefore
match `(379, 80, 238, 361)` to the pixel, and the bottom edge falls at y=438-441
against the predicted 441.

The button rows cannot be checked the same way, and an earlier claim that they
matched the artwork pixel for pixel was too strong: the background art contains
**no** button graphics at all. The `ACTION0L/M/R`..`ACTION3L/M/R` nine-slice
sprites are composited at run time, so the `y` values below rest on the record
layout alone.

```
dialog (379, 80, 238, 361), 8 widgets, all _DrawAction, x=31, width=180
y =  24  Play Single Mission        y = 170  Start New Campaign
y =  56  Create Quick Mission       y = 202  Continue Old Campaign
y =  88  Create Pro Mission         y = 234  View Pilot Records
y = 120  Replay Last Mission        y = 285  Reference
```

`LOADORD.DLG` decodes to the ordnance bar: dialog `(115, 356, 470, 102)`, two
`_DrawRocker`, two `_DrawDial`, and `_DrawAction` "Fly" (command 1, width 80)
and "Select Plane" (command 2, width 100).

**The `x`/`y` pair at `+0x04`/`+0x06` is confirmed only for the classes that
carry a text label**, where the recovered positions match the converted
artwork. `LOADORD.DLG`'s two dials both decode to `(33, 38)`, which cannot be
right for two visible dials, so those classes evidently keep their position
somewhere else in the record. The decoder reports this as an `unresolved`
note whenever two widgets land on one position, and emits the bytes it has not
accounted for as `unknown` hex. 26 records across both discs trip that check.

Every other field in a record is unknown. In particular nothing is yet known
about tab order, the enabled/disabled state, the sprite set a widget uses, or
how a `_DrawDial`'s range is expressed.

## Menu bars (`.MNU`)

`.MNU` files import nothing. They hold menu-bar trees: nodes linked by
relocated pointers, each carrying an inline NUL-terminated label in which
`\x01` separates the accelerator. `MAINMENU.MNU` gives "Exit to
Windows" / "Alt-F4", "Campaign", "Replay This Mission", "Exit Campaign".
`ARMPLANE.MNU` gives "Weapons", "Unload All" and — the reason this file
matters to the loadout screen — "Cheat (load anything anywhere)", which is
direct evidence that the original enforces a per-station compatibility rule
(see [pt.md](pt.md), where the hardpoint `flags` mask is still undecoded).

**The node structure itself is only partly clear.** Each node begins with two
relocated pointers followed by a run of zeroes, a byte at `+0x18`, and the
label some way further in; the byte immediately in front of a label varies
(`0x1e`, `0x3f`) and is presumably a flag or submenu field. The decoder pins
the text, the accelerator and the pointers that target each node, and reports
the preceding byte raw. It does not guess at the tree.

## `.LAY` is not UI

`DAY1.LAY`, `DAY2.LAY`, `CLOUD1.LAY`, `FOG1.LAY` and their `V` variants — 8
files in USNF'97, 20 in ATF Gold — are `MZ` images that name `wave1.SH` and
`ocean*06.PIC` in their data. They are sky and sea layer plug-ins: what a
mission's `layer day2.LAY 3` key selects ([mission.md](mission.md)). There are
no UI `.LAY` files on either disc.
