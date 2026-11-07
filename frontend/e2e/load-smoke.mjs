// G2: node frontend/e2e/load-smoke.mjs (running backend, exported ADMIN password).
// No dependencies, service management, product writes, .env reads, or recordings.
// Fixed localhost-only, closed-loop smoke: 20 workers, 60s, 1s think time.
// Uses one shared ADMIN identity, not 20 distinct accounts. Not a capacity SLA.
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'
import { QaCounter } from './support/qa-counter.mjs'

const origin = 'http://localhost:8080'
const listPath = '/api/v1/products?page=0&size=20&sort=id,asc'
const virtualUsers = 20
const durationMs = 60_000
const thinkTimeMs = 1_000
const cookies = new Map()
const latencies = []
const statuses = new QaCounter()
const errors = new QaCounter()
const perWorker = Array(virtualUsers).fill(0)
let baseline
let expectedPage
let loadCookie
let stop = false
let failure
let finalInventory
let timer
let stage = 'preflight'
let loadElapsedMs = 0

class QaError extends Error {}
function check(condition, code) { if (!condition) throw new QaError(code) }
function safeError(error) { return error instanceof QaError ? error.message : 'QA_REQUEST_OR_RUNNER_FAILURE' }
function tally(bucket, key) { bucket.increment(key) }
function cookieHeader() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') }
function percentile(sorted, fraction) {
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null
}

