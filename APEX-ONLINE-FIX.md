# Online Apex detection investigation

The user reported zero accepted world frames, 4,428 rejected updates, no mob records, and no rejection reason. This means searching had no world entities to inspect; route selection alone could not fix it.

## Confirmed client-format difference

Inspection of the currently served public client WebAssembly shows its opcode-5 world header uses:

- a 32-bit own-entity ID, a 64-bit timestamp, and x/y floats;
- a one-byte group mask;
- optional HP/max-HP, shield/max-shield, and XP/level/stars groups;
- a petal-slot count and six-byte slot records;
- entity creation/delta counts and the entity stream.

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
