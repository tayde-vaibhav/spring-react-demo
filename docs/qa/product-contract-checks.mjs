import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'

const origin = 'http://localhost:8080'
const scope = `qa-contract-${randomUUID()}`
const cookies = new Map()
const knownIds = new Set()
const attemptedNames = new Set()
const attemptedCategories = new Set([scope])
let rateLimited = false
let writesAllowed = false
let failed = false
const check = (condition, reason) => { if (!condition) throw new Error(reason) }
const owned = product => attemptedCategories.has(product?.category) && attemptedNames.has(product?.name)

async function request(path, method = 'GET', body, raw = false) {
  check(path.startsWith('/api/v1/'), 'NONLOCAL_PATH')
  const headers = { Accept: 'application/json, application/problem+json' }
  if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!['GET','HEAD','OPTIONS'].includes(method)) {
    const csrf = await request('/api/v1/auth/csrf')
    check(csrf.status === 200 && typeof csrf.body.token === 'string', 'CSRF_FAILED')
    headers['X-XSRF-TOKEN'] = csrf.body.token
    headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  }
  const response = await fetch(`${origin}${path}`, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  })
  if (response.status === 429) { rateLimited = true; throw new Error('RATE_LIMITED_429') }
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
  return { status: response.status, type: response.headers.get('content-type') || '',
    body: response.status === 204 ? null : await response.json() }
}

