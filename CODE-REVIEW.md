# Navigator review

Fixed in this update:

- Incoming player profiles no longer have their fresh XP replaced by a cached, potentially stale world total.
- Switching accounts ends the previous statistics session and starts counters for the new account, rather than leaving them attached to the old account.
- Apex zero-health confirmation resets on map and identity changes, preventing entity ID reuse from carrying an earlier death timer.
- Ant Hell slot checks require recent profile data, wait for confirmation after correcting slot 5, and report when the server has not confirmed the result.

Validation: browser regression tests for XP freshness, account isolation, Apex map resets, real viewer login and disconnected-viewer operation; existing tests for farm entry, recorded player profiles, per-life stats, Apex cycles and Antennae.

Limits: these tests do not establish reliable live Apex locating in every biome or guarantee survival. The Ant Hell speed petal cannot be verified without fresh server slot data; keep the intended farming configuration saved in L4. Replit VM suspension and game disconnections remain hosting/runtime constraints.

## Apex locating and retreat update

- Keeps Apex sightings for up to 15 seconds, scoped by observed biome, even before a hunt starts. A cached sighting guides reacquisition but cannot authorize DPS without a live entity confirmation.
- Accepts a fresh rendered minimap biome label when the script missed the original server map packet during mid-game installation.
- Rebinds a missing entity ID only after a visibility gap, with nearby coordinates, compatible radius, and consistent health.
- Uses the native/current public mob registry as authoritative when available. Crowded screen labels can no longer override a correct registry binding.
- Adds up to 450 units of adaptive retreat buffer for fast charges, above the configured 800-unit border gap.

Validation includes biome-scoped cached sightings, expired-cache rejection, live-confirmation gating, ID rebind consistency, authoritative-registry precedence, high-speed charge buffers, all public mob IDs, nine biome search plans, movement/retreat checks, and full simulated Apex cycles.

Offline native trials use an approximate build and invulnerability for controlled positioning. They do not establish normal-damage survival or attribute health reductions to the bot. Jungle kept fresh tracking through six observations after fixing erroneous screen-label overrides. Desert entered DPS, briefly lost visibility, and reacquired the same target during the 30-second observation window. Search, damage reach, and normal-damage survival still need longer live trials; these tests do not guarantee reliable hunting in every biome.
