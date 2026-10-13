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

## Missed defeat recovery

A missed network announcement previously left low-HP respawn forecasting in an unlimited wait. New rendered-text observation recognizes complete purple system defeat lines, ignores player-prefixed chat and repeated old text, and only ends matching hunts. Cached pre-existing bitmap text may still be unavailable to this observer. A 45-second unconfirmed defeat wait abandons the hunt and returns to farming through normal cleanup, without claiming a kill or entering loot mode. Regression coverage includes the reported Moth text, wrong-color and player-chat rejection, repeat suppression, unrelated jobs, and timeout boundaries.

## Loadout verification and 100-unit gap

The default border gap is now 100 units. Public profile parsing retains saved loadouts, allowing L+number selection to wait for matching equipped petals and retry up to three times. Runtime checks every three seconds compare fresh player profiles against the intended build, including explicitly tracked Antennae, magnet, and travel/farm reserve swaps; mismatches restore the saved preset and reapply those swaps. Checks run during navigation and Apex combat as well as farming/respawn transitions. Missing saved presets or stale profiles cannot prove loadout correctness and retain existing best-effort key behavior. Browser regressions cover preset parsing, retry success, persistent mismatch failure, and restoration of slots 1/3/4/5.

## Apex history and Ant Hell/Sewers build

A scrollable read-only text history retains the latest 200 observed Apex spawns for the current script session, newest first, with biome, local spawn-observation time, hunt status, and loot results. Inventory counts are decoded from profiles; positive same-account inventory differences during a loot visit are displayed as confirmed inventory gains during loot. They may include other nearby drops, so the UI does not claim exclusive boss attribution. Missing data is reported as unconfirmed.

Ant Hell and Sewers farming now verifies the requested active order: Stick, Stick, Stick, Stick, Powder, Antennae, Shell, Root, Magnet, Bulb. It restores L4 and corrects corresponding reserve swaps where possible. If L4 and paired reserve slots cannot supply this order, farming waits with an instruction to save the pictured setup as L4; the script cannot create arbitrary saved presets or move inventory items into unrelated slots. Existing petal rarities are preserved. Other maps retain their saved L4 build.

## Automatic farming recovery

Automatic farming enables a watchdog that detects stale player data after 20 seconds, persistently rejected stale mob data, and two minutes without movement or phase progress. Fresh Apex HP loss also counts as progress, preventing legitimate stationary fights from triggering recovery. Normal focus pauses and loot/death waits are excluded. Farming exceptions and rendering errors use the same recovery path.

Recovery releases inputs, invalidates the old run token, restores the saved farming map from an interrupted hunt, resets route/calibration caches and temporary obstacles, and restarts farming after an increasing 1–30 second delay. Manual Stop, Close, or changing the target cancels pending retries. Five attempts within ten minutes pause recovery with a status message; unavailable equipment, lost connectivity, login prompts, or browser failure may still require user action. The script cannot fix every external failure. Browser regressions cover stall/data detection, input release, cancellation, retry bounds, and cache reset followed by a farming restart.

## Farming preset change

Normal Ant Hell and Sewers now use L5 for farming, verification, recovery, and the return from Apex hunting. Save the requested farming layout as L5 in those two maps. Fire/Termite Ant Hell and other maps continue using L4. Regression coverage checks each map’s preset choice.

Normal Ant Hell/Sewers L5 validation now checks both rows from the screenshot: active Stick, Stick, Stick, Stick, Powder, Antennae, Shell, Root, Magnet, Bulb; reserve Shell, Powder, Powder, Powder, Stick, Stick, Magnet, empty, empty, Shell. Paired swaps must produce both rows correctly. Missing or incorrectly placed reserve petals prompt saving the full pictured L5 layout. Existing rarities are preserved. Regression coverage checks a full match, incorrect reserve rejection, and paired restoration.
