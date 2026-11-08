// Test-only, closed-schema diagnostics. Never accept raw errors, responses or
// arbitrary strings; only literal labels and bounded primitive measurements.
const STAGES = ['setup', 'navigate', 'login-initial', 'count-initial', 'capture-access',
  'csrf-missing', 'csrf-wrong', 'csrf-valid', 'after-valid-logout', 'login-document',
  'tamper', 'me-tampered', 'csrf-recovery', 'login-recovery', 'verify-recovery',
  'count-final', 'logout-final', 'after-final-logout', 'complete']
const ENDPOINTS = ['document', 'login', 'logout', 'me', 'csrf', 'products', 'stats', 'observed-429']
const CHECKS = ['nonce', 'admin', 'problem', 'contentType', 'bodyStatus', 'title',
  'detail', 'type', 'fields', 'xsrfPresent', 'csrfMatches', 'cookiePresent',
  'cookieAbsent', 'tamperedSent', 'replaced', 'baseline', 'noStore']
const COUNTERS = ['loginRequests', 'logoutRequests', 'blockedLocalRequests',
  'websocketAttempts', 'pageErrors', 'productCount']

function validLabel(value, labels) {
  return typeof value === 'string' && labels.includes(value)
}
function invalid() { throw new Error('QA_INVALID_DIAGNOSTIC') }

export class Safe4C4Diagnostics {
  #stage = 'setup'
  #http = []
  #checks = []
  #counts = new Map([
    ['loginRequests', 0], ['logoutRequests', 0], ['blockedLocalRequests', 0],
    ['websocketAttempts', 0], ['pageErrors', 0],
  ])

  stage(value) {
    if (!validLabel(value, STAGES)) invalid()
    this.#stage = value
  }
  http(endpoint, status) {
    if (!validLabel(endpoint, ENDPOINTS) || !Number.isInteger(status)
      || (status !== 0 && (status < 100 || status > 599)) || this.#http.length >= 128) invalid()
    this.#http.push({ stage: this.#stage, endpoint, status })
  }
  check(name, passed) {
    if (!validLabel(name, CHECKS) || typeof passed !== 'boolean' || this.#checks.length >= 128) invalid()
    this.#checks.push({ stage: this.#stage, check: name, passed })
  }
  count(name, value) {
    if (!validLabel(name, COUNTERS) || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) invalid()
    this.#counts.set(name, value)
  }
  get rateLimited() { return this.#http.some(item => item.status === 429) }
  snapshot() {
    return { schema: '4c4-safe-diagnostics-v1', stage: this.#stage,
      bodyCompleted: this.#stage === 'complete', rateLimited: this.rateLimited,
      http: this.#http.map(item => ({ ...item })), checks: this.#checks.map(item => ({ ...item })),
      counts: Object.fromEntries(this.#counts) }
  }
}
