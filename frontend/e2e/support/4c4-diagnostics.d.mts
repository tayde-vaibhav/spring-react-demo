type Stage = 'setup' | 'navigate' | 'login-initial' | 'count-initial' | 'capture-access'
  | 'csrf-missing' | 'csrf-wrong' | 'csrf-valid' | 'after-valid-logout' | 'login-document'
  | 'tamper' | 'me-tampered' | 'csrf-recovery' | 'login-recovery' | 'verify-recovery'
  | 'count-final' | 'logout-final' | 'after-final-logout' | 'complete'
type Endpoint = 'document' | 'login' | 'logout' | 'me' | 'csrf' | 'products' | 'stats' | 'observed-429'
type Check = 'nonce' | 'admin' | 'problem' | 'contentType' | 'bodyStatus' | 'title'
  | 'detail' | 'type' | 'fields' | 'xsrfPresent' | 'csrfMatches' | 'cookiePresent'
  | 'cookieAbsent' | 'tamperedSent' | 'replaced' | 'baseline' | 'noStore'
type Counter = 'loginRequests' | 'logoutRequests' | 'blockedLocalRequests'
  | 'websocketAttempts' | 'pageErrors' | 'productCount'
export class Safe4C4Diagnostics {
  stage(value: Stage): void
  http(endpoint: Endpoint, status: number): void
  check(name: Check, passed: boolean): void
  count(name: Counter, value: number): void
  readonly rateLimited: boolean
  snapshot(): {
    schema: '4c4-safe-diagnostics-v1'
    stage: Stage
    bodyCompleted: boolean
    rateLimited: boolean
    http: { stage: Stage; endpoint: Endpoint; status: number }[]
    checks: { stage: Stage; check: Check; passed: boolean }[]
    counts: Partial<Record<Counter, number>>
  }
}
