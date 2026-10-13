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

## Current public protocol update

The reported 0 accepted / 4,428 rejected world updates traced to changes in the public client format. The reader now handles optional player groups, cumulative varint entity IDs, compact movement, public player metadata, both delta-health encodings, and variable effect point lists. It also handles public profile metadata and saved-loadout trailers while retaining legacy support.

Fresh player coordinates and mob-frame freshness are separate. A failed entity stream cannot refresh old Apex positions, and long routes pause on stale mob data. Partial-record recovery runs at most once per hunt, including late installation where some mobs are known but the Apex birth was missed.

Search uses terrain-based Antennae scale, reachable last-sighting points, bounded ring searches, and distinct live-versus-cached diagnostics. Verification and outstanding gameplay limits are documented in [APEX-ONLINE-FIX.md](APEX-ONLINE-FIX.md) and [APEX-VALIDATION.json](APEX-VALIDATION.json).
