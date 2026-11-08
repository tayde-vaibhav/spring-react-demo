import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import { canonical } from './canonical.mjs'

describe('G4 canonical serialization (offline)', () => {
  it('preserves complete values and array order while sorting nested object keys', () => {
    const input = Object.freeze([
      Object.freeze({ z: null, a: Object.freeze({ y: 2, b: false }) }),
      Object.freeze({ tags: Object.freeze(['z', 'a']), price: 12.5, name: 'qa-synthetic' }),
    ])
    const before = JSON.stringify(input)
    const result = canonical(input)

    expect(JSON.stringify(result)).toBe(
      '[{"a":{"b":false,"y":2},"z":null},{"name":"qa-synthetic","price":12.5,"tags":["z","a"]}]',
    )
    expect(result).toStrictEqual(input)
    expect(result).not.toBe(input)
    expect(result[0]).not.toBe(input[0])
    expect(result[0].a).not.toBe(input[0].a)
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(canonical(result))).toBe(JSON.stringify(result))
  })

  it('retains __proto__ and constructor as own data keys without prototype mutation', () => {
    const input = JSON.parse(
      '{"z":0,"constructor":{"prototype":{"qaCanonicalPollution":"constructor-data"}},'
      + '"__proto__":{"z":2,"a":1},"items":[{"constructor":"own","__proto__":{"qaCanonicalPollution":"nested-data"}}]}',
    )
    const before = JSON.stringify(input)
    const prototypeDescriptors = Object.getOwnPropertyDescriptors(Object.prototype)
    const prototypeParent = Object.getPrototypeOf(Object.prototype)
    const result = canonical(input)

    expect(JSON.stringify(result)).toBe(
      '{"__proto__":{"a":1,"z":2},"constructor":{"prototype":{"qaCanonicalPollution":"constructor-data"}},'
      + '"items":[{"__proto__":{"qaCanonicalPollution":"nested-data"},"constructor":"own"}],"z":0}',
    )
    expect(Object.keys(result)).toEqual(['__proto__', 'constructor', 'items', 'z'])
    for (const object of [input, input.items[0], result, result.items[0]]) {
      expect(Object.getPrototypeOf(object)).toBe(Object.prototype)
      expect(Object.hasOwn(object, '__proto__')).toBe(true)
      expect(Object.hasOwn(object, 'constructor')).toBe(true)
      expect(Object.getOwnPropertyDescriptor(object, '__proto__')).toMatchObject({
        enumerable: true, configurable: true, writable: true,
      })
    }
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toStrictEqual({ a: 1, z: 2 })
    expect(Object.getOwnPropertyDescriptor(result, 'constructor')?.value).toStrictEqual({
      prototype: { qaCanonicalPollution: 'constructor-data' },
    })
    expect(isDeepStrictEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototypeDescriptors)).toBe(true)
    expect(Object.getPrototypeOf(Object.prototype)).toBe(prototypeParent)
    expect('qaCanonicalPollution' in {}).toBe(false)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('copies only enumerable own string keys, preserving the original Object.keys contract', () => {
    const input = Object.create({ inherited: 'qa-inherited' })
    Object.defineProperties(input, {
      z: { value: 2, enumerable: true },
      a: { value: 1, enumerable: true },
      hidden: { value: 'qa-hidden', enumerable: false },
      [Symbol('qa-symbol')]: { value: 'qa-symbol-value', enumerable: true },
    })

    const result = canonical(input)
    expect(result).toStrictEqual({ a: 1, z: 2 })
    expect(Reflect.ownKeys(result)).toEqual(['a', 'z'])
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it('preserves primitives, empty containers and sparse array positions', () => {
    for (const value of [null, undefined, true, false, 0, -0, 12.5, NaN, Infinity, 'qa-synthetic']) {
      expect(canonical(value)).toBe(value)
    }
    expect(canonical({})).toStrictEqual({})
    expect(canonical([])).toStrictEqual([])
    const sparse = [1]
    sparse.length = 3
    sparse[2] = { z: 2, a: 1 }
    const result = canonical(sparse)
    expect(result).toStrictEqual(sparse)
    expect(Object.hasOwn(result, '1')).toBe(false)
    expect(JSON.stringify(result)).toBe('[1,null,{"a":1,"z":2}]')
  })
})
