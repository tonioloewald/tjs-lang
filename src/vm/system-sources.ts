/**
 * The real wall clock and random source, for `capabilities.clock` / `capabilities.random`
 * (#4091). A dependency-free leaf so a host can grant them without importing the VM (the
 * batteries do), and re-exported from the VM entries.
 */
/** The real wall clock, for `capabilities.clock` (#4091). */
export const systemClock: { readonly now: () => number } = Object.freeze({
  now: () => globalThis.Date.now(),
})

/** The real random source, crypto-backed where available, for `capabilities.random` (#4091). */
export const systemRandom: { readonly next: () => number } = Object.freeze({
  next: () => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1)
      crypto.getRandomValues(arr)
      return arr[0] / (0xffffffff + 1)
    }
    return Math.random()
  },
})
