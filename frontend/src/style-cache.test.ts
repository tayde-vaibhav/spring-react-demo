import { describe, expect, it } from 'vitest'
import { createAppStyleCache, readStyleNonce } from './style-cache'

describe('document-scoped style cache', () => {
  it('keeps development independent of the production nonce marker', () => {
    expect(readStyleNonce([], true)).toBeUndefined()
    expect(readStyleNonce(['__FRONTEND_STYLE_NONCE__'], true)).toBeUndefined()
    expect(createAppStyleCache([], true).key).toBe('css')
  })

  it('uses the single server-provided nonce without changing it', () => {
    const nonce = 'A'.repeat(32)
    expect(readStyleNonce([nonce], false) === nonce).toBe(true)
    const cache = createAppStyleCache([nonce], false)
    expect(cache.key).toBe('css')
    expect(cache.nonce === nonce).toBe(true)
    expect(cache.sheet.nonce === nonce).toBe(true)
  })

  it.each([[], [''], ['__FRONTEND_STYLE_NONCE__'], ['A'.repeat(31)], ['A'.repeat(33)],
    ['A'.repeat(31) + '\n'], ['A'.repeat(32) + '\n'], ['A'.repeat(31) + "'"], ['A'.repeat(32), 'B'.repeat(32)]].map(values => ({ values })))('fails closed on invalid/duplicate/unreplaced metadata %#', ({ values }) => {
    expect(() => readStyleNonce(values, false)).toThrow('Frontend security metadata is missing or invalid')
    expect(() => createAppStyleCache(values, false)).toThrow('Frontend security metadata is missing or invalid')
  })
})
