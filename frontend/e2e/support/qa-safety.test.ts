import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrl, isAllowedBrowserUrl, QaApi, QaFailure, QaProducts, safeReason } from './qa-api'
import { resultRecord } from './safe-reporter'

describe('QA harness safety (offline)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('allows only the two exact project origins', () => {
    expect(isAllowedBrowserUrl('http://localhost:5173/login')).toBe(true)
    expect(isAllowedBrowserUrl('http://localhost:8080/api/v1/auth/me')).toBe(true)
    for (const value of [
      'http://evil.example', 'https://localhost:5173', 'http://localhost:5174',
      'http://127.0.0.1:5173', 'http://localhost.evil.example:5173',
      'http://name@localhost:5173', 'file:///tmp/test',
    ]) expect(isAllowedBrowserUrl(value)).toBe(false)
  })

  it('refuses API URL escapes and non-API paths before any fetch', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(apiUrl('/api/v1/products?page=0')).toBe('http://localhost:8080/api/v1/products?page=0')
    expect(apiUrl('/api/v1/products', 'http://localhost:5173')).toBe('http://localhost:5173/api/v1/products')
    expect(() => apiUrl('/api/v1/products', 'http://evil.example')).toThrow('QA_NONLOCAL_URL')
    expect(() => new QaApi('ADMIN', 'http://evil.example')).toThrow('QA_NONLOCAL_URL')
    for (const value of ['http://evil.example/api/v1/products', '//evil.example/api/v1/products', '/actuator/env', '/api/v1/../../outside']) {
      expect(() => apiUrl(value)).toThrow('QA_NONLOCAL_URL')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects non-QA ownership and mutation before the baseline check', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = new QaApi()
    expect(() => new QaProducts(api, 'seeded-product')).toThrow('QA_NOT_OWNED')
    const products = new QaProducts(api, 'qa-e5-abcdef')
    await expect(products.create()).rejects.toThrow('QA_BASELINE_MISMATCH')
    await expect(api.create('qa-e5-abcdef', { ...products.input(), name: 'unowned' })).rejects.toThrow('QA_NOT_OWNED')
    expect(fetchMock).not.toHaveBeenCalled()
    api.dispose()
  })

  it('never emits raw titles, errors, or arbitrary reason strings', () => {
    const record = resultRecord('E2.login private-detail-do-not-emit', 'failed', 12, [
      { message: 'private-detail-do-not-emit' },
    ])
    expect(record).toEqual({ id: 'E2.login', status: 'failed', durationMs: 12, reason: 'QA_CHECK_FAILED' })
    expect(JSON.stringify(record).includes('private-detail-do-not-emit')).toBe(false)
    expect(safeReason([{ message: 'QaFailure: QA_RATE_LIMITED' }])).toBe('QA_RATE_LIMITED')
    expect(safeReason([{ message: 'QA_RATE_LIMITED private-detail-do-not-emit' }])).toBe('QA_CHECK_FAILED')
  })

  it('refuses a non-500 baseline before allowing mutations', async () => {
    const api = new QaApi()
    vi.spyOn(api, 'totalProducts').mockResolvedValue(501)
    const products = new QaProducts(api, 'qa-e5-abcdef')
    await expect(products.start()).rejects.toThrow('QA_BASELINE_MISMATCH')
    await expect(products.create()).rejects.toThrow('QA_BASELINE_MISMATCH')
    api.dispose()
  })

  it('blocks browser writes outside the test scope, including seeded product IDs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = new QaApi()
    vi.spyOn(api, 'totalProducts').mockResolvedValue(500)
    const products = new QaProducts(api, 'qa-e5-abcdef')
    await products.start()
    await expect(products.authorizeBrowserMutation('/api/v1/products', 'POST', products.input())).resolves.toBeUndefined()
    await expect(products.authorizeBrowserMutation('/api/v1/products', 'POST', {
      ...products.input(), category: 'Audio',
    })).rejects.toThrow('QA_NOT_OWNED')
    vi.spyOn(api, 'product').mockResolvedValue({
      ...products.input(), id: 'seeded-id', name: 'seeded', category: 'Audio', version: 0,
    })
    await expect(products.authorizeBrowserMutation('/api/v1/products/seeded-id', 'DELETE', undefined))
      .rejects.toThrow('QA_NOT_OWNED')
    expect(fetchMock).not.toHaveBeenCalled()
    api.dispose()
  })

  it('attempts all tracked cleanups and verifies the total even after failures', async () => {
    const api = new QaApi()
    const products = new QaProducts(api, 'qa-e5-abcdef')
    const total = vi.spyOn(api, 'totalProducts').mockResolvedValue(500)
    const create = vi.spyOn(api, 'create')
      .mockResolvedValueOnce({ ...products.input('one'), id: 'qa-owned-one', version: 0 })
      .mockResolvedValueOnce({ ...products.input('two'), id: 'qa-owned-two', version: 0 })
    vi.spyOn(api, 'scopedProducts').mockRejectedValue(new QaFailure('QA_NETWORK_FAILURE'))
    const remove = vi.spyOn(api, 'delete')
      .mockRejectedValueOnce(new QaFailure('QA_NETWORK_FAILURE'))
      .mockResolvedValueOnce(undefined)
    await products.start()
    await products.create(products.input('one'))
    await products.create(products.input('two'))
    await expect(products.cleanup()).rejects.toThrow('QA_CLEANUP_INCOMPLETE')
    expect(create).toHaveBeenCalledTimes(2)
    expect(remove.mock.calls).toEqual([
      [products.scope, 'qa-owned-one'], [products.scope, 'qa-owned-two'],
    ])
    expect(total).toHaveBeenCalledTimes(2)
    api.dispose()
  })
})
