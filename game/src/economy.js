// The Sunlight treasury: every spend and bounty goes through here, so the balance can
// never quietly go negative and every gain is counted for the end-of-run tally. Towers
// are bought with trySpend; kills and wave clears pay in with addSunlight.

/** True when the treasury holds at least `amount`. */
export function canAfford(state, amount) {
  return state.sunlight >= amount;
}

/**
 * Take `amount` of Sunlight out of the treasury. Returns false — and takes nothing —
 * when the treasury cannot cover it, so a purchase is all or nothing.
 */
export function trySpend(state, amount) {
  if (state.sunlight < amount) return false;
  state.sunlight -= amount;
  return true;
}

/** Pay `amount` of Sunlight in (a kill bounty, a wave-clear bonus, a sale refund). */
export function addSunlight(state, amount) {
  state.sunlight += amount;
  state.earned += amount;
}
