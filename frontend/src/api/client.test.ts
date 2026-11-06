import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'

describe('API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends product filters and pagination with cookie credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      content: [],
      page: 1,
      size: 25,
      totalElements: 0,
      totalPages: 0,
      first: true,
      last: true,
    }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await api.products({
      page: 1,
      size: 25,
      sort: 'name',
      direction: 'asc',
      q: 'notebook',
      category: 'Audio',
      minPrice: '50',
      maxPrice: '200',
    })

    const calledUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost')
    expect(calledUrl.pathname).toBe('/api/v1/products')
    expect(calledUrl.searchParams.get('page')).toBe('1')
    expect(calledUrl.searchParams.get('size')).toBe('25')
    expect(calledUrl.searchParams.get('sort')).toBe('name,asc')
    expect(calledUrl.searchParams.get('q')).toBe('notebook')
    expect(calledUrl.searchParams.get('category')).toBe('Audio')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('maps RFC ProblemDetail responses to an API error', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      status: 400,
      title: 'Bad Request',
      detail: 'Invalid filter',
    }), {
      status: 400,
      headers: { 'content-type': 'application/problem+json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      problem: { title: 'Bad Request', detail: 'Invalid filter' },
    })
  })

  it.each(['create', 'update'] as const)('only sends declared fields on %s even with a wider input object', async (operation) => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'p-1', version: 8 }), {
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const fields = {
      name: 'QA product', description: '', category: 'QA', price: 10, stock: 1,
      tags: ['qa'], specs: { dimensions: { width: 3 } }, active: true,
    }
    const widerInput = {
      ...fields, id: 'client-supplied-id', version: 7, roles: ['ADMIN'],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', unexpected: 'not-a-request-field',
    }
    if (operation === 'create') await api.createProduct(widerInput, 'csrf-value')
    else await api.updateProduct('p-1', widerInput, 'csrf-value')

    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.method).toBe(operation === 'create' ? 'POST' : 'PUT')
    expect(JSON.parse(String(request?.body))).toEqual(operation === 'create' ? fields : { ...fields, version: 7 })
  })

  it('sends the loaded product version on updates', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'p-1', version: 8 }), {
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await api.updateProduct('p-1', {
      name: 'Updated product',
      description: '',
      category: 'QA',
      price: 10,
      stock: 1,
      tags: [],
      specs: {},
      active: true,
      version: 7,
    }, 'csrf-value')

    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.method).toBe('PUT')
    expect(JSON.parse(String(request?.body))).toMatchObject({ version: 7 })
    expect(new Headers(request?.headers).get('X-XSRF-TOKEN')).toBe('csrf-value')
  })
})
