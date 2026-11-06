// G3: node frontend/e2e/mongo-outage.mjs --approved-stop
// DESTRUCTIVE TO AVAILABILITY: requires explicit QA approval for every run.
// Stops/restarts only this checkout's existing Mongo container, never volumes.
// One env-var ADMIN login; localhost reads only; no .env reads or recordings.
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const origin = 'http://localhost:8080'
const cookies = new Map()
const metrics = { productWrites: 0, logins: 0, outage: {}, recovery: null }
let container
let mounts
let baseline
let stopAttempted = false
let failure
let recoveryFailure
let stage = 'preflight'

class QaError extends Error {}
function check(condition, code) { if (!condition) throw new QaError(code) }
function safeError(error) { return error instanceof QaError ? error.message : 'QA_OPERATION_FAILED' }
async function docker(args, timeout = 15_000) {
  const result = await execute('docker', args, { timeout, maxBuffer: 32_768 })
  return result.stdout.trim()
}

async function state() {
  // Select individual metadata fields; never inspect Env or healthcheck output.
  const format = '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|'
    + '{{index .Config.Labels "com.docker.compose.project.working_dir"}}|'
    + '{{index .Config.Labels "com.docker.compose.service"}}|{{json .Mounts}}'
  const [running, health, directory, service, json] = (await docker(['inspect', '--format', format, container])).split('|')
  check(directory === root && service === 'mongodb', 'QA_WRONG_CONTAINER')
  const volumes = JSON.parse(json).map(mount => ({ type: mount.Type, name: mount.Name, destination: mount.Destination }))
  check(volumes.some(mount => mount.type === 'volume' && mount.destination === '/data/db' && mount.name),
    'QA_NAMED_VOLUME_MISSING')
  return { running: running === 'true', health, volumes }
}

