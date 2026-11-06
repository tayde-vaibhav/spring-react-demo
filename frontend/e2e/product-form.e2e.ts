import type { Locator, Page } from '@playwright/test'
import type { ProblemDetail, Product, ProductRequest } from '../src/api/client'
import { test as base, expect, credentialsFor } from './support/fixtures'
import { QaApi, QaFailure, UI_ORIGIN } from './support/qa-api'

// This item uses the frontend proxy for both UI and guarded cleanup traffic.
const test = base.extend({
  adminApi: [async ({ browserName }, provide) => {
    if (browserName !== 'chromium') throw new QaFailure('QA_CAPTURE_ENABLED')
    const api = new QaApi('ADMIN', UI_ORIGIN)
    try { await provide(api) } finally { api.dispose() }
  }, { scope: 'worker' }],
})

function field(page: Page, label: string): Locator {
  return page.getByLabel(new RegExp(`^${label}(?:\\s*\\*)?\\s*$`))
}

async function fieldError(page: Page, label: string, message?: string) {
  const input = field(page, label)
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  const helperId = await input.getAttribute('aria-describedby')
  if (!helperId) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
  const helper = page.locator(`[id="${helperId}"]`)
  await expect(helper).toBeVisible()
  if (message) await expect(helper).toHaveText(message)
}

async function fillForm(page: Page, input: ProductRequest) {
  await field(page, 'Product name').fill(input.name)
  await field(page, 'Category').fill(input.category)
  // Clear first so an unchanged value still clears prior server field errors.
  await field(page, 'Price').fill('')
  await field(page, 'Price').fill(String(input.price))
  await field(page, 'Stock quantity').fill('')
  await field(page, 'Stock quantity').fill(String(input.stock))
  await field(page, 'Description').fill(input.description)
  await field(page, 'Tags').fill(input.tags.join(', '))
  await page.getByLabel('Specifications (JSON)', { exact: true }).fill(JSON.stringify(input.specs))
}

function mutationResponse(page: Page, method: string, id?: string) {
  return page.waitForResponse(response => new URL(response.url()).pathname ===
    `/api/v1/products${id ? `/${encodeURIComponent(id)}` : ''}` && response.request().method() === method)
}

