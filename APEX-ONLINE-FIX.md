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

## Entrance loadout retry correction

The screenshot check could fail even after the saved farming preset was loaded, causing every entrance pass to issue L5 again. Selection now reuses a fresh confirmed matching preset without sending another key sequence. Unavailable registry data or a screenshot mismatch reports an advisory and continues using the saved preset rather than trapping farming at the entrance. Actual saved-preset mismatches still receive retries and runtime repair. Regression coverage verifies repeated selection does not send another load command and reserve repairs retain their intended swaps.

## Ant Hell interior farming coverage

Ant Hell family patrols now append a repeated serpentine interior sweep with 600-world-unit coverage buckets to the existing corner points, plus center coverage. Points use reachable selected-zone floor with an inset and are deduplicated. This covers the middle on every patrol cycle instead of visiting the center only once on arrival. Termite’s marked second point is retained. Browser coverage checks interior distances, zone membership and unique points.

## Bounded loadout verification

Saved-loadout comparisons that never confirm no longer trap entrance navigation. After three completed key-selection attempts, the script reports an unconfirmed build and continues without that comparison guard until a later build selection. Runtime repairs are capped at two per selected build; persistent inconsistencies disable that guard with a warning. This prevents automatic loadout checking itself from repeatedly reloading presets. It does not prove the unconfirmed build matches the screenshot. Diagnostics expose warnings and unconfirmed-selection/repair counters. Regression coverage checks bounded fallback and repair suspension.

Ant Hell patrols are now capped at nine points: the four existing outer points, center, and up to four spread interior points. This replaces the dense 600-unit sweep. Termite’s marked second point remains intact. Regression coverage checks the nine-point cap, unique in-zone targets, and spread across the interior.

Ant Hell farming now restores the original four marked patrol points. Each patrol leg routes through the existing center before reaching the next point, crossing the middle repeatedly without adding numbered patrol points. Termite’s original marked second point remains. Regression coverage verifies four unique in-zone targets and center-first route composition.

Ant Hell now uses six patrol points: the original four outer points plus two points forming a horizontal middle row. The route crosses that row directly; the center detours have been removed. The middle pair is inserted after the first two original points, preserving Termite’s marked second point. Regression coverage verifies six unique in-zone targets and a separated middle pair at matching height.

The six-point Ant Hell patrol now follows the requested two-row arrangement: top left → top middle → top right → bottom right → bottom middle → bottom left. Original four corner positions and their spacing remain, with one midpoint added to each original row. The earlier extra middle row is removed. Regression coverage checks ascending top X, descending bottom X, row heights, and matching outer spacing.

## Sandstorm route targets

Apex travel no longer chooses sandstorms as route-clearing attack targets, and already selected sandstorms are released immediately. This is a type-based exclusion because ownership is not established by the current decoder; ordinary wild sandstorms are also excluded from route combat. Real Apex Sandstorm tracking and hunting remain unchanged. Regression coverage checks sandstorm rejection, normal hostile mob eligibility and early exit for a selected sandstorm.

## DPS handoff and reliability corrections

Switching to L3 can change the view and remove an Apex from the entity cache. The hunter now continues to reachable points around its last confirmed position, excludes already-arrived search cells, and only enters forced retreat when inside the safety radius. A blocked retreat returns control instead of waiting forever. Fresh equipped-slot evidence prevents an already equipped Antennae from being toggled out by key 1.

The public saved-preset wire keys use two banks: L3 is key 12 and L5 is key 14. L selections now compare the correct bank and zero-based digit index, addressing the underlying reload bug. This is confirmed by the native client keyboard/preset code and a public-profile regression.

Additional corrections pause movement on silent entity-stream loss, reacquire a fresh same-type Apex when a retained ID becomes invalid or its sole replacement has moved far away, and record actual conservative viewport footprints instead of treating entire unobserved search buckets as scanned. Pose timestamps keep stale velocity from inflating the safety gap or search prediction. Confirmed zero-HP evidence survives removal, including a zero-HP delta and removal in one accepted packet. Map resets clear that evidence.

