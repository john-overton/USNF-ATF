# Terrain color maps and shoreline materials

## Implemented color-map trial — 2026-09-09

The optional `colorMaps` manifest entries supply summer, spring, autumn and winter
RGBA atlases. The terrain helper's **Ground colors** selector switches between
available palettes and satellite imagery without resetting the camera. The trial
defaults to summer when available. Only the selected atlas is retained; switching
disposes the previous texture. Legacy datasets keep their satellite/elevation
appearance. Credits follow the selected source's display requirement.

The pipeline averages known land samples from the source atlas into a 1024-axis
grid, excluding manifest water, and estimates four continuous appearance weights:
dark vegetation, light vegetation, dry cover and pale ground. These are RGB-based
artistic approximations, not verified land-cover, soil, geology or shoreline types.
Water texels receive nearby land colors only as an underlay; water classification
and physical terrain remain unchanged. A small island can share a color-map pixel
with surrounding water; this broad map does not describe its fine shoreline.

`color-maps/weights.npz` stores four uint8 weights per pixel, class order and theater
grid identity. `color-maps/palettes.json` stores explicit `#RRGGBB` colors for each
appearance class and season. `color-maps/provenance.json` records source/weight
hashes and the palette values. These authoring files remain in the generated
source dataset; the installer copies the declared runtime RGBA atlases.

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline color-maps extracted/terrain/ukraine-palettes/manifest.json --size 1024
# Edit color-maps/palettes.json, then rebake from the existing weights:
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline color-maps extracted/terrain/ukraine-palettes/manifest.json --weights extracted/terrain/ukraine-palettes/color-maps/weights.npz --palettes extracted/terrain/ukraine-palettes/color-maps/palettes.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-palettes/manifest.json
```

The second command needs no satellite pixels. It preserves the quantized weights
exactly and applies the palette directly, rather than tinting an earlier seasonal
image. Winter is an authored appearance, not a simulated snow or weather model.
The 1024 × 1024 RGBA map uses approximately 5.33 MiB of GPU mip storage plus
4 MiB of retained CPU bytes. The 6142 × 6144 satellite equivalent uses about
191.94 MiB GPU plus 143.95 MiB CPU. Switching back to the large satellite atlas
still incurs its one-time decode/upload cost.

## Elevation-based snow — 2026-09-11

Optional `--snow theaters/salt-lake-snow.json` blends each seasonal palette toward
an editable snow RGB color. Every band is `[snow begins, full snow]` in meters
above sea level. A smoothstep transition avoids hard elevation stripes. The
greater of the season and permanent-band weights wins, so the permanent band
guarantees snow even if a season's snowline is raised above it.

Salt Lake's artistic starting bands are winter 1800–2400 m, spring 2400–3100 m,
autumn 2800–3400 m, summer 3300–3800 m; permanent 3800–4100 m. These are not
measured snowlines. No slope/aspect, snowfall, glacier, lake ice or snow-depth
simulation is implied. Water rendering/classification and flight contact do not
change. Other theaters remain unchanged unless explicitly baked with snow rules.

Heights are bilinearly sampled from verified 100 m base DEM chunks at atlas texel
centers. Missing coverage fails the bake. At the default Salt Lake resolution,
one color texel spans about 843 m, so tiny summit snow patches can be missed.
Rules and a digest of the contributing DEM records are recorded in provenance.
Rebaking still reuses the original appearance weights, never a previously snowed
image. Always pass `--snow` to retain snow on subsequent rebakes; omitting it
explicitly produces the original palette-only appearance.

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline color-maps extracted/terrain/salt-lake/manifest.json --weights extracted/terrain/salt-lake/color-maps/weights.npz --palettes extracted/terrain/salt-lake/color-maps/palettes.json --snow theaters/salt-lake-snow.json
```

## Date-driven satellite appearance — 2026-09-11

Select **satellite** in Ground colors and change the live Date control. The source
atlas stays loaded; viewer-local shader uniforms continuously interpolate artistic
tints at day 15 (gray winter), 110 (light-green spring), 205 (darker-green summer)
and 290 (brown autumn), with smooth year-wrap interpolation. The clock contributes
its fractional day. Southern latitudes shift the cycle by half a year. An RGB
vegetation hint reduces greening on deserts, rock and salt flats; this is not
land-cover classification or a reconstruction of historical seasonal imagery.

Salt Lake also interpolates snowlines from the shared `theaters/salt-lake-snow.json`
rules, plus the permanent-snow override. Runtime snow uses morphed/seam-adjusted
terrain height, not source-photo brightness, and blends toward pure-white albedo
before lighting. Sun, moon, clouds and slope shading still affect snow; it does
not glow at night. A snow-only post-light white balance removes 90% of the warm
color cast and multiplies brightness by 1.4 before fog/tone mapping, preserving
relative slope shading with no emissive floor. This is an artistic readability
adjustment, not a physical snow reflectance model. Palette bakes now also use
pure white and were reinstalled.
The runtime adds no height, collision, water/ice changes or extra texture atlas.
It applies only to satellite mode; manually selected seasonal bakes remain fixed
and are not double-tinted. Other theaters receive the date tint, but have no
runtime snow unless a theater-specific rule is added. The photo can still contain
source-date snow/shadows; this pass does not reconstruct what lies beneath them.

