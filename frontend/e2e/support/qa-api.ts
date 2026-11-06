import type { AuthUser, Product, ProductPage, ProductRequest, ProductUpdateRequest } from '../../src/api/client'

export const UI_ORIGIN = 'http://localhost:5173'
export const API_ORIGIN = 'http://localhost:8080'
export const BASELINE_COUNT = 500
const MAX_QA_RECORDS = 20

export const SAFE_REASONS = [
  'QA_MISSING_CREDENTIALS', 'QA_NETWORK_FAILURE', 'QA_RATE_LIMITED',
  'QA_AUTH_FAILED', 'QA_AUTH_EXPIRED', 'QA_UNEXPECTED_RESPONSE',
  'QA_NONLOCAL_URL', 'QA_BASELINE_MISMATCH', 'QA_NOT_OWNED',
  'QA_RECORD_LIMIT', 'QA_CLEANUP_INCOMPLETE', 'QA_CAPTURE_ENABLED',
  'QA_BAD_TEST_ID', 'QA_USE_LOCAL_API_HELPER', 'QA_CHECK_FAILED',
] as const

export type SafeReason = typeof SAFE_REASONS[number]
export type QaRole = 'ADMIN' | 'USER'

export class QaFailure extends Error {
  constructor(reason: SafeReason) {
    super(reason)
    this.name = 'QaFailure'
  }
}

export function safeReason(errors: readonly { message?: string }[]): SafeReason {
  return SAFE_REASONS.find(code => errors.some(error => error.message === code
    || error.message === `Error: ${code}` || error.message === `QaFailure: ${code}`)) ?? 'QA_CHECK_FAILED'
}

export function isAllowedBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return !url.username && !url.password && [UI_ORIGIN, API_ORIGIN].includes(url.origin)
  } catch {
    return false
  }
}

export function apiUrl(relativePath: string, origin = API_ORIGIN): string {
  if (![UI_ORIGIN, API_ORIGIN].includes(origin)) throw new QaFailure('QA_NONLOCAL_URL')
  const url = new URL(relativePath, origin)
  if (url.origin !== origin || !url.pathname.startsWith('/api/v1/') || url.username || url.password) {
    throw new QaFailure('QA_NONLOCAL_URL')
  }
  return url.href
}

export function credentialsFor(role: QaRole): { username: string; password: string } {
  const password = process.env[role === 'ADMIN' ? 'DEV_ADMIN_PASSWORD' : 'DEV_USER_PASSWORD']
  if (!password) throw new QaFailure('QA_MISSING_CREDENTIALS')
  return {
    username: (role === 'ADMIN' ? process.env.DEV_ADMIN_USERNAME : process.env.DEV_USER_USERNAME)
      || (role === 'ADMIN' ? 'admin' : 'user'),
    password,
  }
}

function requireOwned(product: Pick<Product, 'name' | 'category'>, scope: string): void {
  if (!product || typeof product.name !== 'string'
      || !/^qa-e[2-9]-[a-f0-9-]+$/.test(scope)
      || !product.name.startsWith(`${scope}-`) || product.category !== scope) {
    throw new QaFailure('QA_NOT_OWNED')
  }
}

/** Tokens/cookies remain private in memory; no Playwright API request logging. */
export class QaApi {
  readonly #role: QaRole
  readonly #origin: string
  readonly #cookies = new Map<string, string>()
  #login: Promise<void> | undefined
  #writeReady = false

  constructor(role: QaRole = 'ADMIN', origin = API_ORIGIN) {
    apiUrl('/api/v1/auth/me', origin)
    this.#role = role
    this.#origin = origin
  }

