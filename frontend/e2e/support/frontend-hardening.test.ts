import { describe, expect, it } from 'vitest'
import { formLabelPattern } from './form-label'
import { QaCounter } from './qa-counter.mjs'
import { resultRecord } from './safe-reporter'

describe('literal form labels (offline)', () => {
  it('preserves all existing label and required-marker variants', () => {
    for (const label of ['Username', 'Password', 'Product name', 'Category', 'Price', 'Stock quantity', 'Description', 'Tags']) {
      const pattern = formLabelPattern(label)
      for (const suffix of ['', ' ', '*', ' * ', '\u2009*\u00a0', '\t*\n']) {
        expect(pattern.test(label + suffix)).toBe(true)
      }
      for (const value of ['prefix ' + label, label + ' suffix', label + '**', label.toLowerCase()]) {
        expect(pattern.test(value)).toBe(false)
      }
    }
  })

  it('treats every regexp metacharacter in a label literally', () => {
    for (const label of ['Specifications (JSON)', 'Price [USD]', 'a.b', 'a+b?', '^name$', 'a|b', '{2}', 'a\\b', '[.*]']) {
      const pattern = formLabelPattern(label)
      expect(pattern.test(label)).toBe(true)
      expect(pattern.test(label + ' *')).toBe(true)
      expect(pattern.test('prefix ' + label)).toBe(false)
      expect(pattern.test(label + ' suffix')).toBe(false)
    }
    expect(formLabelPattern('a|b').test('a')).toBe(false)
    expect(formLabelPattern('[.*]').test('anything')).toBe(false)
    expect(formLabelPattern('a.b').test('axb')).toBe(false)
  })

  it('does not reinterpret a regex-looking long label', () => {
    const label = '(a+)+$' + 'x'.repeat(1_000)
    expect(formLabelPattern(label).test(label)).toBe(true)
    expect(formLabelPattern(label).test('a'.repeat(1_000))).toBe(false)
  })
})

describe('prototype-safe QA counters (offline)', () => {
  it('preserves numeric/string status totals and the existing nested JSON schema', () => {
    const statuses = new QaCounter()
    expect(statuses.size).toBe(0)
    expect(statuses.total()).toBe(0)
    expect(statuses.toJSON()).toEqual({})
    for (const key of [200, '200', 201, 409]) statuses.increment(key)
    expect(statuses.size).toBe(3)
    expect(statuses.total()).toBe(4)
    expect(JSON.parse(JSON.stringify({ statuses }))).toEqual({ statuses: { 200: 2, 201: 1, 409: 1 } })
    const errors = new QaCounter()
    errors.increment('TIMEOUT')
    expect(JSON.parse(JSON.stringify({ errors, failedRequests: errors.total() })))
      .toEqual({ errors: { TIMEOUT: 1 }, failedRequests: 1 })
  })

  it('handles prototype names as own numeric data without prototype mutation', () => {
    const counter = new QaCounter()
    const originalPrototypeKeys = Object.getOwnPropertyNames(Object.prototype)
    for (const key of ['__proto__', 'constructor', 'toString']) {
      counter.increment(key)
      counter.increment(key)
    }
    const snapshot = counter.toJSON()
    expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype)
    for (const key of ['__proto__', 'constructor', 'toString']) {
      expect(Object.getOwnPropertyDescriptor(snapshot, key)?.value).toBe(2)
    }
    expect(counter.total()).toBe(6)
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(originalPrototypeKeys)
    expect(Object.getPrototypeOf(Object.prototype)).toBe(null)
  })

  it('returns detached snapshots and rejects unsupported keys without counting them', () => {
    const counter = new QaCounter()
    counter.increment(200)
    const snapshot = counter.toJSON()
    snapshot['200'] = 99
    expect(counter.toJSON()).toEqual({ 200: 1 })
    for (const key of [undefined, null, {}, [], Symbol('qa'), NaN, Infinity]) {
      expect(() => Reflect.apply(counter.increment, counter, [key])).toThrow('QA_INVALID_COUNTER_KEY')
    }
    expect(counter.size).toBe(1)
    expect(counter.total()).toBe(1)
  })
})

describe('bounded safe reporter grammar (offline)', () => {
  it('keeps only the allowed id prefix and bounded optional suffix', () => {
    for (const id of ['E1', 'E9', 'E2.login', 'E5.' + 'x'.repeat(40)]) {
      const record = resultRecord(id + ' qa-private-detail', 'passed', 12, [])
      expect(record).toEqual({ id, status: 'passed', durationMs: 12 })
      expect(JSON.stringify(record).includes('qa-private-detail')).toBe(false)
    }
  })

  it('rejects invalid ids, overlong suffixes and leading/invisible junk', () => {
    for (const title of ['', 'E0', 'E10', 'prefix E2.login', 'E2.' + 'x'.repeat(41), 'E2.x\u202ejunk']) {
      expect(resultRecord(title, 'passed', 0, []).id).toBe('SETUP')
    }
  })

  it('never emits long raw titles or unknown error text', () => {
    const marker = 'qa-private-detail'
    const record = resultRecord('E2.' + 'x'.repeat(100_000) + marker, 'failed', 1,
      [{ message: marker + 'x'.repeat(100_000) }])
    expect(record).toEqual({ id: 'SETUP', status: 'failed', durationMs: 1, reason: 'QA_CHECK_FAILED' })
    expect(JSON.stringify(record).includes(marker)).toBe(false)
  })
})
