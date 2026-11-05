export type Role = 'ADMIN' | 'USER'

export interface AuthUser {
  username: string
  roles: Role[]
}

export interface Product {
  id: string
  name: string
  description?: string | null
  category: string
  price: number
  stock: number
  tags?: string[] | null
  specs?: Record<string, unknown> | null
  active: boolean
  createdAt?: string | null
  updatedAt?: string | null
  version: number
}

export interface ProductRequest {
  name: string
  description: string
  category: string
  price: number
  stock: number
  tags: string[]
  specs: Record<string, unknown>
  active: boolean
}

export interface ProductUpdateRequest extends ProductRequest {
  version: number
}

export interface ProductPage {
  content: Product[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface CategoryStats {
  category: string
  count: number
  averagePrice: number
}

export interface ProblemDetail {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string>
}

export class ApiError extends Error {
  status: number
  problem: ProblemDetail

  constructor(status: number, problem: ProblemDetail) {
    super(problem.detail || problem.title || `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const UNAUTHORIZED_EVENT = 'app:unauthorized'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json, application/problem+json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const problem = (typeof body === 'object' && body !== null
      ? body
      : { detail: String(body) }) as ProblemDetail
    if (response.status === 401 && path !== '/v1/auth/login') {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(response.status, problem)
  }

  return body as T
}

function withQuery(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export const api = {
  onUnauthorized(handler: () => void): () => void {
    window.addEventListener(UNAUTHORIZED_EVENT, handler)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
  },

  async getCsrfToken(): Promise<string> {
    const response = await request<{ token: string }>('/v1/auth/csrf')
    return response.token
  },

  login: (username: string, password: string, csrfToken: string) =>
    request<AuthUser>('/v1/auth/login', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': csrfToken },
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<AuthUser>('/v1/auth/me'),

  logout: (csrfToken: string) => request<void>('/v1/auth/logout', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': csrfToken },
  }),

  products: (filters: {
    page: number
    size: number
    sort: string
    direction: 'asc' | 'desc'
    q?: string
    category?: string
    minPrice?: string
    maxPrice?: string
  }) => request<ProductPage>(`/v1/products${withQuery({
    page: filters.page,
    size: filters.size,
    sort: `${filters.sort},${filters.direction}`,
    q: filters.q,
    category: filters.category,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
  })}`),

  product: (id: string) => request<Product>(`/v1/products/${encodeURIComponent(id)}`),

  createProduct: (product: ProductRequest, csrfToken: string) =>
    request<Product>('/v1/products', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': csrfToken },
      body: JSON.stringify(product),
    }),

  updateProduct: (id: string, product: ProductUpdateRequest, csrfToken: string) =>
    request<Product>(`/v1/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'X-XSRF-TOKEN': csrfToken },
      body: JSON.stringify(product),
    }),

  deleteProduct: (id: string, csrfToken: string) =>
    request<void>(`/v1/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': csrfToken },
    }),

  stats: () => request<CategoryStats[]>('/v1/products/stats'),
}