function input(label) {
  const product = { name: `${scope}-${label}`, category: scope, description: 'QA contract verification',
    price: 19.99, stock: 3, tags: ['qa'], specs: { dimensions: { width: 3 } }, active: true }
  attemptedNames.add(product.name)
  return product
}
function fields(product) {
  const { name, description, category, price, stock, tags, specs, active } = product
  return { name, description, category, price, stock, tags, specs, active }
}
function problem(result, status) {
  check(result.status === status && result.type.includes('application/problem+json')
    && result.body?.status === status && typeof result.body.title === 'string', 'PROBLEM_CONTRACT_FAILED')
  check(!/UnrecognizedPropertyException|HttpMessageNotReadableException|com\.vaibhav|tools\.jackson|stackTrace|\bat\s+\S+\(/.test(JSON.stringify(result.body)),
    'ERROR_LEAK')
}
async function remember(result) {
  if (result.status === 201 && owned(result.body)) knownIds.add(result.body.id)
  return result
}
async function create(label) {
  check(writesAllowed, 'WRITES_NOT_READY')
  const result = await remember(await request('/api/v1/products', 'POST', input(label)))
  check(result.status === 201 && owned(result.body), 'CREATE_FAILED')
  check(/^[a-f0-9]{24}$/i.test(result.body.id) && Number.isInteger(result.body.version), 'SERVER_FIELDS_FAILED')
  return result.body
}
async function inventory(expectedCount = 500, expectedQaRecords = 0) {
  const products = []
  for (let page = 0; page < Math.ceil(expectedCount / 100); page++) {
    const result = await request(`/api/v1/products?page=${page}&size=100&sort=id,asc`)
    check(result.status === 200 && result.body.totalElements === expectedCount
      && result.body.content.length === Math.min(100, expectedCount - page * 100),
      'INVENTORY_COUNT_FAILED')
    products.push(...result.body.content)
  }
  check(products.length === expectedCount && new Set(products.map(product => product.id)).size === expectedCount,
    'INVENTORY_NOT_STABLE')
  const qaRecords = products.filter(product => product.name?.startsWith('qa-') || product.category?.startsWith('qa-')).length
  check(qaRecords === expectedQaRecords, 'EXISTING_QA_RECORDS')
  return { count: products.length, qaRecords }
}
async function cleanup() {
  const found = await request(`/api/v1/products?size=100&category=${encodeURIComponent(scope)}`)
  check(found.status === 200 && found.body.totalElements <= 20, 'CLEANUP_QUERY_FAILED')
  for (const product of found.body.content) {
    check(owned(product), 'CLEANUP_NOT_OWNED')
    knownIds.add(product.id)
  }
  for (const id of knownIds) {
    const existing = await request(`/api/v1/products/${encodeURIComponent(id)}`)
    if (existing.status === 404) continue
    check(existing.status === 200 && owned(existing.body), 'CLEANUP_NOT_OWNED')
    check((await request(`/api/v1/products/${encodeURIComponent(id)}`, 'DELETE')).status === 204, 'CLEANUP_DELETE_FAILED')
  }
  const result = await inventory()
  knownIds.clear()
  return result
}
async function rejects(path, method, body, raw = false) {
  if (body && typeof body === 'object' && typeof body.name === 'string') attemptedNames.add(body.name)
  if (body && typeof body === 'object' && typeof body.category === 'string' && body.category.startsWith(scope)) {
    attemptedCategories.add(body.category)
  }
  const result = await remember(await request(path, method, body, raw))
  problem(result, 400)
}

async function b2() {
  const product = await create('b2')
  const path = `/api/v1/products/${encodeURIComponent(product.id)}`
  const read = await request(path)
  check(read.status === 200 && read.body.id === product.id && read.body.version === product.version, 'B2_READ_FAILED')
  const updated = await request(path, 'PUT', { ...fields(product), description: 'QA updated contract', version: product.version })
  check(updated.status === 200 && updated.body.version === product.version + 1, 'B2_VERSION_FAILED')
  check((await request(path, 'DELETE')).status === 204, 'B2_DELETE_FAILED')
  problem(await request(path), 404)
  return { create:201, read:200, update:200, delete:204, afterDelete:404, versionIncremented:true }
}
async function b3() {
  const product = await create('b3-update-fixture')
  const path = `/api/v1/products/${encodeURIComponent(product.id)}`
  const base = input('b3-invalid')
  const changes = [
    { name: '' }, { price: -1 }, { price: 0 }, { price: 12.345 }, { stock: -1 },
    { name: `${scope}-${'n'.repeat(201)}` }, { description: 'd'.repeat(2001) },
    { category: `${scope}-${'c'.repeat(101)}` }, { tags: Array(21).fill('qa') },
    { tags: ['t'.repeat(51)] }, { specs: { '$ne': 'qa' } }, { price: { '$gt': 0 } },
    { stock: { '$ne': 0 } }, { id: 'qa-client-id', roles: ['ADMIN'] },
  ]
  for (const change of changes) {
    const post = { ...base, ...change }
    // Oversized category is validated on the owned fixture's PUT only, preserving cleanup discovery.
    if (!change.category) await rejects('/api/v1/products', 'POST', post)
    await rejects(path, 'PUT', { ...fields(product), ...change, category: change.category || scope, version: product.version })
  }
  await rejects('/api/v1/products', 'POST', '{"name":', true)
  await rejects(path, 'PUT', '{"name":', true)
  const unchanged = await request(path)
  check(unchanged.status === 200 && unchanged.body.version === product.version, 'B3_MUTATED_FIXTURE')
  return { invalidCases:29, httpStatus:400, problemDetails:true, fixtureUnchanged:true }
}

function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
}
function withoutTimestamps(product) {
  return Object.fromEntries(Object.entries(product).filter(([key]) => !['createdAt', 'updatedAt'].includes(key)))
}
function persistedResponse(response, saved, code) {
  check(response.status === 200 && isDeepStrictEqual(withoutTimestamps(response.body), withoutTimestamps(saved)), code)
  // Only the POST/PUT-response -> first persisted GET bridge permits sub-ms loss.
  for (const key of ['createdAt', 'updatedAt']) {
    check(validTimestamp(saved[key]) && validTimestamp(response.body[key])
      && Date.parse(response.body[key]) === Date.parse(saved[key])
      && /^0*$/.test((response.body[key].match(/\.(\d+)Z$/)?.[1] || '').slice(3)),
    'C6_PERSISTENCE_TIMESTAMP_MISMATCH')
  }
  return structuredClone(response.body)
}

