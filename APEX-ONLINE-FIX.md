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
- Extended native offline trials are running with only the navigator's input converted to the public header layout; the native game receives its original traffic. These are controlled fixtures, not live-server tests.

The cause is supported by the public decoder and the reported counters, but live confirmation still requires an updated script running against the real server. Offline invulnerability tests do not demonstrate normal-damage survival.

## Additional fixes under test

- Variable-length type-7 effects now include their point-list byte and coordinates; eight captured Jungle frames that previously failed replay successfully with their original entity context.
- Layout selection verifies the complete entity stream when a public header could also pass legacy field checks. Temporary candidates cannot overwrite the selected position or XP.
- Uses server timestamps to derive movement when several packets arrive together.
- Visual confirmation follows fresh game-render observations, rather than requiring three consecutive browser animation frames.
- A bounded, local template matcher can recover Apex/name labels from an existing text atlas without sending images to another service. It stops probing when registry tracking already identifies the target.
- Missing mob records can trigger one snapshot refresh later in a hunt as well as at startup.

The bitmap matcher has fixture coverage; it is a supplementary fallback, not a replacement for validated network records. Native long-run findings will be appended after the final checks.

## Search and freshness safeguards

- Separates fresh player coordinates from accepted mob-frame freshness. A rejected mob stream cannot make old Apex positions look current. Long navigation and route-mob encounters pause as well as the outer hunt loop.
- Refreshes a substantially partial snapshot even if some fresh mobs are already known. A hunt that has searched for 15 seconds without any Apex sighting can also refresh once if unidentified records remain. This covers an Apex born before script installation.
- Measures Antennae scale from repeated terrain chunks in both screen axes. The camera may lead the player; the measurement checks the terrain lattice rather than assuming a centered camera. A changed view interrupts a long search route so coverage spacing can be rebuilt.
- Adds regression tests for actual public entity field order, variable IDs and removals, compact movement, both HP encodings, stale-route release, snapshot limits, and camera-offset measurements.

The latest full-format native fixtures convert header and entity encoding while retaining native world geometry. Their extended runs are still in progress; these are distinct from the earlier header-only conversions and from actual live-server sessions.
