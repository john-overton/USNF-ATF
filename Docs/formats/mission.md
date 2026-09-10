# M and MT: missions and mission text

Status: **partial** (both are plain text; `.M` structure and object list
decoded, keyword semantics mostly inferred; `.MT` fully readable). Reader:
`tools/retail/retail/mission.py`.

    PYTHONPATH=tools/retail python3 -m retail.mission extracted/usnf97/USNF_2.LIB/KURIL01.M
    PYTHONPATH=tools/retail python3 -m retail.mission extracted/usnf97/USNF_2.LIB/KURIL01.MT
    PYTHONPATH=tools/retail python3 -m retail.mission --theaters extracted/usnf97/USNF_2.LIB extracted/atf-gold/ATF_2.LIB

## `.M` mission

CRLF text, one `key value...` per line, terminated by a single NUL byte.
Three flavours by first line: `textFormat` (full missions, 180 in USNF'97,
185 in ATF Gold), `obj` (quick-mission templates `~Q*.M`, no header) and
`quickPos` (3 / 6 files). Numbers are decimal or `$hex`.

Header keys (order as in the files):

| key | example | meaning |
|---|---|---|
| `textFormat` | | flag |
| `brief`, `briefmap`, `selectplane`, `armplane` | | which pre-flight screens to show |
| `map` | `kurile.T2` | terrain, see [t2.md](t2.md); `~ukr6.t2` / `$bal2.t2` are campaign variant names of the base terrain |
| `layer` | `day2.LAY 3` | sky and sea layer plug-in ([README](README.md)); `.LAY` is not UI |
| `clouds`, `wind` | `16493`, `-76 20` | weather |
| `view` | `1842 377487 314572` | initial camera |
| `sides2` / `sides3` | 19 hex bytes on following tab-indented lines | side / nationality table |
| `time` | `7 1` | start hour, day? |
| `usGroundSkill`, `usAirSkill`, `themGroundSkill`, `themAirSkill` | `1` | AI skill |
| ATF only: `allowrearmrefuel`, `revive`, `historicalera`, `freeflight`, `printmissionoutcome`, `endscenario` | | |

Then `obj` blocks until a line holding `.`:

```
obj
	type AV8.PT              object type file: .PT plane, .NT ship/vehicle/site, .OT static
	pos 106417 0 426251      x, altitude (ft), z in world units (8192 per terrain cell)
	angle 0 0 0
	nationality2 0           (or `nationality`)
	flags $4017
	speed 0
	alias -2                 negative id referenced by waypoint blocks
	controller $80           present on the player's aircraft
	name Player
	skill 3
	react $c000 $0 $0
	searchDist 25
	wing 5 0 / wng 1 0 2048 0
	preferredTargetId ...
	.
```

Then `waypoint2 N` blocks, each a list of `w_index`, `w_flags`, `w_goal`,
`w_next`, `w_pos2 a b x alt z`, `w_speed`, `w_wng`, `w_react`,
`w_searchDist`, `w_preferredTargetId`, `w_name \x01text\x01` records, closed
by `w_for <alias>` and `.`. `w_for` names the object the route belongs to,
so the reader attaches the waypoints to that object. A typical full mission
has 25 to 60 objects and 20 to 30 routes; `KURIL01.M` has 28 objects (one
LHD, one battleship, one cruiser, Harriers, 15 Su-24 and 4 Su-27).

## `.MT` mission text

Plain text with dot-directives: `.section N` splits the file (1 title block:
short id, title, "Single Mission" / campaign label; 2 briefing; 3 debrief on
success; 4 debrief on failure), `.header` / `.body` / `.center` / `.left` /
`.underline` / `..underline` (off) / `.page` are formatting. Briefings are
structured as SITUATION, MISSION OBJECTIVE, ORDER OF BATTLE, THREAT
SUPPRESSION DATA paragraphs. The file count (177 / 171) matches the count of
`textFormat` missions minus a few demo files.

## Missions per theater

From `map` lines, resolved to the base terrain; "quick" are the `~Q*.M`
templates whose theater is the letter after Q (K, U, V, B, E, F).

| theater | game | missions with `map` | quick templates | T2 files | grid |
|---|---|---|---|---|---|
| Kuril Islands | USNF'97 | 41 | 8 | 1 | 32 x 32 tiles, 256 x 256 cells, 5% land |
| Ukraine | USNF'97 | 103 (17 base + 86 on `~UKR1..8`) | 11 | 9 identical | 26 x 25, 208 x 200, 77% land |
| North Vietnam | USNF'97 | 36 | 10 | 1 | 25 x 25, 200 x 200, 59% land |
| The Baltics | ATF Gold | 50 | 9 | 1 | 32 x 32, 256 x 256 |
| Egypt | ATF Gold | 51 | 8 | 1 | 26 x 25, 208 x 200, 72% land |
| France | ATF Gold | 25 | 9 | 1 | 26 x 25, 208 x 200, 93% land |
| Vladivostok | ATF Gold | 58 | 0 | 1 | 26 x 25, 208 x 200, 64% land |
| Kuril / Ukraine / Vietnam | ATF Gold | 0 / 1 / 0 | 8 / 11 / 17 | none on disc | leftover USNF templates |

USNF'97 has 209 `.M` files: 180 full, 29 quick templates. ATF Gold: 247,
185 full, 62 templates (36 of them for theaters ATF Gold does not ship).

## Theater recommendation for phase 2

Ukraine has by far the most retail missions (103 plus 11 quick templates,
half the USNF'97 campaign) on the mid-size 520 x 500 km grid, and 77% of it
is land, which is what the terrain pipeline actually has to render. Kuril
Islands has 41 missions on the largest grid but is 95% open sea, so it
exercises the water plane far more than the terrain renderer, and Vietnam
(36) is the smallest and least dense. Recommendation: **Ukraine first**, not
the plan's default Kuril; Kuril second because it is the cheapest terrain to
stream once the water plane exists.