Corpse travel and collection share a 90-second total deadline, and a stopped/cancelled loot visit cannot increment completed hunts. Repeated rendered defeat messages are deduplicated while retained on-screen, but can confirm a later appearance after the old message disappears.

The 35-test browser suite passes, including movement after a DPS visibility loss, already-equipped Antennae, exact L-bank preset keys, unreachable loot, cancellation, and silent stream recovery. Native normal-damage trials are tracked separately; these controlled regressions are not proof of flawless live hunting.


## Runtime petal IDs and combat recovery

Petal IDs now include generated mob eggs before sorting, matching the native client registry. Sorting only explicit petal definitions gave wrong IDs for Antennae and most pictured farming petals. Native observed IDs include Antennae 3, Stick 151, Powder 116, Shell 134, Root 125, Magnet 100 and Bulb 18. Registry proof is in APEX-PROTOCOL-NOTES.md.

Build selection and reserve swaps keep short retreat checks active while waiting for key chords and server confirmation. A player slightly inside a blocked grid cell can step toward adjacent open floor; that exception cannot cross a later wall or cut a blocked corner. Failed diagonals can use a safe single axis. Route clearing extends attack petals in the travel build without loading DPS outside Ultra merely to clear an ordinary mob.

Fresh zero player HP prevents build selection before death controls appear. Four deaths within ten minutes without recent observed boss damage abandon that hunt and return to farming. Recent boss damage permits continued retries. This does not guarantee survival against a particular Apex or make an insufficient DPS build effective.

## Unattended farming recovery

Automatic farming now enables “Continue automatic farming in background” by default. The setting applies to automatic farming, build selection and respawn clicks; disabling it restores focus pauses. A browser that freezes/discards the page, a sleeping machine, a stopped Replit host, or a disconnected game cannot be kept running by this in-page script.

An early farming-loop return schedules recovery instead of leaving a running flag with no controller. The watchdog also detects that state. Changing phase labels alone no longer hides a stationary stall. Rendering errors in the optional map preview are recorded without shutting down the farming controller.

The five-retry limit now enters a cooldown until the oldest attempt leaves the ten-minute window, then automatically retries farming. Stop, Close, Escape and a user target change still cancel pending restarts. Recovery reasons and the next retry time are included in diagnostics, with the last 20 events retained for the current session.

## Centipede body hunting

Garden Centipede, Desert Centipede and Jungle Evil Centipede jobs match both head and corresponding body IDs at Apex rarity in the selected realm. A dying head hands off to a surviving body; HP/damage prediction resets when the selected segment changes. Known bodies remain search targets when they leave view, and low HP on one segment no longer causes the entire chain to enter the defeat wait.

A defeat announcement does not end a centipede job immediately. Every observed segment must have confirmed zero-HP evidence, including an update and removal in one packet. After the last observed segment dies, a fresh reachable-floor search checks for additional bodies before entering loot. Blocked search floor or stale stream data cannot establish completion. The tracker groups Apex segments of the same variant in the realm because the packet reader does not expose a chain-owner ID; simultaneous same-variant chains are handled together. Drops near each observed segment corpse are eligible during the existing bounded loot visit.

## Latest validation — 2026-10-14

`npm test`: 51 tests passed, zero failed or skipped. Browser regressions exercise all three centipede variants, head announcements, untracked body zero-HP/removal packets, bodies lost from view, a full simulated head/body/tail hunt, background build/respawn input, cooldown retry, manual cancellation and unexpected farming-loop exits. These are controlled tests, not completed online Apex kills.

Earlier timed offline native trials totalled 34.17 minutes. Only 22.12 minutes began with a verified living placement and normal damage enabled. The Ant Hell public-world transcoding trial accepted 13,581 frames with zero rejected frames and 97,510 combined compact updates; it moved about 1,212 units between consecutive DPS samples while retaining active Antennae. Normal-damage trials still had deaths and no confirmed Apex kill or loot. The Garden case started at zero HP and is recovery-only evidence. Trial source hashes and limitations are retained in APEX-VALIDATION.json; those trials preceded the latest build-wait and unattended/centipede changes. No flawless live-hunting or one-hour normal-damage survival claim is established.