  async #request(path: string, method = 'GET', body?: unknown, csrf?: string): Promise<{ status: number; body: unknown }> {
    const url = apiUrl(path, this.#origin)
    const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' }
    if (this.#cookies.size) headers.Cookie = [...this.#cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (csrf) headers['X-XSRF-TOKEN'] = csrf
    try {
      const response = await fetch(url, {
        method, headers, redirect: 'manual', signal: AbortSignal.timeout(10_000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (response.status === 429) throw new QaFailure('QA_RATE_LIMITED')
      if (response.status >= 300 && response.status < 400) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';', 1)[0] ?? ''
        const separator = pair.indexOf('=')
        if (separator < 1) continue
        const key = pair.slice(0, separator)
        const value = pair.slice(separator + 1)
        if (!value || /max-age=0(?:;|$)/i.test(cookie)) this.#cookies.delete(key)
        else this.#cookies.set(key, value)
      }
      return { status: response.status, body: response.status === 204 ? undefined : await response.json() }
    } catch (error) {
      if (error instanceof QaFailure) throw error
      throw new QaFailure('QA_NETWORK_FAILURE')
    }
  }

  async #csrf(): Promise<string> {
    const result = await this.#request('/api/v1/auth/csrf')
    const token = (result.body as { token?: unknown } | null)?.token
    if (result.status !== 200 || typeof token !== 'string') throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    return token
  }

  async #authenticate(): Promise<void> {
    if (!this.#login) {
      // Do not retry on auth failure or 429; the runner must ask before waiting.
      this.#login = (async () => {
        const credentials = credentialsFor(this.#role)
        const token = await this.#csrf()
        const result = await this.#request('/api/v1/auth/login', 'POST', credentials, token)
        const user = result.body as AuthUser | null
        if (result.status !== 200 || !Array.isArray(user?.roles) || !user.roles.includes(this.#role)) {
          throw new QaFailure('QA_AUTH_FAILED')
        }
      })()
    }
    await this.#login
  }

