// Explicit Node offline suite; not a Vitest/live E2E test. No env/file/network IO.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Safe4C4Diagnostics } from './4c4-diagnostics.mjs'

test('serializes only closed labels, bounded statuses/counts and booleans', () => {
  const diag = new Safe4C4Diagnostics()
  diag.stage('csrf-missing')
  diag.http('logout', 403)
  diag.check('problem', false)
  diag.count('loginRequests', 1)
  const snapshot = diag.snapshot()
  assert.equal(snapshot.stage, 'csrf-missing')
  assert.deepEqual(snapshot.http, [{ stage: 'csrf-missing', endpoint: 'logout', status: 403 }])
  assert.deepEqual(snapshot.checks, [{ stage: 'csrf-missing', check: 'problem', passed: false }])
  assert.equal(snapshot.counts.loginRequests, 1)
  assert.equal(snapshot.bodyCompleted, false)
})

test('rejects arbitrary strings/objects without serializing their content', () => {
  const sentinel = 'qa-private-sentinel'
  const diag = new Safe4C4Diagnostics()
  for (const input of [sentinel, `${sentinel}\r\n`, sentinel.repeat(10000), null, {}, new Error(sentinel), new String('setup')]) {
    for (const action of [() => diag.stage(input), () => diag.http(input, 200),
      () => diag.http('login', input), () => diag.check(input, true), () => diag.check('problem', input),
      () => diag.count(input, 1), () => diag.count('loginRequests', input)]) {
      assert.throws(action, { message: 'QA_INVALID_DIAGNOSTIC' })
    }
  }
  assert.equal(JSON.stringify(diag.snapshot()).includes(sentinel), false)
})

test('rejects nonfinite, negative, fractional or oversized numerical values', () => {
  const diag = new Safe4C4Diagnostics()
  for (const value of [NaN, Infinity, -1, 1.5, 99, 600, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => diag.http('me', value), { message: 'QA_INVALID_DIAGNOSTIC' })
  }
  for (const value of [NaN, Infinity, -1, 1.5, 1000001]) {
    assert.throws(() => diag.count('pageErrors', value), { message: 'QA_INVALID_DIAGNOSTIC' })
  }
  diag.http('logout', 0) // Explicit no-response sentinel, not an HTTP success.
  diag.count('productCount', 500)
})

test('does not evaluate object conversion hooks', () => {
  let calls = 0
  const object = { toString() { calls++; return 'setup' }, toJSON() { calls++; return 'qa-private-sentinel' } }
  const diag = new Safe4C4Diagnostics()
  assert.throws(() => diag.stage(object), { message: 'QA_INVALID_DIAGNOSTIC' })
  assert.throws(() => diag.check('problem', object), { message: 'QA_INVALID_DIAGNOSTIC' })
  assert.equal(calls, 0)
})

test('snapshot mutation cannot inject content back into the collector', () => {
  const diag = new Safe4C4Diagnostics()
  diag.http('me', 200)
  diag.check('admin', true)
  const copy = diag.snapshot()
  copy.http[0].endpoint = 'qa-private-sentinel'
  copy.checks[0].passed = 'qa-private-sentinel'
  copy.counts.loginRequests = 'qa-private-sentinel'
  assert.equal(JSON.stringify(diag.snapshot()).includes('qa-private-sentinel'), false)
})

test('captures rate limit status before any dependent browser operation', () => {
  const diag = new Safe4C4Diagnostics()
  diag.stage('login-initial')
  diag.http('login', 429)
  assert.equal(diag.rateLimited, true)
  assert.equal(diag.snapshot().bodyCompleted, false)
})

test('bounds the number of stored response and check records', () => {
  const diag = new Safe4C4Diagnostics()
  for (let index = 0; index < 128; index++) { diag.http('me', 200); diag.check('admin', true) }
  assert.throws(() => diag.http('me', 200), { message: 'QA_INVALID_DIAGNOSTIC' })
  assert.throws(() => diag.check('admin', true), { message: 'QA_INVALID_DIAGNOSTIC' })
  assert.equal(diag.snapshot().http.length, 128)
})
