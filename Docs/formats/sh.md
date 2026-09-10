# SH: shape research and neutral F-14 projection

## 2026-09-10: exterior cockpit cutouts and authored surface placement

Inspected local F14/A4/F31 atlas artwork and polygon mappings show palette index
255 as the cutout background on textured subtypes 0x4c/0x6c (canopy frames and
pilot/seat billboards). `sh_static.py` now groups these separately and exports alpha
zero for that index; `RetailAircraft` uses alphaTest 0.5 with normal opaque depth
writes. Other textured subtypes remain opaque: 0xee/0xed also reference index 255,
but have distinct fallback-color semantics that are still unresolved. Never key RGB
white globally; other palette entries can be intentionally opaque white. This is
an observed material interpretation, not recovered native renderer parity.

The authored F14 flap hinge now follows the aft quarter of the tapered wing to the
tip break, instead of a constant-width strip ending early. The A4 wing eligibility
test excludes narrow root sidewalls while preserving outboard aileron panels. X31
elevons now cover the inboard trailing edge as well as outboard tabs. Source neutral
geometry and UV area are conserved; none of these hinge changes recovers native
animation. Thick-wing hinge closure and other texture-dispatch details remain
approximate. Current imported PNG cockpit masks were already transparent; they
are separate from these exterior material corrections.

Reproduction and screenshots: [phase 6 baseline](../baselines/phase-6.md).

Reviewed 2026-09-08 against `31f733e` and locally extracted media. Implementation:
[`tools/retail/retail/sh.py`](../../tools/retail/retail/sh.py). This describes the
current decoder and its limits, not a complete format specification.

## 2026-09-09: bounded nearest-detail F-14 development export

New implementation: [`sh_static.py`](../../tools/retail/retail/sh_static.py).
It projects a single neutral static pose from locally extracted USNF97 media;
it does not load or execute the retail x86 code and is not a general SH renderer.
The older `sh.py` graph census and OBJ route remain partial, as described below.

```sh
PYTHONPATH=tools/retail python3 -m retail.sh_static extracted/usnf97/USNF_2.LIB/F14.SH --pal extracted/usnf97/USNF_2.LIB/PALETTE.PAL --out extracted/flight/f14.json
python3 -m unittest discover -s tools/retail/tests -p test_sh_static.py
```

Confirmed export corrections and bounded interpretations:

- `0x82`'s +4 uint16 is a destination in eight-byte shared vertex slots.
  Updates preserve the other slots. Each emitted polygon captures its resolved
  positions immediately, so later writes cannot alter earlier geometry.
  Unresolved references are errors, not silently omitted faces.
- Following `0x38` only as an unconditional jump had skipped most fuselage
  polygons. In the observed F-14 program its forward target also identifies a
  structured subtree end. The static projection reads the enclosed records,
  including both painter-order sides, and ends the scope at its final `0x1e`.
  This establishes a useful static projection, **not full interpreter call or
  visibility semantics**. Inner `0x1e` markers do not truncate an enclosing scope.
- Nearest-detail projection stays on distance-test/far-model fallthrough and
  ends before following LOD definitions. It does not superimpose distant models.
- `0xc4` selects a part block through its final relative offset, with a translated
  coordinate frame. Its translation words are renderer X/up/forward, whereas
  vertex records store X/forward/up. Child scopes restore the caller's placement.
  The two verified neutral F-14 wing parts become separate meshes with pivots.
- Opaque `0xf0` records accept only relocated `push target; push thunk; ret`
  reentry patterns and a bounded observed word-compare guard. A zero-state
  static branch is selected; arithmetic that would patch animation angles is
  not run. Unknown guards/reentries fail. This is not an x86 virtual machine.
- Stored +Z is vertical and +Y points toward the nose. The earlier bounds-based
  axis concern below is superseded for this F-14. Export maps to +X right,
  +Y up, -Z nose. Longitudinal length is normalized to **19.1 m as a presentation
  choice**, not a decoded unit conversion. Vertical zero is preserved; centering
  on the high tail fins would incorrectly lower the belly into the runway.
- Palette faces retain colors; textured faces carry atlas pixel UVs and decoded
  PIC RGBA. Meshes split by component and textured/untextured material. Texture
  orientation/material dispatch is only partially understood. The exported V
  convention currently uses `DataTexture.flipY=false`. A packaged flip-Y
  experiment misapplied atlas art; this does not establish every UV subtype.
  F-14 subtype `0x44` specifically identifies the two rear nozzle disks, now
  separated as `exhaust-left-textured` and `exhaust-right-textured`. Their baked
  hot-core art must not masquerade as a stopped engine: the flight adapter uses
  authored dark material when not in afterburner. Authentic material dispatch
  and heat animation remain unrecovered.

The local export contains **186 resolved polygons / 326 triangles**, eight meshes
(body and two wings split by material, plus separate exhaust disks), and the locally decoded 256×411
atlas. The standalone oblique preview shows a recognizable fuselage, nose,
canopy silhouette, twin tails, stabilizers and wings. Parser success, this shape
recognition, packaged texture review and original game parity remain distinct.
No model, palette or texture bytes are committed or packaged.

