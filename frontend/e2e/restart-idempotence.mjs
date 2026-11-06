// G4 post-restart verification only; NEVER starts/stops Java, Mongo or Vite.
// node frontend/e2e/restart-idempotence.mjs --approved-metadata
// Requires a pre-restart docs/qa/g4-baseline.json and explicit permission to
// repeat the Mongo-container credential exception in the metadata helper.
// Localhost traffic only; credentials stay in memory; no product/user writes.
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
const baselineFile = new URL('../../docs/qa/g4-baseline.json', import.meta.url)
const logFile = new URL('../../logs/backend-qa.log', import.meta.url)
const cookies = new Map()
let stage = 'startup'
let failure
const metrics = { productWrites: 0, userWrites: 0, logins: 0 }

class QaError extends Error {}
function check(condition, code) { if (!condition) throw new QaError(code) }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  return value
}

async function request(path, { method = 'GET', body, token, anonymous = false } = {}) {
  check(path.startsWith('/api/v1/') || path === '/actuator/health', 'QA_INVALID_PATH')
  const response = await fetch('http://localhost:8080' + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json',
      ...(!anonymous && cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      ...(token ? { 'X-XSRF-TOKEN': token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    const name = pair.slice(0, separator), value = pair.slice(separator + 1)
    const maxAge = header.match(/;\s*Max-Age=(-?\d+)/i)
    if (!value || (maxAge && Number(maxAge[1]) <= 0)) cookies.delete(name)
    else cookies.set(name, value)
  }
  check(response.status !== 429, 'QA_RATE_LIMITED_NO_WAIT')
  let json
  try { json = await response.json() } catch { throw new QaError('QA_NON_JSON_RESPONSE') }
  return { status: response.status, body: json }
}

async function login(role) {
  cookies.clear()
  const key = role === 'ADMIN' ? 'ADMIN' : 'USER'
  check(Boolean(process.env[`DEV_${key}_PASSWORD`]), 'QA_DEV_PASSWORD_MISSING')
  const username = process.env[`DEV_${key}_USERNAME`] || key.toLowerCase()
  const csrf = await request('/api/v1/auth/csrf')
  check(csrf.status === 200 && typeof csrf.body?.token === 'string'
    && csrf.body.token === cookies.get('XSRF-TOKEN'), 'QA_CSRF_PAIR_INVALID')
  const response = await request('/api/v1/auth/login', { method: 'POST', token: csrf.body.token,
    body: { username, password: process.env[`DEV_${key}_PASSWORD`] } })
  check(response.status === 200 && response.body?.username === username
    && isDeepStrictEqual(response.body.roles, [role]), 'QA_LOGIN_OR_ROLE_CHANGED')
  const me = await request('/api/v1/auth/me')
  check(me.status === 200 && isDeepStrictEqual(me.body, response.body), 'QA_AUTH_ME_CHANGED')
  metrics.logins++
}

try {
  check(process.argv.includes('--approved-metadata'), 'QA_METADATA_APPROVAL_REQUIRED')
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
  check(baseline.item === 'G4' && baseline.phase === 'before-restart'
    && baseline.totalElements === 500 && baseline.qaRecords === 0
    && /^[a-f0-9]{64}$/.test(baseline.inventorySha256)
    && baseline.usersCountVerified && baseline.mongoMetadata?.usersCount === 2, 'QA_BASELINE_INVALID')

  const listener = await execute('ss', ['-ltnp', '( sport = :8080 )'], { timeout: 5000 })
  const pids = [...new Set([...listener.stdout.matchAll(/pid=(\d+)/g)].map(match => Number(match[1])))]
  check(pids.length === 1 && pids[0] !== baseline.backendPid, 'QA_BACKEND_RESTART_NOT_PROVEN')
  const pid = pids[0]
  const logBuffer = fs.readFileSync(logFile)
  const sameLog = fs.statSync(logFile).ino === baseline.logInode && logBuffer.length >= baseline.logByteOffset
  const fresh = logBuffer.subarray(sameLog ? baseline.logByteOffset : 0).toString('utf8')
  const starts = [...fresh.matchAll(/Starting SpringreactdemoApplication[^\r\n]*PID (\d+)/g)]
  const latest = starts.at(-1)
  check(latest && Number(latest[1]) === pid, 'QA_FRESH_STARTUP_NOT_FOUND')
  const startup = fresh.slice(latest.index)
  const profiles = [...startup.matchAll(/The following[^\r\n]*profiles?[^\r\n]*active:[^\r\n]*/g)]
  check(profiles.at(-1)?.[0].includes('"dev"'), 'QA_DEV_PROFILE_NOT_CONFIRMED')
  check(/Started SpringreactdemoApplication in [\d.]+ seconds/.test(startup), 'QA_STARTUP_NOT_COMPLETE')
  check(startup.includes('Product seeding skipped: products collection is not empty')
    && !/Seeded \d+ products across/.test(startup), 'QA_PRODUCT_SEEDING_NOT_SKIPPED')
  metrics.startup = { previousPid: baseline.backendPid, currentPid: pid, devProfile: true,
    freshStartupCompleted: true, freshProductSeedingSkipped: true }
  console.log(JSON.stringify({ stage, ...metrics.startup }))

  stage = 'health-and-products'
  const health = await request('/actuator/health', { anonymous: true })
  check(health.status === 200 && health.body?.status === 'UP'
    && Object.keys(health.body).every(key => ['status', 'groups'].includes(key)), 'QA_HEALTH_INVALID')
  await login('ADMIN')
  const products = []
  for (let page = 0; page < 5; page++) {
    const response = await request(`/api/v1/products?page=${page}&size=100&sort=id,asc`)
    check(response.status === 200 && response.body.totalElements === 500
      && response.body.content.length === 100, 'QA_PRODUCT_COUNT_CHANGED')
    products.push(...response.body.content)
  }
  check(new Set(products.map(product => product.id)).size === 500, 'QA_PRODUCT_IDS_CHANGED')
  check(!products.some(product => product.name?.startsWith('qa-') || product.category?.startsWith('qa-')),
    'QA_RECORDS_REMAIN')
  const digest = createHash('sha256').update(JSON.stringify(canonical(products))).digest('hex')
  check(digest === baseline.inventorySha256, 'QA_PRODUCT_INVENTORY_CHANGED')
  metrics.products = { healthHttp: 200, healthStatus: 'UP', totalElements: 500, qaRecords: 0,
    fullInventoryFingerprintMatches: true }
  console.log(JSON.stringify({ stage, ...metrics.products }))

  stage = 'users'
  await login('USER')
  const metadata = await execute(process.execPath,
    [fileURLToPath(new URL('./support/mongo-user-metadata.mjs', import.meta.url)), '--approved-metadata'],
    { cwd: root, timeout: 45_000, maxBuffer: 32_768 })
  const lines = metadata.stdout.trim().split('\n')
  check(lines.length === 1, 'QA_METADATA_RESULT_INVALID')
  const result = JSON.parse(lines[0])
  const { item, ...counts } = result
  check(item === 'G4' && !result.failure && isDeepStrictEqual(counts, baseline.mongoMetadata), 'QA_USER_METADATA_CHANGED')
  check(counts.usersCount === 2 && counts.adminCount === 1 && counts.userCount === 1
    && counts.duplicateUsernameGroups === 0 && counts.uniqueUsernameIndex, 'QA_USER_DUPLICATION_OR_INDEX_INVALID')
  metrics.users = { ...counts, adminLoginAndMePassed: true, userLoginAndMePassed: true }
  console.log(JSON.stringify({ stage, ...metrics.users }))
} catch (error) {
  failure = { stage, code: error instanceof QaError ? error.message : 'QA_OPERATION_FAILED' }
  console.log(JSON.stringify({ failure }))
} finally {
  cookies.clear()
}

console.log(JSON.stringify({ item: 'G4', status: failure ? 'FAILED' : 'PASSED', ...metrics }))
if (failure) process.exitCode = 1
