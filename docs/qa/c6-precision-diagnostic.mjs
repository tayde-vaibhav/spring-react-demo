import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

// Independent diagnostic: the original C6 harness and its assertions remain unchanged.
const scope = `qa-c6-diagnostic-${randomUUID()}`
const cookies = new Map()
const ids = new Set()
let canWrite = false
let limited = false
let failed = false
const check = (condition, code) => { if (!condition) throw new Error(code) }
const owned = product => product?.category === scope && product?.name === `${scope}-fixture`

async function request(path, method = 'GET', body) {
  check(path.startsWith('/api/v1/'), 'BAD_PATH')
  const headers = { Accept:'application/json, application/problem+json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!['GET','HEAD','OPTIONS'].includes(method)) {
    const token = await request('/api/v1/auth/csrf')
    check(token.status === 200 && typeof token.body.token === 'string', 'CSRF_FAILED')
    headers['X-XSRF-TOKEN'] = token.body.token
  }
  if (cookies.size) headers.Cookie = [...cookies].map(([key,value]) => `${key}=${value}`).join('; ')
  const response = await fetch(`http://localhost:8080${path}`, {
    method, headers, redirect:'error', signal:AbortSignal.timeout(8000),
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  })
  if (response.status === 429) { limited=true; throw new Error('RATE_LIMITED_429') }
  for (const cookie of response.headers.getSetCookie()) {
    const pair=cookie.split(';',1)[0]
    const separator=pair.indexOf('=')
    if (separator > 0) cookies.set(pair.slice(0,separator),pair.slice(separator+1))
  }
  return {status:response.status,body:response.status===204 ? null : await response.json()}
}
async function inventory(expected) {
  const products=[]
  const pages=Math.ceil(expected/100)
  for (let page=0;page<pages;page++) {
    const result=await request(`/api/v1/products?page=${page}&size=100&sort=id,asc`)
    check(result.status===200 && result.body.totalElements===expected,'BAD_COUNT')
    products.push(...result.body.content)
  }
  check(products.length===expected && new Set(products.map(product=>product.id)).size===expected,'UNSTABLE_INVENTORY')
  return {count:products.length,qaRecords:products.filter(product=>product.name?.startsWith('qa-') || product.category?.startsWith('qa-')).length}
}
function serverFields(product) {
  return {id:product.id,createdAt:product.createdAt,updatedAt:product.updatedAt}
}
function withoutTimestamps(product) {
  return Object.fromEntries(Object.entries(product).filter(([key])=>!['createdAt','updatedAt'].includes(key)))
}
function badField400(result) {
  check(result.status===400 && result.body?.status===400,'UNKNOWN_FIELD_NOT_REJECTED')
}

try {
  check(Boolean(process.env.DEV_ADMIN_PASSWORD),'MISSING_ADMIN_PASSWORD')
  const login=await request('/api/v1/auth/login','POST',{
    username:process.env.DEV_ADMIN_USERNAME || 'admin',password:process.env.DEV_ADMIN_PASSWORD,
  })
  check(login.status===200 && login.body.roles?.includes('ADMIN'),'LOGIN_FAILED')
  const initial=await inventory(500)
  check(initial.qaRecords===0,'EXISTING_QA_RECORDS')
  canWrite=true
  const input={name:`${scope}-fixture`,category:scope,description:'QA precision diagnostic',
    price:19.99,stock:3,tags:['qa'],specs:{dimensions:{width:3}},active:true}
  const created=await request('/api/v1/products','POST',input)
  if (created.status===201 && owned(created.body)) ids.add(created.body.id)
  check(created.status===201 && owned(created.body),'CREATE_FAILED')
  const product=created.body
  const path=`/api/v1/products/${encodeURIComponent(product.id)}`
  const first=await request(path)
  check(first.status===200 && owned(first.body),'FIRST_GET_FAILED')
  // Match the first iteration of the unchanged C6 harness.
  badField400(await request('/api/v1/products','POST',{...input,id:'qa-client-id'}))
  badField400(await request(path,'PUT',{...input,version:product.version,id:'qa-client-id'}))
  const read=await request(path)
  check(read.status===200 && owned(read.body),'SECOND_GET_FAILED')
  const originalAssertion=read.status===200 && JSON.stringify(read.body)===JSON.stringify(product)
  const differentFields=[...new Set([...Object.keys(product),...Object.keys(read.body)])]
    .filter(key=>!isDeepStrictEqual(product[key],read.body[key]))
  const onlyTimestampDifference=differentFields.length>0
    && differentFields.every(key=>['createdAt','updatedAt'].includes(key))
  const sameAtMillisecondPrecision=['createdAt','updatedAt'].every(key=>
    Number.isFinite(Date.parse(product[key])) && Date.parse(product[key])===Date.parse(read.body[key]))
  const persistedSnapshotUnchanged=isDeepStrictEqual(first.body,read.body)
  console.log(JSON.stringify({check:'original-C6-assertion-reproduction',
    originalAssertionPassed:originalAssertion,compared:{POST:serverFields(product),initialGET:serverFields(first.body),afterRejectedPUT:serverFields(read.body)},
    differentFields,onlyTimestampDifference,sameAtMillisecondPrecision,
    allNonTimestampFieldsEqual:isDeepStrictEqual(withoutTimestamps(product),withoutTimestamps(read.body)),
    idUnchanged:product.id===read.body.id,versionUnchanged:product.version===read.body.version,persistedSnapshotUnchanged,
    attemptedExtraIdPOST:400,attemptedExtraIdPUT:400}))
  check(!originalAssertion && onlyTimestampDifference && sameAtMillisecondPrecision
    && persistedSnapshotUnchanged && isDeepStrictEqual(withoutTimestamps(product),withoutTimestamps(read.body)),
    'NOT_CONFIRMED_AS_PRECISION_ONLY')
} catch (error) {
  failed=true
  const codes=['MISSING_ADMIN_PASSWORD','RATE_LIMITED_429','LOGIN_FAILED','BAD_COUNT','EXISTING_QA_RECORDS',
    'NOT_CONFIRMED_AS_PRECISION_ONLY','UNKNOWN_FIELD_NOT_REJECTED']
  console.log(JSON.stringify({check:'diagnosis',status:'FAILED_OR_BLOCKED',
    reason:codes.includes(error.message)?error.message:'SAFE_DIAGNOSTIC_FAILED'}))
} finally {
  if (canWrite && !limited) {
    try {
      const found=await request(`/api/v1/products?size=100&category=${encodeURIComponent(scope)}`)
      check(found.status===200 && found.body.totalElements<=2,'CLEANUP_QUERY_FAILED')
      for(const product of found.body.content) {check(owned(product),'NOT_OWNED');ids.add(product.id)}
      for(const id of ids) {
        const path=`/api/v1/products/${encodeURIComponent(id)}`
        const existing=await request(path)
        if(existing.status===404)continue
        check(existing.status===200 && owned(existing.body),'NOT_OWNED')
        check((await request(path,'DELETE')).status===204,'DELETE_FAILED')
      }
      const final=await inventory(500)
      check(final.qaRecords===0,'LEFTOVER_QA_RECORDS')
      console.log(JSON.stringify({check:'cleanup',...final}))
    } catch {failed=true;console.log(JSON.stringify({check:'cleanup',status:'FAILED',reason:'CLEANUP_INCOMPLETE'}))}
  }
  cookies.clear()
}
if(failed)process.exitCode=1