JSON contract is version 1: nonindexed triangle `positions` in body-space metres,
matching per-vertex sRGB `colors`, optional `uvs` and
`texture: {width,height,rgba}`, plus `parts` with unique `name` and body-space
`pivot`. A renderer places each part group at its pivot and subtracts that pivot
from its vertices. Root arrays may be empty. `source` records input hashes and
projection scope; `limitations` states what is not recovered.

Ten synthetic regressions cover shared-buffer replacement, structured scope
and LOD isolation, translated parts, missing indices, controlled truncation,
opaque-code rejection, target bounds, and the optional-UV/vertical-origin export contract and separated special exhaust material. No fixture contains retail geometry.
The neutral projection does **not** recover original gear/hook animation,
wing-sweep scheduling, textures' original shading, or flight coefficients.
Flight-test gear/hook animation may be original adapter geometry and must be
identified that way. Other aircraft and ATF are not accepted by this experiment.

## Container and implemented records

The parser reads an MZ stub, the header pointer at file offset `0x3c`, and a
`PL` or `PE` signature. It reads standard 40-byte section-table entries for
`CODE`, optional `.idata`, and `.reloc`. The drawing program is in `CODE`.
The relocation parser collects HIGHLOW entries; the walker uses them to find
interpreter re-entry targets in opaque x86 blocks. It does not execute retail code.

| Record | Current interpretation | Confidence / limitation |
|---|---|---|
| `0x82` | 6-byte header, uint16 count at +2, followed by count signed int16 XYZ triples | Vertex payload reproduces aircraft-shaped bounds. Header uint16 at +4 is currently ignored; likely significant for indexing. |
| `0xfc` | Polygon subtype, flags, palette value, optional normal/centroid, indices, optional UVs | Parses records, but vertex references are not reliably resolved. UVs are not exported to OBJ. |
| `0xbc` | Selected point/line subtypes | Only a subset emits primitives. |
| `0x42` | NUL-terminated source name starting at +2 | Used for diagnostics. |
| `0xe2` | Texture name in a 14-byte field starting at +2 | Names collected; textures are not applied. |
| Relative jumps / state tests | Traverse both branches; collect reachable records | No selected animation state or single LOD is reconstructed. |
| `0xf0` | Opaque x86 stub; locate push/push/ret patterns using relocations | Heuristic; resets current table to -1. |

Other opcodes are skipped using inferred sizes in `FIXED`, `BC_SIZES`, and
jump tables. A traversal with no stops does not establish those semantics.

## Reproduced F-14 export failure

Current output: 34 vertex tables, 533 vertices, 105 parsed polygons, **8 OBJ
faces**, no unknown-opcode stops. Of the 97 omitted polygons, 96 have indices
outside the assigned table and one has no assigned table (`table == -1`).
`to_obj` already computes an OBJ offset for every table; the earlier progress
log's suggestion that it only exports one table was a hypothesis, not the cause.

A concrete lead: table 0 has 189 vertices. Table 1's ignored header field is
1512 (`189 * 8`), its payload contains six vertices, and polygon references
include 189 through 194. Table 2's field is 1560 (`195 * 8`), with references
starting at 195. These observations suggest addressing into a shared vertex
buffer in eight-byte slots. This has **not** been implemented or validated as
the full indexing rule; branch-local updates and animation may also matter.

Additional unresolved issues:

- The walker tracks visited byte offsets without including incoming vertex
  state. A shared block reached with different state may need revisiting.
- x86 re-entry discards the current table. Determine which state actually survives.
- OBJ swaps stored `(x, y, z)` to `(x, z, y)`. The source claims this makes Y
  vertical, while F-14 stored bounds are thinnest in Y. Axis orientation, scale,
  winding, and normals still need visual validation.
- `all_tables` is an unused exporter argument. Materials are palette colours;
  exported geometry does not yet preserve texture mapping or animation.
- Some bounds checks happen after indexed reads; malformed data can raise
  `IndexError`/`struct.error` rather than a controlled `SHError`.
- No SH unit tests exist. No recognizable F-14 viewer result has been verified.

## Coverage and next experiment

See [phase 0 baseline](../baselines/phase-0.md) for reproducible census commands.
All 353 USNF shapes and 1,043 ATF shapes parse without exceptions in this census,
but only 316 / 980 respectively have polygons and no stops. USNF stops at `0x6e`
and `0x13`; ATF also stops at `0xe8`. Zero-polygon results are unclassified,
not confirmed successful billboard conversions.

Next: model the `0x82` destination offset explicitly, test shared vertex-buffer
updates with synthetic records, and report resolved/dropped primitives. Validate
F-14 geometry visually from several angles with outputs in `extracted/`, then
repeat across both titles. Do not close phase 0 on polygon counts alone.

