// G1: node frontend/e2e/concurrency.mjs (requires the running backend only).
// Uses exported DEV_ADMIN_PASSWORD; never reads .env or persists authentication.
// Creates five qa-owned products, cleans up even after failed assertions, and
// compares the complete initial/final seeded inventory. Do not run concurrently
// with other writers. No packages, browsers, or service changes are required.
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const origin = 'http://localhost:8080'
const scope = `qa-g1-${randomUUID()}`
const fields = ['name', 'description', 'category', 'price', 'stock', 'tags', 'specs', 'active']
const cookies = new Map()
const attemptedNames = new Set()
const knownIds = new Set()
const metrics = { createStatuses: {}, updateStatuses: {}, rounds: [], deleted: 0,
  csrfPairsChecked: 0, csrfCookieDeletions: 0 }
let baseline
let writesAttempted = false
let failure
let cleanupFailure
let stage = 'preflight'

class QaError extends Error {}
function check(value, code) { if (!value) throw new QaError(code) }
function safeError(error) {
  return error instanceof QaError ? error.message : 'QA_REQUEST_OR_RUNNER_FAILURE'
}
function writable(product) {
  return Object.fromEntries(fields.map(key => [key, product[key]]))
}
function owned(product) {
  return product?.category === scope && attemptedNames.has(product?.name)
}
function tally(bucket, status) { bucket[status] = (bucket[status] || 0) + 1 }

function cookieHeader() {
  return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
}

async function request(path, method = 'GET', body, writeSecurity) {
  check(path.startsWith('/api/v1/') || path === '/actuator/health', 'QA_INVALID_PATH')
  const headers = { Accept: 'application/json, application/problem+json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') {
    // Parallel callers supply the same immutable pair. Sequential writes obtain
    // a fresh pair after any preceding authenticated read/cookie rotation.
    const security = writeSecurity || await csrfPair()
    headers.Cookie = security.cookieHeader
    headers['X-XSRF-TOKEN'] = security.token
  } else if (cookies.size) headers.Cookie = cookieHeader()
  const response = await fetch(origin + path, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) {
      const name = pair.slice(0, separator)
      const value = pair.slice(separator + 1)
      const maxAge = cookie.match(/;\s*Max-Age=(-?\d+)/i)
      const expires = cookie.match(/;\s*Expires=([^;]+)/i)
      if (!value || (maxAge ? Number(maxAge[1]) <= 0 : expires && Date.parse(expires[1]) <= Date.now())) {
        cookies.delete(name)
        if (name === 'XSRF-TOKEN') metrics.csrfCookieDeletions++
      } else cookies.set(name, value)
    }
  }
  check(response.status !== 429, 'QA_RATE_LIMITED_NO_WAIT')
  const result = { status: response.status, type: response.headers.get('content-type') || '', body: null }
  if (response.status !== 204) {
    try { result.body = await response.json() } catch { throw new QaError('QA_NON_JSON_RESPONSE') }
  }
  if (response.status === 403) {
    console.log(JSON.stringify({ stage, deniedMethod: method, status: 403,
      problemDetail: result.type.includes('application/problem+json') && result.body?.status === 403 }))
  }
  return result
}

async function csrfPair() {
  const result = await request('/api/v1/auth/csrf')
  check(result.status === 200 && typeof result.body?.token === 'string', 'QA_CSRF_FAILED')
  const diagnostics = { stage, csrfCookiePresent: Boolean(cookies.get('XSRF-TOKEN')),
    authCookiePresent: Boolean(cookies.get('ACCESS_TOKEN')),
    headerMatchesCookie: result.body.token === cookies.get('XSRF-TOKEN') }
  console.log(JSON.stringify({ csrfCheck: diagnostics }))
  check(diagnostics.csrfCookiePresent && diagnostics.headerMatchesCookie, 'QA_CSRF_PAIR_MISMATCH')
  if (stage !== 'preflight') check(diagnostics.authCookiePresent, 'QA_AUTH_COOKIE_MISSING')
  metrics.csrfPairsChecked++
  return Object.freeze({ cookieHeader: cookieHeader(), token: result.body.token })
}

async function inventory(expected) {
  const result = []
  for (let page = 0; page < Math.ceil(expected / 100); page++) {
    const response = await request(`/api/v1/products?page=${page}&size=100&sort=id,asc`)
    check(response.status === 200 && response.body.totalElements === expected
      && response.body.content.length === Math.min(100, expected - page * 100), 'QA_INVENTORY_COUNT_CHANGED')
    result.push(...response.body.content)
  }
  check(result.length === expected && new Set(result.map(item => item.id)).size === expected,
    'QA_INVENTORY_UNSTABLE')
  return result
}