  async #products(path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: unknown }> {
    await this.#authenticate()
    const csrf = method === 'GET' ? undefined : await this.#csrf()
    const result = await this.#request(path, method, body, csrf)
    if (result.status === 401) throw new QaFailure('QA_AUTH_EXPIRED')
    return result
  }

  async #page(category?: string): Promise<ProductPage> {
    const query = new URLSearchParams({ page: '0', size: category ? '100' : '1' })
    if (category) query.set('category', category)
    const result = await this.#products(`/api/v1/products?${query}`)
    const page = result.body as ProductPage | null
    if (result.status !== 200 || !page || !Number.isInteger(page.totalElements) || !Array.isArray(page.content)) {
      throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    }
    return page
  }

  async totalProducts(): Promise<number> {
    return (await this.#page()).totalElements
  }

  async verifyBaseline(): Promise<void> {
    if (await this.totalProducts() !== BASELINE_COUNT) throw new QaFailure('QA_BASELINE_MISMATCH')
    this.#writeReady = true
  }

  async scopedProducts(scope: string): Promise<Product[]> {
    const page = await this.#page(scope)
    if (page.totalElements > MAX_QA_RECORDS || page.totalElements !== page.content.length) {
      throw new QaFailure('QA_RECORD_LIMIT')
    }
    page.content.forEach(product => requireOwned(product, scope))
    return page.content
  }

  async product(id: string): Promise<Product | null> {
    const result = await this.#products(`/api/v1/products/${encodeURIComponent(id)}`)
    if (result.status === 404) return null
    if (result.status !== 200) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    return result.body as Product
  }

  async create(scope: string, input: ProductRequest): Promise<Product> {
    requireOwned(input, scope)
    if (!this.#writeReady) throw new QaFailure('QA_BASELINE_MISMATCH')
    const result = await this.#products('/api/v1/products', 'POST', input)
    if (result.status !== 201) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    const product = result.body as Product
    requireOwned(product, scope)
    return product
  }

  async update(scope: string, id: string, input: ProductUpdateRequest): Promise<Product> {
    requireOwned(input, scope)
    if (!this.#writeReady) throw new QaFailure('QA_BASELINE_MISMATCH')
    const existing = await this.product(id)
    if (!existing) throw new QaFailure('QA_NOT_OWNED')
    requireOwned(existing, scope)
    const result = await this.#products(`/api/v1/products/${encodeURIComponent(id)}`, 'PUT', input)
    if (result.status !== 200) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    const product = result.body as Product
    requireOwned(product, scope)
    return product
  }

  async delete(scope: string, id: string): Promise<void> {
    if (!this.#writeReady) throw new QaFailure('QA_BASELINE_MISMATCH')
    const product = await this.product(id)
    if (!product) return
    requireOwned(product, scope)
    const result = await this.#products(`/api/v1/products/${encodeURIComponent(id)}`, 'DELETE')
    if (result.status !== 204 && result.status !== 404) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
  }

  dispose(): void {
    this.#cookies.clear()
    this.#login = undefined
    this.#writeReady = false
  }
}

/** Every mutating test gets its own exact category/name ownership marker. */
export class QaProducts {
  readonly scope: string
  readonly #api: QaApi
  readonly #ids = new Set<string>()
  #ready = false
  #createAttempts = 0

  constructor(api: QaApi, scope: string) {
    if (!/^qa-e[2-9]-[a-f0-9-]+$/.test(scope)) throw new QaFailure('QA_NOT_OWNED')
    this.#api = api
    this.scope = scope
  }

  async start(): Promise<void> {
    await this.#api.verifyBaseline()
    this.#ready = true
  }

  input(label = 'product'): ProductRequest {
    return {
      name: `${this.scope}-${label}`, category: this.scope, description: 'QA-owned temporary product',
      price: 19.99, stock: 5, tags: ['qa'], specs: { purpose: 'verification' }, active: true,
    }
  }

  async create(input = this.input()): Promise<Product> {
    if (!this.#ready) throw new QaFailure('QA_BASELINE_MISMATCH')
    if (this.#createAttempts >= MAX_QA_RECORDS) throw new QaFailure('QA_RECORD_LIMIT')
    this.#createAttempts++
    const product = await this.#api.create(this.scope, input)
    this.#ids.add(product.id)
    return product
  }

  async authorizeBrowserMutation(pathname: string, method: string, body: unknown): Promise<void> {
    if (!this.#ready) throw new QaFailure('QA_BASELINE_MISMATCH')
    if (method === 'POST' && pathname === '/api/v1/products') {
      requireOwned(body as ProductRequest, this.scope)
      if (this.#createAttempts >= MAX_QA_RECORDS) throw new QaFailure('QA_RECORD_LIMIT')
      this.#createAttempts++
      return
    }
    const match = pathname.match(/^\/api\/v1\/products\/([^/]+)$/)
    if (!match || (method !== 'PUT' && method !== 'DELETE')) throw new QaFailure('QA_NOT_OWNED')
    if (method === 'PUT') requireOwned(body as ProductRequest, this.scope)
    const id = decodeURIComponent(match[1])
    const product = await this.#api.product(id)
    if (!product) throw new QaFailure('QA_NOT_OWNED')
    requireOwned(product, this.scope)
    this.#ids.add(id)
  }

  async update(product: Product, input: ProductUpdateRequest): Promise<Product> {
    if (!this.#ready || !this.#ids.has(product.id)) throw new QaFailure('QA_NOT_OWNED')
    return this.#api.update(this.scope, product.id, input)
  }

  async delete(product: Product): Promise<void> {
    if (!this.#ready || !this.#ids.has(product.id)) throw new QaFailure('QA_NOT_OWNED')
    await this.#api.delete(this.scope, product.id)
  }

  async cleanup(): Promise<void> {
    // Discover UI-created records even if a test failed before capturing their IDs.
    let failed = false
    try {
      for (const product of await this.#api.scopedProducts(this.scope)) this.#ids.add(product.id)
    } catch { failed = true }
    for (const id of this.#ids) {
      try { await this.#api.delete(this.scope, id) } catch { failed = true }
    }
    try { if (await this.#api.totalProducts() !== BASELINE_COUNT) failed = true } catch { failed = true }
    if (failed) throw new QaFailure('QA_CLEANUP_INCOMPLETE')
  }
}