// Injected I/O is exclusively for deterministic offline harness self-tests.
export async function c6({ send = request, scan = inventory, now = Date.now } = {}) {
  async function expectInventory(count, qaRecords, code) {
    const actual = await scan(count, qaRecords)
    check(actual.count === count && actual.qaRecords === qaRecords, code)
  }
  const extras = [{ id:'qa-client-id' }, { roles:['ADMIN'] }, { createdAt:'2026-01-01T00:00:00Z' },
    { updatedAt:'2026-01-01T00:00:00Z' }, { unexpected:'qa-value' },
    { id:'qa-client-id', roles:['ADMIN'] }]

  await expectInventory(500, 0, 'C6_BASELINE_CHANGED')
  // No fixture exists yet: each rejected POST must leave exactly 500 records.
  for (const extra of [...extras, { version:99 }]) {
    problem(await remember(await send('/api/v1/products', 'POST', { ...input('c6-rejected-post'), ...extra })), 400)
    await expectInventory(500, 0, 'C6_REJECTED_POST_CREATED_RECORD')
  }

  const validInput = input('c6-update-fixture')
  const createStart = now()
  const created = await remember(await send('/api/v1/products', 'POST', validInput))
  const createEnd = now()
  check(created.status === 201 && owned(created.body), 'C6_CREATE_FAILED')
  const product = created.body
  check(/^[a-f0-9]{24}$/i.test(product.id) && product.version === 0
    && !Object.hasOwn(product, 'roles') && isDeepStrictEqual(fields(product), validInput), 'C6_GENERATED_FIELDS_FAILED')
  for (const key of ['createdAt', 'updatedAt']) {
    check(validTimestamp(product[key]) && Date.parse(product[key]) >= createStart
      && Date.parse(product[key]) <= createEnd, 'C6_GENERATED_TIMESTAMPS_FAILED')
  }
  await expectInventory(501, 1, 'C6_CREATE_COUNT_FAILED')
  const path = `/api/v1/products/${encodeURIComponent(product.id)}`
  const snapshot = persistedResponse(await send(path), product, 'C6_INITIAL_GET_FIELDS_FAILED')

  for (const extra of extras) {
    problem(await send(path, 'PUT', { ...fields(snapshot), version:snapshot.version, ...extra }), 400)
    const read = await send(path)
    // No fields or timestamp precision are ignored after taking the GET snapshot.
    check(read.status === 200 && isDeepStrictEqual(read.body, snapshot), 'C6_REJECTED_PUT_MUTATED_SNAPSHOT')
    await expectInventory(501, 1, 'C6_REJECTED_PUT_CREATED_RECORD')
  }

  // Make the original version truly stale through a successful version-aware PUT.
  const updateInput = { ...fields(snapshot), description:'QA legitimate version increment', version:snapshot.version }
  const updateStart = now()
  const updated = await send(path, 'PUT', updateInput)
  const updateEnd = now()
  check(updated.status === 200 && updated.body.id === snapshot.id
    && updated.body.version === snapshot.version + 1 && updated.body.createdAt === snapshot.createdAt
    && !Object.hasOwn(updated.body, 'roles')
    && isDeepStrictEqual(fields(updated.body), fields(updateInput)), 'C6_VALID_UPDATE_FIELDS_FAILED')
  check(validTimestamp(updated.body.updatedAt) && Date.parse(updated.body.updatedAt) >= updateStart
    && Date.parse(updated.body.updatedAt) <= updateEnd
    && Date.parse(updated.body.updatedAt) >= Date.parse(snapshot.updatedAt), 'C6_VALID_UPDATE_TIMESTAMP_FAILED')
  const updatedSnapshot = persistedResponse(await send(path), updated.body, 'C6_UPDATED_GET_FIELDS_FAILED')
  problem(await send(path, 'PUT', { ...updateInput, description:'QA rejected stale write' }), 409)
  const read = await send(path)
  check(read.status === 200 && isDeepStrictEqual(read.body, updatedSnapshot), 'C6_STALE_PUT_MUTATED_SNAPSHOT')
  await expectInventory(501, 1, 'C6_STALE_PUT_CREATED_RECORD')
  const me = await send('/api/v1/auth/me')
  check(me.status === 200 && me.body.roles.includes('ADMIN'), 'C6_AUTH_CHANGED')
  return { unknownFieldCases:13, invalidPostCases:7, invalidPutCases:6, httpStatus:400,
    rejectedPostCount:500, generatedFieldsVerified:true, persistedSnapshotsUnchanged:true,
    validUpdateStatus:200, staleVersionStatus:409, rejectedRequestsLeftFixtureUnchanged:true }
}

