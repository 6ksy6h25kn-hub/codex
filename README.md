# Private Flowrix browser on Replit

This runs the public game in a server-side Chromium browser and injects the included, updated console navigator. Open the private viewer to log into the game, play manually, select a farm zone, or start Apex-aware farming. Closing the viewer does not close the server browser. No game credentials are included or logged by the launcher.

## Launch on Replit

1. Create a Node.js Replit app and upload the contents of this folder into its root, including `.replit` and `replit.nix`.
2. In Replit **Secrets**, add `REPLIT_ACCESS_PASSWORD`: a new, private password of at least 16 characters. This protects the remote game screen; it is separate from your Flowrix password.
3. In the Replit shell, run `npm ci`. If Chromium is not installed by `replit.nix`, run `npx playwright install --with-deps chromium`. Keep TLS verification enabled. If your Replit environment supplies a Chromium binary elsewhere, set `CHROMIUM_PATH` to its absolute path.
4. Press **Run**, open the app's HTTPS web view, and sign in with the viewer password. The launcher opens `https://flowrix.sussybite.dev/` and automatically loads the navigator once the canvas and game runtime are available.
5. Log into Flowrix through the remote screen. On mobile, tap a game input, then enter its text in **Send text**. Select the biome and rarity above the screen, then press **Start farming**. The in-game navigator panel also remains usable through clicks and touches; it includes Apex settings and the 800-unit border gap.
6. Press **Stop / manual play** to take over, or focus the game screen and press Escape. **Reload script** installs the included script again; it stops the previous instance.

For farming after the development workspace is closed, use a **Reserved VM deployment**, not an Autoscale or Static deployment. Configure its build as `npm ci && npx playwright install chromium` and its run command as `npm start` (also in `.replit`). The runtime must have Chromium's system libraries. If the build reports missing libraries, use a Replit runtime with system Chromium or install the dependencies through Replit's supported package configuration. Replit plans, billing, persistence, and supported configuration vary; this package has not been deployed to your account. Do not rely on a development Run session for unattended uptime.

The game and navigator continue running while the viewer is hidden or disconnected because only their images are streamed to your device. There is one shared browser per server. Viewer controls use password authentication, a secure HttpOnly session cookie, and same-origin checks. Sessions expire after 24 hours; signing back into the viewer does not reset farming. Use Replit's HTTPS URL; plain HTTP will not receive the secure session cookie.

## Persistence and limitations

- `.browser-profile/` contains game cookies, local storage, and saved navigator settings. Treat it as private account data and never upload it to a public repository. Persistence across deployments is only as durable as your Replit storage configuration. A server restart reopens the game and reloads the script, but does **not** automatically log in, respawn, or start farming.
- Start farming only after logging in and choosing settings. The script's existing death/respawn and Apex loop then operate normally. No game credentials are embedded, and the launcher does not grant game items or modify server state.
- The viewer is a low-bandwidth screenshot stream, approximately four frames per second when open. It supports pointer dragging, keyboard input, mobile keys, and text entry. Browser-native pop-up menus may not appear in screenshots: use the viewer's biome/rarity controls, or keyboard arrows and Enter for other selects.
- Server CPU/RAM, latency, game disconnects, and Replit suspension affect uptime. Continuous farming requires the server process and game connection to remain running.
- TLS validation stays enabled. This workspace could not open the live game because Chromium rejected the environment proxy certificate. That is not proof of the same problem on Replit. If Replit shows a certificate error, repair its supported trust configuration; do not bypass certificate validation.

## Update the navigator

Replace `navigator.js` with the complete updated console script, restart the server, then use **Reload script** in the viewer. The included version preserves all farming and Apex behavior, including Antennae searching, the 100 ms XP display, and L4 restoration upon entering the farm area after respawn. Save your farming build as L4 before starting; keep Antennae in reserve slot 1 for L2 and L3.

## Local validation

`npm test` starts a temporary local fixture, exercises viewer authentication, control origin checks, remote keyboard and pointer input, screenshots, script injection, and the server's browser staying active after the viewer disconnects. Tests require Chromium. The fixture does not contact the live game or assert that Replit hosting is ready.
