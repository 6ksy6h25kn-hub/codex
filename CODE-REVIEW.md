# Navigator review

Fixed in this update:

- Incoming player profiles no longer have their fresh XP replaced by a cached, potentially stale world total.
- Switching accounts ends the previous statistics session and starts counters for the new account, rather than leaving them attached to the old account.
- Apex zero-health confirmation resets on map and identity changes, preventing entity ID reuse from carrying an earlier death timer.
- Ant Hell slot checks require recent profile data, wait for confirmation after correcting slot 5, and report when the server has not confirmed the result.

Validation: browser regression tests for XP freshness, account isolation, Apex map resets, real viewer login and disconnected-viewer operation; existing tests for farm entry, recorded player profiles, per-life stats, Apex cycles and Antennae.

Limits: these tests do not establish reliable live Apex locating in every biome or guarantee survival. The Ant Hell speed petal cannot be verified without fresh server slot data; keep the intended farming configuration saved in L4. Replit VM suspension and game disconnections remain hosting/runtime constraints.