## Ant Hell patrol order update

The same six Ant Hell positions now follow the requested arrangement `1 4 5 / 2 3 6`: top left → bottom left → bottom middle → top middle → top right → bottom right, then back to 1. This changes their visit order while retaining the existing point positions and spacing. The focused Ant Hell patrol regression passes.


## Apex route avoidance in Ultra+ with L3

Ordinary-mob avoidance now applies while the Apex job uses L3 and the player is on Ultra+ floor. L2 movement keeps its direct route, including when crossing Ultra+ before the DPS handoff. Lower-difficulty floor does not enable ordinary-mob avoidance. Existing Apex border and projectile safety checks remain available during travel.

In the active avoidance mode, live ordinary mobs and NPCs receive a body-radius clearance of 180 units plus a low-health buffer and a limited fresh-motion buffer. Known `_pet` registry types are excluded; other ownership is not inferred. Moving threats reserve a short predicted path. The route checks current hazards every 150 ms, keeps the same destination when replanning, and short movement checks reject motion toward nearby threats even when the Apex is not currently visible. A player already inside a clearance area retains a starting floor cell and is directed outward. Route planning includes the same avoidance during the approach to a DPS stand-off point and L3 loot travel on Ultra+ floor.

The old ordinary-mob route-clearing fights have been removed. Blind search and travel fold attack petals rather than stopping to fight a blocker. A fully blocked corridor retains the safety mask and returns control for another route or search point. The script cannot guarantee survival against unseen attacks, latency or threats that are faster than the player.

`npm test`: 58 tests passed, zero failed or skipped. The new browser checks exercise actual simulated movement around stationary and newly arriving mobs, minimum clearance, nearby escape without a visible Apex, fresh versus stale prediction, projectiles lacking HP fields, a blocked corridor, direct L2 travel and L3/Ultra+ activation. Earlier DPS handoff, centipede, recovery, loadout, protocol and six-point Ant Hell regressions also pass. These controlled movement checks do not establish damage-free online Apex travel.

## L3 no-safe-floor approach wait

The earlier route could stay still after switching to L3 even when a physically clear approach existed. Regression fixtures reproduced a corridor sealed by overlapping extra clearance, a coarse grid attack position that stopped about 342 units from the boss border, and a destination that shifted during a wall detour. The grid planner also shrank mob obstacles near the player, allowing paths that the exact movement checks rejected repeatedly.

Planning now retains the full obstacle geometry. Continuous segment checks validate terrain, the configured Apex gap, ordinary-mob clearance and projected threat positions. Safe continuous segments connect the grid route to a precise attack position, avoiding unnecessary stand-off imposed by a snapped grid cell. A valid attack destination remains committed while the player walks toward it. A player starting inside an extra clearance area receives a safe outward escape before replanning.

If wider margins prevent a route or approach movement stays blocked, L3 tries two smaller caution levels. Ordinary-mob extra clearance changes from 180 to 120 to 80 units, with bounded health and motion additions. Additional Apex padding changes from 80 to 40 to 20 units, and its extra speed buffer is capped at 450, 200 and 80 units. The configured Apex border gap and the Apex low-health retreat distance remain lower bounds; projectile clearance is retained. These levels apply to the current hunt. Ordinary-mob avoidance still applies only to L3 on Ultra+ floor; L2 keeps direct travel.

The new behavioral checks cover a crowded but passable corridor, close approach without grid stand-off, a committed destination during a detour, escape from an initially overlapping comfort area, and the actual L2-to-L3 hunt control flow reaching an attacking position. The latter uses simulated movement and conditional simulated HP loss in a browser fixture; it does not establish a live-server kill or guarantee survival. Diagnostics now include the approach caution level, reason and selected attack position.

Validation: `npm test` completed with 64 passing tests, zero failures and zero skipped tests.


## Travel corner and moving-projectile stalls

