/*
 * Idle Dice offline test helper
 *
 * Paste the one-line loader from the README into the DevTools console while
 * the game is open. It exposes window.idleDiceAuto with start(), stop(), and
 * status(). The helper invokes the game's existing Roll button callback and
 * its built-in Auto Upgrade setting; it does not alter save values.
 */
(() => {
  'use strict';

  const previous = window.idleDiceAuto;
  if (previous && typeof previous.stop === 'function') previous.stop();

  const requireGame = () => {
    const state = window.Luts && window.Luts.currentState;
    if (!state || !state.rollButton || typeof state.rollButton.callback !== 'function') {
      throw new Error('Idle Dice is not ready. Open a save, wait for the game screen, then run this again.');
    }
    return state;
  };

  const api = {
    running: false,
    rolls: 0,
    timer: null,
    intervalMs: 250,
    priorAutoUpgrade: null,

    start(options = {}) {
      const state = requireGame();
      this.stop();

      const value = Number(options.intervalMs ?? options.ms ?? 250);
      this.intervalMs = Number.isFinite(value) ? Math.max(50, Math.floor(value)) : 250;
      this.rolls = 0;

      if (options.autoUpgrade !== false && state.autoUpgrade && typeof state.autoUpgrade.set === 'function') {
        this.priorAutoUpgrade = state.autoUpgrade.value;
        state.autoUpgrade.set(true);
      }

      const roll = () => {
        try {
          const liveState = requireGame();
          if (liveState.rollButton.active !== false && !liveState.rollButton.lock) {
            liveState.rollButton.callback();
            this.rolls += 1;
          }
        } catch (error) {
          this.stop();
          console.error('[Idle Dice Auto] stopped:', error.message);
        }
      };

      this.running = true;
      roll();
      this.timer = window.setInterval(roll, this.intervalMs);
      console.info(`[Idle Dice Auto] started: roll every ${this.intervalMs}ms; auto-upgrade ${options.autoUpgrade === false ? 'off' : 'on'}.`);
      return this.status();
    },

    stop() {
      if (this.timer !== null) window.clearInterval(this.timer);
      this.timer = null;
      this.running = false;

      const state = window.Luts && window.Luts.currentState;
      if (this.priorAutoUpgrade !== null && state && state.autoUpgrade && typeof state.autoUpgrade.set === 'function') {
        state.autoUpgrade.set(this.priorAutoUpgrade);
      }
      this.priorAutoUpgrade = null;
      return this.status();
    },

    status() {
      const state = window.Luts && window.Luts.currentState;
      return {
        running: this.running,
        intervalMs: this.intervalMs,
        rolls: this.rolls,
        autoUpgrade: state && state.autoUpgrade ? state.autoUpgrade.value : null,
      };
    },
  };

  window.idleDiceAuto = api;
  console.info('[Idle Dice Auto] ready. Run idleDiceAuto.start() or idleDiceAuto.start({ intervalMs: 250 }). Stop with idleDiceAuto.stop().');
})();
