import { test } from 'node:test'
import assert from 'node:assert/strict'
import { c6, selectItem } from './product-contract-checks.mjs'

// Fake transport only: no credentials, services, or persistent data are involved.
function backend(fault = {}) {
  let clock = Date.UTC(2026, 10, 6, 12)
  let stored = null
  let hiddenRecords = 0
  let reads = 0
  const calls = []
  const clone = value => structuredClone(value)
  const stamp = () => new Date(clock).toISOString().replace(/Z$/, '123456Z')
  const persisted = value => ({ ...clone(value),
    createdAt: value.createdAt ? new Date(value.createdAt).toISOString() : value.createdAt,
    updatedAt: value.updatedAt ? new Date(value.updatedAt).toISOString() : value.updatedAt })
  const problem = status => ({ status, type:'application/problem+json',
    body:{status,title:'Rejected request',detail:'The request was rejected.'} })
  const ok = (status, body) => ({status,type:'application/json',body:clone(body)})
  const allowed = ['name','description','category','price','stock','tags','specs','active']
  return {
    calls,
    now: () => clock,
    scan: async () => ({ count:500 + (stored ? 1 : 0) + hiddenRecords,
      qaRecords:(stored ? 1 : 0) + hiddenRecords }),
    send: async (path, method = 'GET', body) => {
      calls.push({path,method})
      if (path === '/api/v1/auth/me') return ok(200,{roles:[fault.changedRole ? 'USER' : 'ADMIN']})
      if (method === 'POST') {
        if (Object.keys(body).some(key => !allowed.includes(key))) {
          if (fault.hiddenPostCreate) hiddenRecords++
          return fault.acceptPost ? ok(201,body) : problem(400)
        }
        const created = { ...clone(body), id:'507f1f77bcf86cd799439011', version:0,
          createdAt:stamp(), updatedAt:stamp() }
        if (fault.badId) created.id = 'qa-client-supplied'
        if (fault.badVersion) created.version = 99
        if (fault.missingTimestamp) created.createdAt = null
        if (fault.futureTimestamp) created.updatedAt = new Date(clock + 1000).toISOString()
        if (fault.responseRoles) created.roles = ['ADMIN']
        stored = persisted(created)
        return ok(201,created)
      }
      if (method === 'GET') {
        reads++
        const result = clone(stored)
        if (reads === 1 && fault.initialTimestampShift) result.createdAt = new Date(clock + 1).toISOString()
        if (reads === 1 && fault.initialSubmillisecondShift) result.createdAt = new Date(clock).toISOString().replace(/Z$/, '000001Z')
        if (reads === 1 && fault.initialIdChange) result.id = '507f1f77bcf86cd799439012'
        if (fault.reorderKeys) return ok(200,Object.fromEntries(Object.entries(result).reverse()))
        return ok(200,result)
      }
      if (method === 'PUT') {
        if (Object.keys(body).some(key => ![...allowed,'version'].includes(key))) {
          if (fault.mutatedField) {
            const replacements = { id:'507f1f77bcf86cd799439012', version:99,
              createdAt:new Date(clock + 1).toISOString(), updatedAt:new Date(clock + 1).toISOString(),
              description:'QA unexpected mutation' }
            stored[fault.mutatedField] = fault.submillisecondMutation
              ? new Date(clock).toISOString().replace(/Z$/, '000001Z')
              : replacements[fault.mutatedField]
          }
          if (fault.hiddenPutCreate) hiddenRecords++
          return problem(400)
        }
        if (body.version !== stored.version) {
          if (fault.staleMutates) stored.updatedAt = new Date(clock + 2).toISOString()
          return problem(fault.staleStatus || 409)
        }
        clock += 1000
        const updated = { ...stored, ...clone(body),
          version:stored.version + (fault.noVersionIncrement ? 0 : 1), updatedAt:stamp() }
        stored = persisted(updated)
        return ok(200,updated)
      }
      throw new Error('Unexpected fake request')
    },
  }
}

// Fail closed if any accidental real transport is used by an offline self-test.
globalThis.fetch = async () => { throw new Error('OFFLINE_SELF_TEST_NETWORK_FORBIDDEN') }

