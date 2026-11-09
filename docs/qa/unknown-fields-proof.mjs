import { randomUUID } from 'node:crypto'

// One-shot, memory-only authentication. Never emit response bodies or headers.
const origin = 'http://localhost:8080'
const scope = `qa-b3-${randomUUID()}`
const cookies = new Map()
const ids = new Set()
let writesAllowed = false
let rateLimited = false
let failed = false
const suppliedId = `qa-client-id-${randomUUID()}`
function check(condition, reason) { if (!condition) throw new Error(reason) }
async function request(path, method = 'GET', body, csrf) {
  check(path.startsWith('/api/v1/'), 'NONLOCAL_PATH')
  const headers = { Accept: 'application/json, application/problem+json' }
  if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (csrf) headers['X-XSRF-TOKEN'] = csrf
  const response = await fetch(`${origin}${path}`, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (response.status === 429) { rateLimited = true; throw new Error('RATE_LIMITED_429') }
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
  return { status: response.status, body: response.status === 204 ? null : await response.json() }
}
async function csrf() {
  const result = await request('/api/v1/auth/csrf')
  check(result.status === 200 && typeof result.body.token === 'string', 'CSRF_FAILED')
  return result.body.token
}
async function count() {
  const result = await request('/api/v1/products?size=1')
  check(result.status === 200, 'COUNT_FAILED')
  return result.body.totalElements
}
function owned(product) { return product?.category === scope && product?.name?.startsWith(`${scope}-`) }

try {
  check(Boolean(process.env.DEV_ADMIN_PASSWORD), 'MISSING_ADMIN_PASSWORD')
  const login = await request('/api/v1/auth/login', 'POST', {
    username: process.env.DEV_ADMIN_USERNAME || 'admin', password: process.env.DEV_ADMIN_PASSWORD,
  }, await csrf())
  check(login.status === 200 && login.body.roles?.includes('ADMIN'), 'LOGIN_FAILED')
  check(await count() === 500, 'BASELINE_NOT_500')
  writesAllowed = true
  const result = await request('/api/v1/products', 'POST', {
    name: `${scope}-extra-fields`, description: 'QA unknown-field verification', category: scope,
    price: 12.5, stock: 1, tags: ['qa'], specs: { purpose: 'verification' }, active: true,
    id: suppliedId, roles: ['ADMIN'],
  }, await csrf())
  if (result.status === 201) {
    check(owned(result.body) && typeof result.body.id === 'string', 'OWNERSHIP_UNCONFIRMED')
    ids.add(result.body.id)
    const fetched = await request(`/api/v1/products/${encodeURIComponent(result.body.id)}`)
    check(fetched.status === 200 && owned(fetched.body), 'GET_FAILED')
    const generated = result.body.id !== suppliedId && /^[a-f0-9]{24}$/i.test(result.body.id)
    const ignoredRoles = !Object.hasOwn(result.body, 'roles') && !Object.hasOwn(fetched.body, 'roles')
    const supplied = await request(`/api/v1/products/${encodeURIComponent(suppliedId)}`)
    check(generated && fetched.body.id === result.body.id && ignoredRoles && supplied.status === 404,
      'EXTRA_FIELDS_NOT_SAFELY_IGNORED')
    console.log(JSON.stringify({check:'pre-fix-extra-fields',postStatus:201,getStatus:200,
      serverGeneratedId:true,rolesNotExposed:true,suppliedIdGetStatus:404}))
  } else {
    check(result.status === 400 && result.body.status === 400, 'UNEXPECTED_POST_STATUS')
    check(await count() === 500, 'REJECTED_WRITE_CHANGED_COUNT')
    console.log(JSON.stringify({check:'pre-fix-extra-fields',postStatus:400,
      alreadyStrict:true,createdProduct:false,ignoredFieldProof:'not-applicable-rejected'}))
  }
} catch (error) {
  failed = true
  const allowed = ['MISSING_ADMIN_PASSWORD','RATE_LIMITED_429','LOGIN_FAILED','BASELINE_NOT_500',
    'EXTRA_FIELDS_NOT_SAFELY_IGNORED','UNEXPECTED_POST_STATUS']
  console.log(JSON.stringify({status:'BLOCKED_OR_FAILED',reason:allowed.includes(error.message) ? error.message : 'SAFE_CHECK_FAILED'}))
} finally {
  if (writesAllowed && !rateLimited) {
    try {
      const found = await request(`/api/v1/products?size=100&category=${encodeURIComponent(scope)}`)
      check(found.status === 200 && found.body.totalElements <= 2, 'CLEANUP_QUERY_FAILED')
      for (const product of found.body.content) {
        check(owned(product), 'CLEANUP_NOT_OWNED')
        ids.add(product.id)
      }
      for (const id of ids) {
        const existing = await request(`/api/v1/products/${encodeURIComponent(id)}`)
        if (existing.status === 404) continue
        check(existing.status === 200 && owned(existing.body), 'CLEANUP_NOT_OWNED')
        const removed = await request(`/api/v1/products/${encodeURIComponent(id)}`, 'DELETE', undefined, await csrf())
        check(removed.status === 204, 'CLEANUP_DELETE_FAILED')
      }
      const finalCount = await count()
      check(finalCount === 500, 'CLEANUP_COUNT_FAILED')
      console.log(JSON.stringify({check:'cleanup',deletedRecords:ids.size,finalCount}))
    } catch {
      failed = true
      console.log(JSON.stringify({status:'BLOCKED',reason:'CLEANUP_INCOMPLETE'}))
    }
  }
  cookies.clear()
}
if (failed) process.exitCode = 1
