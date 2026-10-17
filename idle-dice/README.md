# Idle Dice offline test helper

With the Idle Dice game open and fully loaded, paste this into the browser DevTools console:

```js
fetch('https://raw.githubusercontent.com/6ksy6h25kn-hub/codex/main/idle-dice/idle-dice-auto-test.js').then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text()}).then(eval)
```

Then run:

```js
idleDiceAuto.start({ intervalMs: 250 })
```

It presses the game's normal Roll control every 250 ms and turns on the game's built-in Auto Upgrade setting. It does not modify save data directly.

Use `idleDiceAuto.stop()` to stop and restore the prior Auto Upgrade setting. Use `idleDiceAuto.status()` to view status.
