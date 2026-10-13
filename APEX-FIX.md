# Apex locating update

Save Antennae in reserve slot **1** in both your **L2** travel and **L3** DPS loadouts. The navigator equips it once for searching, re-equips it once after a loadout change, and keeps it active during tracking. L4 restores your saved farm build on return. Slot 1 is not toggled on every movement tick.

The locator observes matching Apex entities throughout travel, including outside Ultra+. It searches the target's named spawn areas first, then Ultra+ areas, then its mob-family areas and other reachable floor. Waypoints are ordered by walking distance through corridors. Recent confirmed scan positions expire after thirty seconds; lost targets trigger a bounded velocity prediction and searches around the last observed position. Respawn/map changes clear stale tracked IDs.

The native Antennae view is used for locating. The script estimates view scale from repeated rendered mob labels and corresponding world positions when at least three consistent matches are available. Search spacing can grow from 600 to 2,200 world units, and recent coverage expands with the measured view. If that measurement is missing, stale or narrow, spacing remains conservative. Rarity labels remain visible during searching; Alt is held during DPS as previously requested.

Ordinary route encounters have a twelve-second budget so small HP decreases cannot prolong them indefinitely. Failed route plans skip blocked points. A defeated announcement ends the hunt; fresh zero HP must persist across updates for at least 350 ms before it can do the same, avoiding an immediate end on a transient health transition.

All 71 public catalog numeric IDs pass packet fixtures. Nine biome search-plan checks, Common-floor route interruption, identity reset, recent-search memory, slot-1 idempotence and re-equip, measured-view coverage, blocker budget, and simulated respawn/loot/return checks pass. Controlled offline NPC observations cover all nine biome choices. A later regular Computer Server mob fixture with Antennae remained identified with fresh updates across six observations. Those tests used admin provisioning and invulnerability; they do not establish a natural kill, live compatibility, player damage attribution, or safe survival. Some fixtures started inside the requested 800-unit gap.

Entity kind 5 is accepted after it was found in twenty-five failing Sewers packets. All twenty-five now decode, along with 6,348 older recorded world frames. A later Jungle trace replay accepted 785 of 786 world updates; one player visual-string update remains conservatively rejected. Diagnostics include the last rejection reason.

The live XP/kill display refreshes every 100 ms. Past-life rows redraw when saved history changes. XP/kill and life-history regression checks pass. Jellyfish remains a direct Farm map selection, and Sewers Ultra/Ultra+ retains sixteen room patrol points.

For Replit, replace `navigator.js`, restart the server and use Reload script. Stop the old standalone navigator before pasting the current console script.
