import type { Page } from '@playwright/test'
import { test, expect, credentialsFor } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

async function assertReadOnlyCatalogue(page: Page) {
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
  // Wait for actual populated rows, not a loading shell with no action controls.
  const catalogue = page.getByRole('table', { name: 'Product catalogue', exact: true })
  await expect(catalogue.getByRole('row')).toHaveCount(11)
  const writeAction = /^(?:Add product$|Create product$|Edit(?:\s|$)|Delete(?:\s|$)|Remove product$)/
  await expect(page.getByRole('button', { name: writeAction, includeHidden: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: writeAction, includeHidden: true })).toHaveCount(0)
  await expect(catalogue.getByRole('columnheader', { name: 'Actions', exact: true })).toHaveCount(0)
}

async function readFirstProduct(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', { credentials: 'include' })
    const body = await response.json()
    return {
      status: response.status,
      count: body.totalElements,
      id: typeof body.content?.[0]?.id === 'string' ? body.content[0].id as string : null,
    }
  })
}

test('E3.user-controls-and-direct-routes', async ({ page, context }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === UI_ORIGIN
    ? route.fallback() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else socket.close()
  })
  let productWriteRequests = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/products')
        && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) productWriteRequests++
  })

  const credentials = credentialsFor('USER')
  await page.goto('/login')
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill('user')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(credentials.password)
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const status = (await login).status()
  if (status === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(status).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  const identity = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/me', { credentials: 'include' })
    const body = await response.json()
    return {
      status: response.status, isUser: body.username === 'user',
      readOnlyRole: Array.isArray(body.roles) && body.roles.includes('USER') && !body.roles.includes('ADMIN'),
    }
  })
  expect(identity).toEqual({ status: 200, isUser: true, readOnlyRole: true })

  await page.getByRole('link', { name: 'Products', exact: true }).click()
  await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
  await assertReadOnlyCatalogue(page)
  const baseline = await readFirstProduct(page)
  expect(baseline.status).toBe(200)
  expect(baseline.count).toBe(500)
  if (!baseline.id) throw new QaFailure('QA_UNEXPECTED_RESPONSE')

  // Use a real existing ID for the edit route, without changing that product.
  for (const path of ['/products/new', `/products/${encodeURIComponent(baseline.id)}/edit`]) {
    await page.goto(path)
    await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
    await assertReadOnlyCatalogue(page)
  }
  const final = await readFirstProduct(page)
  expect(final.status).toBe(200)
  expect(final.count).toBe(500)
  expect(productWriteRequests).toBe(0)
})