test('strict C6 permits only the initial persistence precision bridge and checks stale updates', async () => {
  const fake = backend()
  const result = await c6(fake)
  assert.equal(result.invalidPostCases,7)
  assert.equal(result.invalidPutCases,6)
  assert.equal(result.unknownFieldCases,13)
  assert.equal(result.httpStatus,400)
  assert.equal(result.staleVersionStatus,409)
  assert.equal(result.generatedFieldsVerified,true)
  assert.equal(result.persistedSnapshotsUnchanged,true)
  assert.deepEqual(await fake.scan(),{count:501,qaRecords:1}) // Outer runner owns finally cleanup.
})

test('structural comparison tolerates key reordering, not value changes', async () => {
  await c6(backend({reorderKeys:true}))
})

const failures = [
  ['unknown POST accepted', {acceptPost:true}, 'PROBLEM_CONTRACT_FAILED'],
  ['unknown POST secretly creates a record', {hiddenPostCreate:true}, 'C6_REJECTED_POST_CREATED_RECORD'],
  ['invalid generated id', {badId:true}, 'C6_GENERATED_FIELDS_FAILED'],
  ['invalid initial version', {badVersion:true}, 'C6_GENERATED_FIELDS_FAILED'],
  ['missing generated timestamp', {missingTimestamp:true}, 'C6_GENERATED_TIMESTAMPS_FAILED'],
  ['timestamp outside create request window', {futureTimestamp:true}, 'C6_GENERATED_TIMESTAMPS_FAILED'],
  ['roles leaked into product response', {responseRoles:true}, 'C6_GENERATED_FIELDS_FAILED'],
  ['initial GET timestamp differs by a millisecond', {initialTimestampShift:true}, 'C6_PERSISTENCE_TIMESTAMP_MISMATCH'],
  ['initial GET retains an altered submillisecond value', {initialSubmillisecondShift:true}, 'C6_PERSISTENCE_TIMESTAMP_MISMATCH'],
  ['initial GET id changes', {initialIdChange:true}, 'C6_INITIAL_GET_FIELDS_FAILED'],
  ['rejected PUT creates a record', {hiddenPutCreate:true}, 'C6_REJECTED_PUT_CREATED_RECORD'],
  ['successful PUT fails to increment version', {noVersionIncrement:true}, 'C6_VALID_UPDATE_FIELDS_FAILED'],
  ['stale PUT returns 200', {staleStatus:200}, 'PROBLEM_CONTRACT_FAILED'],
  ['stale PUT returns 400 instead of 409', {staleStatus:400}, 'PROBLEM_CONTRACT_FAILED'],
  ['stale PUT changes a persisted timestamp', {staleMutates:true}, 'C6_STALE_PUT_MUTATED_SNAPSHOT'],
  ['authentication role changes', {changedRole:true}, 'C6_AUTH_CHANGED'],
]
for (const [label, fault, code] of failures) {
  test(`fails closed: ${label}`, async () => {
    await assert.rejects(c6(backend(fault)), {message:code})
  })
}
for (const field of ['id','version','createdAt','updatedAt','description']) {
  test(`rejected PUT cannot change persisted ${field}`, async () => {
    await assert.rejects(c6(backend({mutatedField:field})), {message:'C6_REJECTED_PUT_MUTATED_SNAPSHOT'})
  })
}
for (const field of ['createdAt','updatedAt']) {
  test(`rejected PUT cannot change ${field} even within the same millisecond`, async () => {
    await assert.rejects(c6(backend({mutatedField:field,submillisecondMutation:true})),
      {message:'C6_REJECTED_PUT_MUTATED_SNAPSHOT'})
  })
}

test('selection allows exactly one explicit item and refuses implicit batching', () => {
  assert.equal(selectItem('C6'),c6)
  assert.equal(typeof selectItem('B2'),'function')
  assert.equal(typeof selectItem('B3'),'function')
  assert.equal(selectItem('inventory'),null)
  for (const value of [undefined,'','all','B2,C6','toString','__proto__']) {
    assert.throws(() => selectItem(value), {message:'INVALID_ITEM'})
  }
})