A fast-travel browser fixture reproduced another stationary replan loop. The waypoint arrival tolerance skipped an inside turn before the player could see clear floor to the next segment. Replanning selected the same snapped source and skipped the same turn again. A waypoint is now skipped only when the segment from the actual player position to the following waypoint is clear. This applies to normal patrol navigation and Apex travel; Apex checks also retain mob and boss clearance.

A second fixture reproduced zero movement in a clear corridor because a receding projectile was represented as a permanent obstacle. Long-route masks and segment checks now reserve mob bodies and Apex stand-off circles, while projectile collision checks operate in local steering. Projectile dodge prediction looks ahead for the time needed to sidestep, capped at 0.8 seconds. It retains an 85-unit margin around the projectile body and checks relative velocity directly, replacing the extra speed-based radius that double-counted motion. Route retry pauses continue to run the safety controller every 50 ms instead of leaving inputs released for the whole pause. Projectile ownership is still not inferred.

Copied Apex diagnostics now include the current preset, Ultra+ membership, movement target, route outcome, replan count, and the latest rejected movement with its age, requested keys, speed, reason and blocking entity. This distinguishes terrain, ordinary mobs, projectiles and Apex spacing in later reports.

Validation: `npm test` completed with **70 passing tests, zero failures and zero skipped tests**. Added movement cases cover L2 and L3 turns at 900 and 2,400 units per second with simulated floor collisions, travel behind a receding shot, and an incoming projectile dodge followed by resumed travel without simulated body contact. Existing direct L2 travel, L3-only Ultra+ mob avoidance, configured Apex spacing, blocked corridors, centipede tracking, recovery, loadout and protocol checks also pass. These are controlled browser fixtures; this update has not been exercised in a live account session.


## L2 direct travel and L3 attacks during pathfinding

L2 now uses terrain-only routes during Apex travel. Ordinary mobs, projectiles and live or retained Apex records do not add avoidance masks or trigger movement dodges in L2. L3 uses mob detours on its current floor, including lower-difficulty floor, and keeps Alt/Space attack inputs active while searching, following a route, retreating, and retrying route plans. The configured Apex border gap still applies during L3 engagement. Search targets continue to prioritize Ultra+ floor.

Switching builds interrupts the current route so it can be replanned under the selected build's rules. Returning from L3 to L2 therefore drops the old avoidance detour and folds attacks. Build selection, stale-world pauses, death handling, Stop and focus pauses retain their input-release behavior; attacks resume during valid L3 travel rather than during the saved-loadout key sequence. The controller retains its Apex destination while taking mob detours.

Validation: `npm test` completed with **74 passing tests, zero failures and zero skipped tests**. Browser fixtures check direct L2 movement through ordinary mobs, shots and Apex positions, continuous L3 attacks during stationary- and moving-mob detours, build changes in both directions, and an actual hunt-loop simulation that attacks two route mobs during an unseen-Apex search and then acquires the Apex and reaches damage range. Fixture damage is conditional simulated HP loss, not live combat. Existing gap, corner, projectile, centipede, recovery, loadout and protocol tests also pass. No live-account session was run for this update.


## Projectile avoidance removed; cached L2 loot mode corrected

Projectile records are no longer avoidance threats in any build or phase. The projectile sidestep horizon, speed-derived dodge handling and projectile clearance branch have been removed. L3 retains ordinary-mob body avoidance and attacks during its Apex approach. L2 has explicit terrain-only guards in route masks, continuous segment checks and movement steering, including loot routes.

A loot fixture reproduced a separate stale-build bug: when the profile already confirmed L2, the cached loadout selection returned success without updating the active job's old L3 marker. The route then applied L3 mob avoidance and could remain stationary behind mobs without reaching a drop. Both a real preset selection and a cached confirmed selection now synchronize the active job's build. A changed build resets old movement-speed, vision and attack-position caches.

Validation: `npm test` completed with **78 passing tests, zero failures and zero skipped tests**. Tests cover incoming shots producing no steering change, projectile-only routes remaining open across four build numbers and both travel/loot phases, direct L2 loot movement through mobs and shots, the reproduced cached-L2 loot case, and L3 loot movement without projectile detours. Loot collection in these fixtures is simulated proximity to a drop; no live inventory pickup or normal-damage survival claim is made. Existing L3 attacks and mob detours, Apex gap, mode changes, corner travel, recovery, loadout and protocol checks also pass.