async function parallel(actions) {
  // Await every in-flight request before validating results or entering cleanup.
  const results = await Promise.allSettled(actions.map(action => action()))
  const rejected = results.find(result => result.status === 'rejected')
  if (rejected) throw rejected.reason
  return results.map(result => result.value)
}

function verifySaved(saved, input, expectedVersion, id) {
  check(owned(saved) && isDeepStrictEqual(writable(saved), writable(input)), 'QA_FIELDS_CORRUPTED')
  check(/^[a-f0-9]{24}$/i.test(saved.id) && (!id || saved.id === id)
    && saved.version === expectedVersion, 'QA_ID_OR_VERSION_INVALID')
  check(Number.isFinite(Date.parse(saved.createdAt)) && Number.isFinite(Date.parse(saved.updatedAt))
    && Date.parse(saved.updatedAt) >= Date.parse(saved.createdAt), 'QA_TIMESTAMPS_INVALID')
}

function conflict(response) {
  check(response.status === 409 && response.type.includes('application/problem+json')
    && response.body?.status === 409 && typeof response.body.title === 'string', 'QA_CONFLICT_CONTRACT_FAILED')
  check(!/stackTrace|com\.vaibhav|org\.springframework|java\.lang|\bat\s+\S+\(/.test(JSON.stringify(response.body)),
    'QA_CONFLICT_LEAK')
}

async function cleanup() {
  // Discover successful POSTs even when their response was lost. Never delete by
  // prefix alone: each record must match this run's category and attempted name.
  const found = await request(`/api/v1/products?size=100&category=${encodeURIComponent(scope)}`)
  check(found.status === 200 && found.body.totalElements <= 5, 'QA_CLEANUP_DISCOVERY_FAILED')
  check(found.body.content.length === found.body.totalElements, 'QA_CLEANUP_INCOMPLETE_DISCOVERY')
  for (const product of found.body.content) {
    check(owned(product), 'QA_CLEANUP_FOREIGN_PRODUCT')
    knownIds.add(product.id)
  }
  for (const id of knownIds) {
    const path = `/api/v1/products/${encodeURIComponent(id)}`
    const read = await request(path)
    if (read.status === 404) continue
    check(read.status === 200 && owned(read.body), 'QA_CLEANUP_FOREIGN_PRODUCT')
    check((await request(path, 'DELETE')).status === 204, 'QA_CLEANUP_DELETE_FAILED')
    metrics.deleted++
    check((await request(path)).status === 404, 'QA_CLEANUP_RECORD_REMAINS')
  }
  const final = await inventory(500)
  check(isDeepStrictEqual(final, baseline), 'QA_SEEDED_INVENTORY_CHANGED')
  check(!final.some(item => item.name?.startsWith('qa-') || item.category?.startsWith('qa-')), 'QA_RECORDS_REMAIN')
  return { totalElements: final.length, qaRecords: 0, seededRecordsUnchanged: true }
}

try {
  check(Boolean(process.env.DEV_ADMIN_PASSWORD), 'QA_MISSING_DEV_ADMIN_PASSWORD')
  const health = await request('/actuator/health')
  check(health.status === 200 && health.body?.status === 'UP', 'QA_BACKEND_NOT_HEALTHY')
  const login = await request('/api/v1/auth/login', 'POST', {
    username: process.env.DEV_ADMIN_USERNAME || 'admin', password: process.env.DEV_ADMIN_PASSWORD,
  })
  check(login.status === 200 && login.body?.roles?.includes('ADMIN'), 'QA_ADMIN_LOGIN_FAILED')
  baseline = await inventory(500)
  check(!baseline.some(item => item.name?.startsWith('qa-') || item.category?.startsWith('qa-')),
    'QA_EXISTING_QA_RECORDS')
  console.log(JSON.stringify({ stage, totalElements: 500, qaRecords: 0 }))

  stage = 'parallel-creates'
  const inputs = Array.from({ length: 5 }, (_, index) => ({
    name: `${scope}-product-${index}`, description: `QA concurrency fixture ${index}`,
    category: scope, price: 20.25 + index, stock: index + 1, tags: ['qa', `batch-${index}`],
    specs: { dimensions: { width: index + 1, unit: 'cm' }, material: `qa-material-${index}` },
    active: index % 2 === 0,
  }))
  for (const input of inputs) attemptedNames.add(input.name)
  const createSecurity = await csrfPair()
  writesAttempted = true
  const created = await parallel(inputs.map(input => async () => {
    const response = await request('/api/v1/products', 'POST', input, createSecurity)
    tally(metrics.createStatuses, response.status)
    if (response.status === 201 && owned(response.body)) knownIds.add(response.body.id)
    return response
  }))
  for (let index = 0; index < created.length; index++) {
    check(created[index].status === 201, 'QA_PARALLEL_CREATE_FAILED')
    verifySaved(created[index].body, inputs[index], 0)
    const read = await request(`/api/v1/products/${encodeURIComponent(created[index].body.id)}`)
    check(read.status === 200, 'QA_CREATE_READ_FAILED')
    verifySaved(read.body, inputs[index], 0, created[index].body.id)
    check(Date.parse(read.body.createdAt) === Date.parse(created[index].body.createdAt)
      && Date.parse(read.body.updatedAt) === Date.parse(created[index].body.updatedAt), 'QA_CREATE_AUDIT_MISMATCH')
  }
  check(knownIds.size === 5, 'QA_DUPLICATE_CREATE_IDS')
  const withFixtures = await inventory(505)
  check(withFixtures.filter(owned).length === 5
    && isDeepStrictEqual(withFixtures.filter(item => !owned(item)), baseline), 'QA_CREATE_INVENTORY_CORRUPTED')
  console.log(JSON.stringify({ stage, statuses: metrics.createStatuses, uniqueIds: knownIds.size, totalElements: 505 }))

  const path = `/api/v1/products/${encodeURIComponent(created[0].body.id)}`
  for (let round = 1; round <= 3; round++) {
    stage = `competing-updates-${round}`
    const initial = await request(path)
    check(initial.status === 200, 'QA_UPDATE_SNAPSHOT_FAILED')
    const snapshot = initial.body
    const updates = Array.from({ length: 8 }, (_, index) => ({
      ...writable(snapshot), version: snapshot.version,
      description: `QA round ${round} contender ${index}`, price: 100 + round * 10 + index + 0.25,
      stock: round * 100 + index, tags: ['qa', `round-${round}`, `contender-${index}`],
      specs: { dimensions: { width: round * 10 + index, unit: 'cm' }, material: `qa-${round}-${index}` },
      active: index % 2 === 0,
    }))
    const updateSecurity = await csrfPair()
    const responses = await parallel(updates.map(input => async () => {
      const response = await request(path, 'PUT', input, updateSecurity)
      tally(metrics.updateStatuses, response.status)
      return response
    }))
    const winners = responses.map((response, index) => response.status === 200 ? index : -1).filter(index => index >= 0)
    check(winners.length === 1, 'QA_NOT_EXACTLY_ONE_UPDATE_WINNER')
    for (const response of responses) if (response.status !== 200) conflict(response)
    const winner = winners[0]
    verifySaved(responses[winner].body, updates[winner], snapshot.version + 1, snapshot.id)
    const read = await request(path)
    check(read.status === 200, 'QA_UPDATE_READ_FAILED')
    verifySaved(read.body, updates[winner], snapshot.version + 1, snapshot.id)
    check(read.body.createdAt === snapshot.createdAt
      && Date.parse(read.body.updatedAt) >= Date.parse(snapshot.updatedAt)
      && Date.parse(read.body.updatedAt) === Date.parse(responses[winner].body.updatedAt), 'QA_UPDATE_AUDIT_MISMATCH')
    // Explicit replay after all parallel responses: conflict must not mutate any field.
    conflict(await request(path, 'PUT', updates[winner]))
    const afterReplay = await request(path)
    check(afterReplay.status === 200 && isDeepStrictEqual(afterReplay.body, read.body), 'QA_REPLAY_MUTATED_PRODUCT')
    metrics.rounds.push({ round, attempted: 8, success: 1, conflicts: 7, version: read.body.version, staleReplay: 409 })
    console.log(JSON.stringify({ stage, ...metrics.rounds.at(-1) }))
  }

  const after = await inventory(505)
  check(isDeepStrictEqual(after.filter(item => !owned(item)), baseline), 'QA_CONCURRENCY_CHANGED_SEEDED_RECORDS')
  for (let index = 1; index < created.length; index++) {
    const product = after.find(item => item.id === created[index].body.id)
    verifySaved(product, inputs[index], 0, created[index].body.id)
    check(Date.parse(product.createdAt) === Date.parse(created[index].body.createdAt)
      && Date.parse(product.updatedAt) === Date.parse(created[index].body.updatedAt), 'QA_UNRELATED_FIXTURE_CHANGED')
  }
} catch (error) {
  failure = { stage, code: safeError(error) }
  console.log(JSON.stringify({ failure }))
} finally {
  if (writesAttempted) {
    try { console.log(JSON.stringify({ stage: 'cleanup', ...await cleanup() })) }
    catch (error) {
      cleanupFailure = safeError(error)
      console.log(JSON.stringify({ cleanupFailure }))
    }
  }
  cookies.clear()
}

console.log(JSON.stringify({ item: 'G1', status: failure || cleanupFailure ? 'FAILED' : 'PASSED', ...metrics }))
if (failure || cleanupFailure) process.exitCode = 1