test('E5.create-edit-validation-and-conflict', async ({ page, context, qaProducts, adminApi }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === UI_ORIGIN
    ? route.fallback() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else socket.close()
  })
  let createAttempts = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/v1/products' && request.method() === 'POST') createAttempts++
  })
  const credentials = credentialsFor('ADMIN')
  await page.goto('/login')
  await field(page, 'Username').fill('admin')
  await field(page, 'Password').fill(credentials.password)
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const loginStatus = (await login).status()
  if (loginStatus === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(loginStatus).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  await page.goto('/products/new')
  await expect(page.getByRole('heading', { name: 'Add a product', exact: true })).toBeVisible()
  const input = qaProducts.input('ui-created')

  await test.step('client validation does not send writes', async () => {
    await expect(field(page, 'Product name')).toHaveAttribute('maxlength', '200')
    await expect(field(page, 'Category')).toHaveAttribute('maxlength', '100')
    await expect(field(page, 'Description')).toHaveAttribute('maxlength', '2000')
    await field(page, 'Price').fill('-1')
    await field(page, 'Stock quantity').fill('-1')
    await field(page, 'Tags').fill(Array.from({ length: 21 }, (_, i) => `qa-tag-${i}`).join(', '))
    await page.getByLabel('Specifications (JSON)', { exact: true }).fill('{')
    await page.getByRole('button', { name: 'Create product', exact: true }).click()
    for (const label of ['Product name', 'Category', 'Price', 'Stock quantity', 'Tags']) await fieldError(page, label)
    await expect(page.getByText('Enter valid JSON for specifications.', { exact: true })).toBeVisible()
    expect(createAttempts).toBe(0)

    await fillForm(page, input)
    await field(page, 'Price').fill('12.345')
    await field(page, 'Stock quantity').fill('1.5')
    await field(page, 'Tags').fill('q'.repeat(51))
    await page.getByLabel('Specifications (JSON)', { exact: true }).fill(JSON.stringify({
      one: { two: { three: { four: 'qa-depth-check' } } },
    }))
    await page.getByRole('button', { name: 'Create product', exact: true }).click()
    for (const label of ['Price', 'Stock quantity', 'Tags']) await fieldError(page, label)
    await expect(page.getByText('Specifications contain unsupported values or exceed key, size, depth, or value limits.', { exact: true })).toBeVisible()
    expect(createAttempts).toBe(0)
  })

  await test.step('real backend validation is shown per field', async () => {
    await fillForm(page, input)
    let injectValidationError = true
    await page.route(url => url.origin === UI_ORIGIN && url.pathname === '/api/v1/products', async route => {
      if (route.request().method() !== 'POST' || !injectValidationError) return route.fallback()
      const body = route.request().postDataJSON() as ProductRequest
      if (body.name !== input.name || body.category !== qaProducts.scope) throw new QaFailure('QA_NOT_OWNED')
      injectValidationError = false
      // The real server rejects this qa-owned request; fallback retains safety guards.
      return route.fallback({ postData: JSON.stringify({ ...body, price: -1, stock: -1 }) })
    })
    const rejected = mutationResponse(page, 'POST')
    await page.getByRole('button', { name: 'Create product', exact: true }).click()
    const response = await rejected
    expect(response.status()).toBe(400)
    expect(response.headers()['content-type']).toContain('application/problem+json')
    const problem = await response.json() as ProblemDetail
    if (!problem.errors?.price || !problem.errors.stock) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    await fieldError(page, 'Price', problem.errors.price)
    await fieldError(page, 'Stock quantity', problem.errors.stock)
    expect(await adminApi.totalProducts()).toBe(500)
  })

  await fillForm(page, input)
  const createdResponse = mutationResponse(page, 'POST')
  await page.getByRole('button', { name: 'Create product', exact: true }).click()
  const create = await createdResponse
  expect(create.status()).toBe(201)
  const created = await create.json() as Product
  await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
  expect(await adminApi.totalProducts()).toBe(501)
  expect(await adminApi.product(created.id)).toMatchObject({ ...input })
  expect(Number.isInteger(created.version) && created.version >= 0).toBe(true)

  const edited: ProductRequest = {
    ...input, name: `${qaProducts.scope}-ui-edited`, price: 29.95, stock: 7,
    description: 'QA-edited temporary product', tags: ['qa', 'edited'],
    specs: { purpose: 'verification', dimensions: { widthCm: 12.5 } }, active: false,
  }
  await page.goto(`/products/${encodeURIComponent(created.id)}/edit`)
  await expect(page.getByRole('heading', { name: 'Edit product', exact: true })).toBeVisible()
  await fillForm(page, edited)
  await page.getByLabel('Product is active', { exact: true }).uncheck()
  const updatedResponse = mutationResponse(page, 'PUT', created.id)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  const update = await updatedResponse
  expect(update.status()).toBe(200)
  expect((update.request().postDataJSON() as { version: number }).version).toBe(created.version)
  const updated = await update.json() as Product
  expect(updated.version).toBeGreaterThan(created.version)
  await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
  expect(await adminApi.product(created.id)).toMatchObject({ ...edited, version: updated.version })

  await test.step('edit survives a full reload', async () => {
    await page.goto(`/products/${encodeURIComponent(created.id)}/edit`)
    await page.reload()
    await expect(field(page, 'Product name')).toHaveValue(edited.name)
    await expect(field(page, 'Category')).toHaveValue(edited.category)
    await expect(field(page, 'Price')).toHaveValue('29.95')
    await expect(field(page, 'Stock quantity')).toHaveValue('7')
    await expect(field(page, 'Description')).toHaveValue(edited.description)
    await expect(field(page, 'Tags')).toHaveValue('qa, edited')
    expect(JSON.parse(await page.getByLabel('Specifications (JSON)', { exact: true }).inputValue())).toEqual(edited.specs)
    await expect(page.getByLabel('Product is inactive', { exact: true })).not.toBeChecked()
  })

  await test.step('stale edit shows a real 409 without overwriting', async () => {
    const concurrent = await qaProducts.update(updated, {
      ...edited, name: `${qaProducts.scope}-concurrent`, version: updated.version,
    })
    await field(page, 'Product name').fill(`${qaProducts.scope}-stale-ui`)
    const conflicted = mutationResponse(page, 'PUT', created.id)
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    const response = await conflicted
    expect(response.status()).toBe(409)
    expect(response.headers()['content-type']).toContain('application/problem+json')
    expect((response.request().postDataJSON() as { version: number }).version).toBe(updated.version)
    const problem = await response.json() as ProblemDetail
    if (!problem.detail) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    await expect(page.getByRole('alert')).toHaveText(problem.detail)
    expect(await adminApi.product(created.id)).toMatchObject({ name: concurrent.name, version: concurrent.version })
  })
  // qaProducts tears down in finally, deleting only this scope and requiring total=500.
})