export function selectItem(item) {
  const actions = { B2:b2, B3:b3, C6:c6, inventory:null }
  check(Object.hasOwn(actions, item), 'INVALID_ITEM')
  return actions[item]
}

async function main() {
  const item = process.argv[2]
  try {
    const action = selectItem(item)
    check(Boolean(process.env.DEV_ADMIN_PASSWORD), 'MISSING_ADMIN_PASSWORD')
    const login = await request('/api/v1/auth/login', 'POST', {
      username:process.env.DEV_ADMIN_USERNAME || 'admin', password:process.env.DEV_ADMIN_PASSWORD,
    })
    check(login.status === 200 && login.body.roles?.includes('ADMIN'), 'LOGIN_FAILED')
    console.log(JSON.stringify({ check:'baseline', ...await inventory() }))
    writesAllowed = item !== 'inventory'
    if (action) {
      let evidence
      try { evidence = await action() } finally { if (!rateLimited) await cleanup() }
      console.log(JSON.stringify({ id:item, ...evidence, status:'PASSED', finalCount:500, qaRecords:0 }))
    }
  } catch (error) {
    failed = true
    const allowed = ['INVALID_ITEM','RATE_LIMITED_429','MISSING_ADMIN_PASSWORD','LOGIN_FAILED',
      'INVENTORY_COUNT_FAILED','INVENTORY_NOT_STABLE','EXISTING_QA_RECORDS','PROBLEM_CONTRACT_FAILED','ERROR_LEAK',
      'C6_BASELINE_CHANGED','C6_REJECTED_POST_CREATED_RECORD','C6_CREATE_FAILED','C6_GENERATED_FIELDS_FAILED',
      'C6_GENERATED_TIMESTAMPS_FAILED','C6_CREATE_COUNT_FAILED','C6_INITIAL_GET_FIELDS_FAILED',
      'C6_PERSISTENCE_TIMESTAMP_MISMATCH','C6_REJECTED_PUT_MUTATED_SNAPSHOT','C6_REJECTED_PUT_CREATED_RECORD',
      'C6_VALID_UPDATE_FIELDS_FAILED','C6_VALID_UPDATE_TIMESTAMP_FAILED','C6_UPDATED_GET_FIELDS_FAILED',
      'C6_STALE_PUT_MUTATED_SNAPSHOT','C6_STALE_PUT_CREATED_RECORD','C6_AUTH_CHANGED']
    console.log(JSON.stringify({ id:['B2','B3','C6','inventory'].includes(item) ? item : 'SELECTION',
      status:'FAILED_OR_BLOCKED', reason:allowed.includes(error.message) ? error.message : 'SAFE_CONTRACT_CHECK_FAILED' }))
  } finally {
    if (writesAllowed && !rateLimited) {
      try { console.log(JSON.stringify({ check:'final-cleanup', ...await cleanup() })) }
      catch { failed=true; console.log(JSON.stringify({status:'BLOCKED',reason:'CLEANUP_INCOMPLETE'})) }
    }
    cookies.clear()
  }
  if (failed) process.exitCode=1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
