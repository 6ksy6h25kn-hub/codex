# Online Apex detection investigation

The user reported zero accepted world frames, 4,428 rejected updates, no mob records, and no rejection reason. This means searching had no world entities to inspect; route selection alone could not fix it.

## Confirmed client-format difference

Inspection of the currently served public client WebAssembly shows its opcode-5 world header uses:

- a 32-bit frame sequence, a 64-bit timestamp, and x/y floats;
- a one-byte group mask;
- optional HP/max-HP, shield/max-shield, and XP/level/stars groups;
- a petal-slot count and six-byte slot records;
- entity creation/delta counts and the entity stream.

The public entity stream differs too: each creation, delta, and removal section resets a cumulative unsigned-varint ID counter. Movement-only updates can use two signed 16-bit offsets at 1/32-unit resolution. Player metadata uses a 14-byte prefix plus a skin string, entity names are conditional on a flag, and delta health encoding is selected by the delta mask. The updated reader validates both public and legacy streams and reports the accepted entity layout.

The supplied offline client uses the older fixed header. The previous navigator only supported that older layout. The updated reader supports both and reports header versus entity rejection reasons. Missing optional fields retain prior state. Missing XP groups preserve newer profile totals.

## Independent improvements

- Reads the current tab's loaded WASM resource instead of assuming one deployment hostname.
- Supports compressed .wasm.bin assets and both flowrix.pro and flowrix.sussybite.dev.
- Reports which registry and packet layout are active.
- Can refresh incomplete entity records once through the spawn menu when headers work but entity snapshots are missing.
- Keeps existing biome-scoped sightings, Antennae, the 800-unit border gap, and farm/death loadout behavior.

## Validation so far

- 6,348 recorded legacy world frames pass.
- 815 recorded world frames converted to the public client's documented optional-header layout pass, including all mask combinations.
- Browser tests cover compressed asset discovery on both deployment hostnames, split transport frames, malformed header rejection, stats freshness, and unchanged legacy decoding.
- Extended native offline trials use converted navigator input while the native game receives its original traffic. Header-only and full-format fixtures are reported separately; neither is a live-server test.

The cause is supported by the public decoder and the reported counters, but live confirmation still requires an updated script running against the real server. Offline invulnerability tests do not demonstrate normal-damage survival.

## Additional fixes under test

- Variable-length type-7 effects now include their point-list byte and coordinates; eight captured Jungle frames that previously failed replay successfully with their original entity context.
- Layout selection verifies the complete entity stream when a public header could also pass legacy field checks. Temporary candidates cannot overwrite the selected position or XP.
- Uses server timestamps to derive movement when several packets arrive together.
- Visual confirmation follows fresh game-render observations, rather than requiring three consecutive browser animation frames.
- A bounded, local template matcher can recover Apex/name labels from an existing text atlas without sending images to another service. It stops probing when registry tracking already identifies the target.
- Missing mob records can trigger one snapshot refresh later in a hunt as well as at startup.

The bitmap matcher has fixture coverage; it is a supplementary fallback, not a replacement for validated network records. Native long-run findings are listed below.

## Search and freshness safeguards

- Requires a complete accepted world before an ambiguous startup header can publish coordinates or XP.
- Separates fresh player coordinates from accepted mob-frame freshness. A rejected mob stream cannot make old Apex positions look current. Long navigation and route-mob encounters pause as well as the outer hunt loop.
- Refreshes a substantially partial snapshot even if some fresh mobs are already known. A hunt that has searched for 15 seconds without any Apex sighting can also refresh once if unidentified records remain. This covers an Apex born before script installation.
- Measures Antennae scale from repeated terrain chunks in both screen axes. The camera may lead the player; the measurement checks the terrain lattice rather than assuming a centered camera. A changed view interrupts a long search route so coverage spacing can be rebuilt.
- Adds regression tests for actual public entity field order, variable IDs and removals, compact movement, both HP encodings, stale-route release, snapshot limits, and camera-offset measurements.

The full-format native fixtures convert header and entity encoding while retaining native world geometry. These are distinct from the earlier header-only conversions and from actual live-server sessions.

## Final validation and remaining limits

- 12 packaged browser regression tests pass, including current public profiles with numeric skin IDs, slot remaps, saved loadouts, XP, kills, and equipped slots.
- Nine native full-format fixtures completed 180 observations each, approximately 15 minutes per biome. They accepted **156,374 world frames with zero rejections and zero conversion failures**. [Detailed results](APEX-VALIDATION.json) distinguish fresh sightings from retained IDs.
- Legacy replay still covers 6,348 recorded frames, plus 815 optional-header conversions, all 71 public mob IDs, nine biome search geometries, and simulated hunt/death/loot/farm cycles.
- Lost-target search uses reachable, unique points ordered by walking distance. It checks the last known area for up to 60 seconds, then proceeds to wider search instead of repeatedly wrapping the same ring.
- Tiny labels under Antennae use font-aware spacing. Large health-bar captions cannot establish a screen position. Coverage uses the smaller viewport dimension, including narrow previews.
- Diagnostics now report live tracking separately from a retained entity ID, last-sighting age, radius, and whether the requested border gap may put the center beyond the measured view.

**These results establish parser compatibility in controlled fixtures, not reliable live Apex kills.** No completed hunt occurred in the extended invulnerable trials. Computer lost fresh visibility after retreat. A Jungle cold-search fixture did not find its administratively spawned target within its observation window; administrative spawning may differ from live boss scheduling, and route combat with the approximate build caused delays.

The configured gap remains 800 units from the border. Recorded gaps sometimes fell below that when bosses moved toward the player or exits were blocked. The controller attempts retreat; these tests do not establish normal-damage survival or guarantee the gap against game physics. Live browser testing remained unavailable in this environment because certificate validation blocked the game page.

## Compact update correction (October 13)

The reported live failure (491,561 rejected frames, no Apex records) exposed a decoder bug: public compact position flag 128 can coexist with angle, health, flags, radius, and player metadata. The decoder previously skipped these fields and lost packet alignment. It now reads all indicated fields after compact movement, and retains the established entity format rather than falling back to a different format on damaged frames.

The regression fixture exercises all 128 combinations of the remaining flag bits with compact movement, both HP encodings, and subsequent packets. Navigation now yields stale-world and snapshot outcomes to the hunt loop instead of indefinitely waiting inside movement or route combat. Tests verify released movement and snapshot recovery.

The earlier 156,374-frame native conversion trials emitted compact movement alone. They did not cover combined compact flags and therefore did not validate this case. This correction has controlled regression coverage; it has not been confirmed in a live account session. Reload the game and replace the previous script to discard records cached by the earlier decoder.

## Ultra+ search priority

Initial Apex searches now contain only reachable Ultra+ floor, regardless of the mob’s dedicated farming area. Expanded searches order all Ultra+ coverage before dedicated spawn areas, family spawn areas, and other biome floor. Fresh visible targets can still be tracked directly. Regression coverage checks initial exclusion of dedicated areas and Ultra+ precedence in expanded search.

## Jungle zone correction

The Jungle map names its difficulty-90 transition area `mythic-ultra zone`. Matching Ultra anywhere in a zone name incorrectly promoted the whole transition to rank 6. Full Ultra classification now requires an Ultra prefix; the mixed area remains rank 5 and the actual `ultra zone` remains rank 6. A browser regression checks those ranks and verifies Bush initial search points stay in the actual Ultra polygon.