The batch CLI returns 1 when any shape lacks polygons or has stops; single-file
conversion can return 0 despite incomplete geometry. Always inspect exported
face counts and diagnostics as well as the exit status.

## 2026-09-09: movable exterior from the neutral F-14 projection

`retail.sh_static` now separates the existing retail horizontal tailplanes and
subdivides neutral wing, fin and aft fuselage faces into an **authored rig**.
This reuses source vertices, palette colors and interpolated texture coordinates;
it does not recover the original aircraft's animation program. The neutral body
faces are replaced by their partition, so an opening surface does not have an
unchanged duplicate underneath. Opposite-facing faces and logo overlays already
present in the source remain present. Subdivision retains the original polygon
address for diagnostics.

The local USNF97 model exports 186 original polygons, 206 partition polygons,
364 triangles and 18 material groups. Parts include left/right tailerons,
left/right rudders, left/right trailing-edge flaps and upper/lower aft speedbrake
panels. Tailerons mix pitch and differential roll in the new renderer; the
result is not evidence that USNF uses that same mixer. We have not decoded an
original aileron animation. The flap partitions follow the existing wing sweep.

The version-1 development JSON part contract gains optional `rotationAxis`
(engine XYZ, normalize before rotating) and `parent` (exact part name).
`pivot` continues to be in aircraft body space even when a parent is specified;
loaders subtract the parent's pivot from the child placement. The flap parents
are `wing-left-color` / `wing-right-color`. Hinge boundaries, tailplane pivots,
angle limits, speed scheduling and mixing are **original approximations fitted
to the inspected neutral exterior**, not decoded native constants. The slightly
nonplanar low-polygon fins prevent a single rigid hinge from exactly matching
every interpolated fin/texture boundary.

Bounded static inspection found wing state guards using several unknown state
words and jumps to alternate vertex tables. The meanings of those state words,
conditional drawing links and their relation to flap/spoiler controls are still
unknown. Only neutral C4 wing pivots are established; no retail x86 was executed.
Do not describe these authored cuts as recovered original control-surface code.

Verification: `python3 -m unittest discover -s tools/retail/tests -p test_sh_static.py`
passes 13 tests on this Mac: 12 synthetic tests plus one local-media test (which
explicitly skips if the extracted F14 is absent). The local test checks all eight
logical surface groups and conservation of each original face's oriented area
vector through partitioning. Synthetic tests cover UV interpolation, no duplicate
coplanar face, and replacing a tailplane face without mutating its source.
`bun test engine/src/flight/control-surfaces.test.ts` passes two tests / ten
expectations checking actual Three.js point rotations for pitch, roll, rudder,
flaps and outward speedbrake motion. Renderer screenshots and keyboard integration
are separate acceptance evidence in the flight documentation.


## 2026-09-09: ATF-GOLD A4 and F31 static projection

The existing bounded neutral projection walks ATF-GOLD A4.SH (234 source faces,
371 exported triangles) and F31.SH (224 source faces, 350 exported triangles).
A4 emits two material groups; F31 emits ten including neutral articulated parts.
Both retain retail textures and use the ATF-GOLD palette. Export naming and
presentation length are explicit CLI parameters; F-14 surface partitioning,
wing renaming and nozzle classification remain restricted to F14.SH.

Mac Electron chase screenshots show distinct recognizable A-4 and X-31 exteriors.
This does not validate full SH control flow, native animation or thrust-vectoring
semantics. Non-F14 exports state their static limitation without claiming the
F-14 authored rig. See [aircraft setup](../phase-4-aircraft.md).


## 2026-09-09: authored A4/F31 surface partitions and scale comparison

A4/F31 exports now partition selected existing triangles into a visual rig.
The source's fan triangulation is retained before any clipping: four nonplanar
A4 faces changed slightly when cut as quads (largest scalar-area difference
0.4061 native square units). The regression checks per-source-face scalar area,
area vector, UV area, palette/texture identity and bounds. Final exports contain
482 A4 / 398 F31 triangles versus the earlier static 371 / 350.

F31 articulated parts near forward=54 supply the canards; rear articulated
parts remain static nozzle paddles. Wing trailing strips and the fin are
partitioned for elevons/rudder with authored hinges. A4 uses separate elevator,
aileron, flap, rudder and lateral-brake regions. No SH opcode semantics changed.
Original coordinates/UVs are conserved in neutral; hinge axes and control mixing
are presentation choices, not recovered SH/native animation laws.

F31/F31E/F31V/F31F share 62 native units of wingspan and 22 of canard span.
The original 13.21 m length calibration undersized the model relative to local
F31.INF dimensions; no aspect-ratio corruption was found. The new optional
wingspan-based uniform scale records its reference and resulting span/length.
At 7.26 m wingspan, F31 is 14.988 m long with 2.576 m canard span. Nose/probe
interpretation and native unit scale remain uncertain. Different retail skins
do not fix the small source canard proportions. Measurements remain ignored in
`extracted/x31-review/measurements.json`; see [setup](../phase-4-aircraft.md).