async function request(path, { method = 'GET', body, token, timeout = 8000, anonymous = false } = {}) {
  check(path.startsWith('/api/v1/') || path === '/actuator/health', 'QA_INVALID_PATH')
  const started = performance.now()
  const response = await fetch(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(timeout),
    headers: { Accept: 'application/json, application/problem+json',
      ...(!anonymous && cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      ...(token ? { 'X-XSRF-TOKEN': token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    const maxAge = header.match(/;\s*Max-Age=(-?\d+)/i)
    if (!value || (maxAge && Number(maxAge[1]) <= 0)) cookies.delete(name)
    else cookies.set(name, value)
  }
  check(response.status !== 429, 'QA_RATE_LIMITED_NO_WAIT')
  let json
  try { json = await response.json() } catch { throw new QaError('QA_NON_JSON_RESPONSE') }
  return { status: response.status, type: response.headers.get('content-type') || '', body: json,
    elapsedMs: Math.round(performance.now() - started) }
}

function sanitized(body) {
  const text = JSON.stringify(body)
  const secretMatch = ['DEV_ADMIN_PASSWORD', 'DEV_USER_PASSWORD']
    .some(key => process.env[key] && text.includes(process.env[key]))
  return !secretMatch && !/eyJ[A-Za-z0-9_-]{8,}|mongodb(?:\+srv)?:\/\/|27017|localhost|127\.0\.0\.1|stackTrace|\bstack\b|com\.vaibhav|org\.springframework|com\.mongodb|java\.lang|Mongo\w*Exception|\bat\s+\S+\(/i.test(text)
}

function health(response, status, http) {
  check(response.status === http && response.body?.status === status, 'QA_HEALTH_STATUS_INVALID')
  check(Object.keys(response.body).every(key => ['status', 'groups'].includes(key))
    && sanitized(response.body), 'QA_HEALTH_DETAILS_LEAK')
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
    'QA_RECORDS_REMAIN')
  return all
}

async function restore() {
  const started = performance.now()
  await docker(['start', container], 20_000)
  console.log(JSON.stringify({ stage: 'recovery', containerStartRequested: true }))
  const deadline = performance.now() + 60_000
  let recovered = false
  while (performance.now() < deadline) {
    const current = await state()
    check(isDeepStrictEqual(current.volumes, mounts), 'QA_VOLUME_CHANGED')
    if (current.running && current.health === 'healthy') {
      try {
        const response = await request('/actuator/health', { anonymous: true })
        health(response, 'UP', 200)
        recovered = true
        break
      } catch (error) {
        if (error instanceof QaError && error.message === 'QA_HEALTH_DETAILS_LEAK') throw error
      }
    }
    await delay(2000)
  }
  check(recovered, 'QA_RECOVERY_TIMEOUT')
  const final = await inventory()
  check(isDeepStrictEqual(final, baseline), 'QA_SEEDED_INVENTORY_CHANGED')
  metrics.recovery = { containerHealthy: true, healthHttp: 200, healthStatus: 'UP',
    totalElements: 500, qaRecords: 0, seededRecordsUnchanged: true, namedVolumeUnchanged: true,
    elapsedMs: Math.round(performance.now() - started) }
  console.log(JSON.stringify({ stage: 'recovery', ...metrics.recovery }))
}

try {
  check(process.argv.includes('--approved-stop'), 'QA_STOP_APPROVAL_REQUIRED')
  check(Boolean(process.env.DEV_ADMIN_PASSWORD), 'QA_MISSING_DEV_ADMIN_PASSWORD')
  const ids = (await docker(['ps', '--all', '--filter', `label=com.docker.compose.project.working_dir=${root}`,
    '--filter', 'label=com.docker.compose.service=mongodb', '--format', '{{.ID}}'])).split('\n').filter(Boolean)
  check(ids.length === 1 && /^[a-f0-9]{12,64}$/.test(ids[0]), 'QA_CONTAINER_NOT_UNIQUE')
  container = ids[0]
  const initial = await state()
  check(initial.running && initial.health === 'healthy', 'QA_MONGO_NOT_HEALTHY')
  mounts = initial.volumes
  health(await request('/actuator/health', { anonymous: true }), 'UP', 200)
  const csrf = await request('/api/v1/auth/csrf')
  check(csrf.status === 200 && typeof csrf.body?.token === 'string'
    && csrf.body.token === cookies.get('XSRF-TOKEN'), 'QA_CSRF_PAIR_INVALID')
  const login = await request('/api/v1/auth/login', { method: 'POST', token: csrf.body.token,
    body: { username: process.env.DEV_ADMIN_USERNAME || 'admin', password: process.env.DEV_ADMIN_PASSWORD } })
  check(login.status === 200 && login.body?.roles?.includes('ADMIN') && cookies.get('ACCESS_TOKEN'),
    'QA_ADMIN_LOGIN_FAILED')
  metrics.logins++
  baseline = await inventory()
  console.log(JSON.stringify({ stage, containerHealthy: true, totalElements: 500, qaRecords: 0 }))

  stage = 'mongo-stop'
  stopAttempted = true // Even a CLI timeout must enter the recovery finally block.
  await docker(['stop', '--time', '10', container], 25_000)
  const stopped = await state()
  check(!stopped.running && isDeepStrictEqual(stopped.volumes, mounts), 'QA_CONTAINER_NOT_STOPPED')
  console.log(JSON.stringify({ stage, running: false, namedVolumeUnchanged: true }))

  stage = 'outage-probes'
  // Drain both requests before recovery, including when one fails/times out.
  const probes = await Promise.allSettled([
    request('/actuator/health', { timeout: 45_000, anonymous: true }),
    request('/api/v1/products?page=0&size=1', { timeout: 45_000 }),
  ])
  check(probes.every(result => result.status === 'fulfilled'), 'QA_OUTAGE_PROBE_TIMEOUT_OR_FAILURE')
  const [healthResult, api] = probes.map(result => result.value)
  metrics.outage = { healthHttp: healthResult.status, healthStatus: healthResult.body?.status,
    healthElapsedMs: healthResult.elapsedMs, apiHttp: api.status, apiElapsedMs: api.elapsedMs,
    healthSanitized: sanitized(healthResult.body), apiSanitized: sanitized(api.body),
    problemDetail: api.type.includes('application/problem+json') && api.body?.status === api.status }
  // Emit only aggregate codes/booleans, never error bodies or header values.
  console.log(JSON.stringify({ stage, ...metrics.outage }))
  health(healthResult, 'DOWN', 503)
  check([500, 503].includes(api.status) && metrics.outage.problemDetail
    && typeof api.body.title === 'string' && typeof api.body.detail === 'string', 'QA_OUTAGE_API_CONTRACT_FAILED')
  check(Object.keys(api.body).every(key => ['type', 'title', 'status', 'detail', 'instance'].includes(key))
    && metrics.outage.apiSanitized, 'QA_OUTAGE_API_LEAK')
  check(!((await state()).running), 'QA_MONGO_UNEXPECTEDLY_RUNNING')
} catch (error) {
  failure = { stage, code: safeError(error) }
  console.log(JSON.stringify({ failure }))
} finally {
  if (stopAttempted) {
    try { await restore() } catch (error) {
      recoveryFailure = safeError(error)
      console.log(JSON.stringify({ recoveryFailure, requiresAttention: true }))
    }
  }
  cookies.clear()
}

console.log(JSON.stringify({ item: 'G3', status: failure || recoveryFailure ? 'FAILED' : 'PASSED', ...metrics }))
if (failure || recoveryFailure) process.exitCode = 1