async function request(path, method = 'GET', body, token) {
  check(path.startsWith('/api/v1/') || path === '/actuator/health', 'QA_INVALID_PATH')
  const response = await fetch(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json, application/problem+json',
      ...(cookies.size ? { Cookie: cookieHeader() } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'X-XSRF-TOKEN': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    const maxAge = header.match(/;\s*Max-Age=(-?\d+)/i)
    const expires = header.match(/;\s*Expires=([^;]+)/i)
    if (!value || (maxAge ? Number(maxAge[1]) <= 0 : expires && Date.parse(expires[1]) <= Date.now())) {
      cookies.delete(name)
    } else cookies.set(name, value)
  }
  check(response.status !== 429, 'QA_RATE_LIMITED_NO_WAIT')
  let json
  try { json = await response.json() } catch { throw new QaError('QA_NON_JSON_RESPONSE') }
  return { status: response.status, body: json }
}

async function inventory() {
  const all = []
  for (let page = 0; page < 5; page++) {
    const response = await request(`/api/v1/products?page=${page}&size=100&sort=id,asc`)
    check(response.status === 200 && response.body.totalElements === 500
      && response.body.content.length === 100, 'QA_INVENTORY_COUNT_INVALID')
    all.push(...response.body.content)
  }
  check(new Set(all.map(product => product.id)).size === 500, 'QA_INVENTORY_UNSTABLE')
  check(!all.some(product => product.name?.startsWith('qa-') || product.category?.startsWith('qa-')),
    'QA_EXISTING_QA_RECORDS')
  return all
}

async function worker(index, deadline) {
  while (!stop && performance.now() < deadline) {
    const start = performance.now()
    let errorCode
    try {
      // Never log the cookie/header/body; all workers reuse one immutable login.
      const response = await fetch(origin + listPath, {
        headers: { Accept: 'application/json', Cookie: loadCookie },
        redirect: 'error', signal: AbortSignal.timeout(5000),
      })
      tally(statuses, response.status)
      const body = await response.json()
      if (response.status !== 200) errorCode = `HTTP_${response.status}`
      else if (!isDeepStrictEqual(body, expectedPage)) errorCode = 'INVALID_OR_CHANGED_PAGE'
    } catch (error) {
      errorCode = error?.name === 'TimeoutError' ? 'TIMEOUT' : 'REQUEST_OR_JSON_ERROR'
    }
    latencies.push(performance.now() - start)
    perWorker[index]++
    if (errorCode) {
      tally(errors, errorCode)
      stop = true // Drain in-flight requests; do not hammer a failing backend.
    }
    const remaining = deadline - performance.now()
    if (!stop && remaining > 0) await delay(Math.min(thinkTimeMs, remaining))
  }
}

try {
  check(Boolean(process.env.DEV_ADMIN_PASSWORD), 'QA_MISSING_DEV_ADMIN_PASSWORD')
  const health = await request('/actuator/health')
  check(health.status === 200 && health.body?.status === 'UP', 'QA_BACKEND_NOT_HEALTHY')
  const csrf = await request('/api/v1/auth/csrf')
  check(csrf.status === 200 && typeof csrf.body?.token === 'string'
    && csrf.body.token === cookies.get('XSRF-TOKEN'), 'QA_CSRF_PAIR_INVALID')
  const login = await request('/api/v1/auth/login', 'POST', {
    username: process.env.DEV_ADMIN_USERNAME || 'admin', password: process.env.DEV_ADMIN_PASSWORD,
  }, csrf.body.token)
  check(login.status === 200 && login.body?.roles?.includes('ADMIN'), 'QA_ADMIN_LOGIN_FAILED')
  check(Boolean(cookies.get('ACCESS_TOKEN')), 'QA_AUTH_COOKIE_MISSING')
  loadCookie = `ACCESS_TOKEN=${cookies.get('ACCESS_TOKEN')}`
  baseline = await inventory()
  const list = await request(listPath)
  check(list.status === 200 && list.body?.totalElements === 500 && list.body.content.length === 20
    && isDeepStrictEqual(list.body.content, baseline.slice(0, 20)), 'QA_LIST_PREFLIGHT_FAILED')
  expectedPage = list.body
  console.log(JSON.stringify({ stage, totalElements: 500, qaRecords: 0, virtualUsers,
    durationSeconds: durationMs / 1000, thinkTimeMs, logins: 1, productWrites: 0 }))

  stage = 'load'
  const start = performance.now()
  const deadline = start + durationMs
  timer = setInterval(() => console.log(JSON.stringify({ stage, elapsedSeconds: Math.round((performance.now() - start) / 1000),
    requests: latencies.length, errors: errors.total() })), 20_000)
  const settled = await Promise.allSettled(Array.from({ length: virtualUsers }, (_, index) => worker(index, deadline)))
  loadElapsedMs = performance.now() - start
  clearInterval(timer)
  check(settled.every(result => result.status === 'fulfilled'), 'QA_WORKER_FAILURE')
  check(!stop && loadElapsedMs >= durationMs && perWorker.every(count => count > 0), 'QA_LOAD_INTERRUPTED')
  check(errors.size === 0, 'QA_LOAD_ERRORS')
} catch (error) {
  failure = { stage, code: safeError(error) }
  console.log(JSON.stringify({ failure }))
} finally {
  clearInterval(timer)
  if (baseline) {
    try {
      const after = await inventory()
      check(isDeepStrictEqual(after, baseline), 'QA_SEEDED_INVENTORY_CHANGED')
      finalInventory = { totalElements: 500, qaRecords: 0, seededRecordsUnchanged: true }
      console.log(JSON.stringify({ stage: 'final-inventory', ...finalInventory }))
    } catch (error) {
      failure ||= { stage: 'final-inventory', code: safeError(error) }
      console.log(JSON.stringify({ finalInventoryFailure: safeError(error) }))
    }
  }
  cookies.clear()
  loadCookie = undefined
}

const sorted = [...latencies].sort((a, b) => a - b)
const failedRequests = errors.total()
const rounded = value => value === null ? null : Number(value.toFixed(2))
console.log(JSON.stringify({ item: 'G2', status: failure ? 'FAILED' : 'PASSED',
  virtualUsers, elapsedSeconds: rounded(loadElapsedMs / 1000), requests: latencies.length,
  requestsPerSecond: loadElapsedMs ? rounded(latencies.length * 1000 / loadElapsedMs) : null,
  latencyMs: { p50: rounded(percentile(sorted, 0.50)), p95: rounded(percentile(sorted, 0.95)),
    p99: rounded(percentile(sorted, 0.99)), max: rounded(sorted.at(-1) ?? null) },
  failedRequests, errorRatePercent: latencies.length ? rounded(failedRequests * 100 / latencies.length) : null,
  statuses, errors, perWorkerRequests: { min: Math.min(...perWorker), max: Math.max(...perWorker) },
  finalInventoryVerified: Boolean(finalInventory), productWrites: 0 }))
if (failure) process.exitCode = 1