## Fixed 20-unit ordinary-mob gap in L3

L3 ordinary-mob clearance is now the mob body radius plus exactly 20 world units during travel, search, approach and combat. The previous 180/120/80 caution margins, low-health additions and speed additions have been removed from ordinary-mob avoidance. Long-route masks and segment checks use the mob's current body instead of reserving its predicted swept path. The short input-step controller still checks relative motion against the same 20-unit clearance. The separately configured Apex attack stand-off remains in effect for the boss itself.

L2 retains its terrain-only route, segment and steering guards. A regression also exposed five wait slices still issuing a mob-escape input after the L2 digit had been sent but before the build sequence finished. The controller now changes to L2 immediately when that digit is sent, so later key-sequence waits cannot continue L3 dodges. Cached confirmed L2 selection still synchronizes the mode. A build change clears the previous mode's movement-block diagnostic. Projectile avoidance remains disabled in every build.

Validation: `npm test` completed with **82 passing tests, zero failures and zero skipped tests**. New checks cover a fixed 20-unit ordinary-mob margin across low/full HP, fast/stationary mobs and all three caution levels; actual straight travel past a mob at a measured 20-unit border gap; a DPS approach that passes a mob at 20 units and reaches the Apex; and zero dodge inputs after the L2 selection digit. Existing L2 travel/loot, cached-build handling, L3 attacks, projectile exclusion, build changes, corner travel and the full prior suite pass. These are controlled browser simulations, not a live-account survival trial.


## Direct loot handoff and retained stall evidence

A full hunt-loop fixture reproduced a remaining loot failure after the L2 corpse trip: equipping the L3 magnet enabled mob masks again, sealing the path to a nearby drop. The visit ended without inventory gains. Loot travel now uses terrain-only routing regardless of the equipped preset, including when another Apex is nearby. L2 remains terrain-only throughout. L3 keeps its fixed 20-unit ordinary-mob margin while hunting, and projectile avoidance remains disabled. A confirmed defeat also interrupts an ongoing search route immediately so the controller can enter loot mode instead of finishing an unrelated coverage leg.

The new fixtures cover a respawn/L2 corpse trip followed by L3 pickup, a defeat while already using L3, and pickup with another Apex nearby. Before this change the three cases failed to collect the simulated drop. They now reach it and record the conditional simulated inventory increment. The search-interruption fixture also changes from completing the old route to a prompt `defeated` outcome. These tests model movement and pickups; they do not establish live pickup or survival against normal game damage.

Diagnostics now include `scriptBuild: 2026-10-15-loot-direct`, current automation phase, position, route target, held keys and expected preset even when no hunt is active. Completed or interrupted hunt context is retained as `lastHunt`. Recovery events capture their context before Stop invalidates the route, so later `hunt: null` cannot erase the preceding state. Historical rejection age is reported separately from current frame freshness.

The supplied summary does not contain the malformed 2,901-byte world packet, so the exact layout behind the reported kind 174 cannot be reconstructed. Direct public-client reads returned HTTP 403 and a normal Chromium visit failed certificate validation. No TLS verification was disabled and no unknown entity layout was guessed. Creation rejection diagnostics now report the actual current record ID, kind and index rather than the previous record, with a bounded 48-byte world-data sample. If an established stream rejects a packet containing new entities, it marks the snapshot incomplete even if later deltas are fresh. The existing bounded hunt snapshot refresh then recovers lost creation records; a realm/account reset clears the marker. Unsupported packets remain atomically rejected.

Validation: `npm test` completed with **87 passing tests, zero failures and zero skipped tests**. New coverage exercises the three full loot handoffs, prompt search cancellation on defeat, retained recovery context, accurate malformed-creation diagnostics, and a snapshot request surviving later fresh delta traffic. Existing 20-unit L3 hunting, direct L2 travel and loot, build switches, projectile exclusion, protocol and recovery checks pass. Live-account pickup and the exact malformed packet layout remain unverified.
