/** Map-backed counters cannot read/write Object.prototype via dynamic status keys. */
export class QaCounter {
  #counts = new Map()

  increment(key) {
    if ((typeof key !== 'string' && typeof key !== 'number')
      || (typeof key === 'number' && !Number.isFinite(key))) {
      throw new TypeError('QA_INVALID_COUNTER_KEY')
    }
    const normalized = String(key)
    this.#counts.set(normalized, (this.#counts.get(normalized) ?? 0) + 1)
  }

  get size() { return this.#counts.size }

  total() { return [...this.#counts.values()].reduce((sum, count) => sum + count, 0) }

  // Preserve the existing JSON report shape, including safe own properties for unusual keys.
  toJSON() { return Object.fromEntries(this.#counts) }
}