## Shoreline ribbons — first pass, 2026-09-09

`pipeline shorelines` derives continuous ribbons from the existing sea-level water
polygons, including dry-hole rings. It never creates water from elevation. Collinear
points are removed without moving the boundary; cumulative distance survives all
later terrain-triangle and tile splits. Landward cross-sections use bounded miter
joins and shrink around narrow land, crossing boundaries or enclosed water bodies.
Residual unsafe junctions collapse locally. Theater clipping edges have zero width.

The initial artistic classes are **unknown, beach, rock, cliff, marsh**. Inland
Sentinel RGB and relief measured over 300 m from existing 100 m height chunks
suggest a class. Donor rays crossing another water edge are rejected. These are
appearance hints, not verified geology or land cover: confidence is 0–0.55 for
automatic samples. A green, flat coast is only a marsh *candidate*. Cloud remnants,
coastal color repair and limited DEM resolution also affect the hints.

Default nominal landward widths are 12 / 25 / 18 / 10 / 25 m respectively. Sharp
joins can extend up to twice nominal width, and narrow land can be much smaller.
The approximately 100 m source water outline cannot establish 25 m geographic
accuracy. Classes interpolate between neighboring cross-sections, avoiding hard
color jumps. Coast-wide overrides are editable by stable `water-body-id/ring-index`:

```json
{
  "water-1-0/0": { "kind": "beach", "widthMeters": 25 }
}
```

Use a ring ID from `shorelines/ribbons.json.gz`; ring 0 is the exterior and later
indices identify holes. Current overrides apply to a whole ring, so geographic
subsegment editing remains future authoring work. The producer validates override
IDs, kinds and widths (greater than zero, at most 100 m) before output writes.

```sh
# Work in an isolated copy of the accepted palette dataset:
cp -cR extracted/terrain/ukraine-palettes extracted/terrain/ukraine-shorelines
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline shorelines extracted/terrain/ukraine-shorelines/manifest.json
# Edit shorelines/overrides.json, then rebake:
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline shorelines extracted/terrain/ukraine-shorelines/manifest.json --overrides extracted/terrain/ukraine-shorelines/shorelines/overrides.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-shorelines/manifest.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe-shorelines extracted/terrain/ukraine-shorelines/manifest.json
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine-shorelines --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
```

The runtime clips ribbons onto the actual terrain triangles and evaluates the same
morphed/seam-adjusted heights with barycentric weights. Tile borders retain shared
positions, along-coast UVs and material weights. Short bank faces seal the cut down
to sea level; they are visual geometry, not measured cliff profiles or new contact
surfaces. Existing height files, water polygons and flight-contact sampling stay
unchanged.

A local 512² mask prevents coarse terrain from poking through known sea around
ribbon patches. Only wholly wet texels can discard terrain: all cells touched by
water boundaries, including sub-texel islands, receive a conservative dry margin.
This deliberately retains a small coarse-ground fringe instead of opening holes.
Mask spacing depends on the displayed patch size; this is not a replacement for
precise terrain/water intersection geometry. Source fades remain complementary.

The five material rows live in `engine/src/terrain/assets/shoreline.png` (384 × 640
RGBA, 2026-09-09 revision). Each row spans the cross-section from the sea side to
the land side with the water line at about 0.41; the ribbon geometry now extends
seaward by `SEA_RATIO` (0.7) of its landward offset and floats at least 0.5 m so the
sea half sits on the water plane. Rows repeat every 128 m along the coast, blend
across the ribbon by class weight, and carry alpha that fades to zero at both
edges. The generator is `tools/terrain/bake-shoreline-texture.py`; it colors the
user's own grayscale paintings from ignored `gameassets/textures/` (beach, rocks,
cliff, marsh) with per-class land ramps and a water-to-foam ramp toward the
engine's water color. No source satellite or retail pixels are in that texture.
`RIBBON_WIDTH_SCALE` (3) is a visual test widening beyond the pipeline's safety
analysis; overlaps on narrow land are expected until it is retuned or moved into
the pipeline. The seasonal color maps remain independent.

Meshes fade from 12 to 18 km distance. Construction is limited to one candidate
patch per frame; active ribbon/mask resources have a 32 MiB estimate budget and
16,000-vertex per-patch cap. The global shoreline index is retained separately.
Budget rejection is remembered until capacity drops, preventing repeated build/
dispose loops. Diagnostics expose shoreline triangles, bytes, pending and omitted
patches. Very complex patches can omit detail; finite raster margins and remaining
source-LOD shifts are first-pass limits, not proof of seamless coast geometry at
all scales. Linux remains deferred; see the current phase 3 baseline for actual
Mac visual/performance acceptance.
