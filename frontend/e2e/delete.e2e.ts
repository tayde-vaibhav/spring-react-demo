import type { ProductPage } from '../src/api/client'
import { test as base, expect, credentialsFor } from './support/fixtures'
import { QaApi, QaFailure, UI_ORIGIN } from './support/qa-api'

const test = base.extend({
  adminApi: [async ({ browserName }, provide) => {
    if (browserName !== 'chromium') throw new QaFailure('QA_CAPTURE_ENABLED')
    const api = new QaApi('ADMIN', UI_ORIGIN)
    try { await provide(api) } finally { api.dispose() }
  }, { scope: 'worker' }],
})

test('E6.delete-cancel-confirm-refresh', async ({ page, context, qaProducts, adminApi }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === UI_ORIGIN
    ? route.fallback() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else socket.close()
  })
  const product = await qaProducts.create(qaProducts.input('delete-check'))
  expect(await adminApi.totalProducts()).toBe(501)
  const deletedIds: string[] = []
  page.on('request', request => {
    const match = new URL(request.url()).pathname.match(/^\/api\/v1\/products\/([^/]+)$/)
    if (request.method() === 'DELETE' && match) deletedIds.push(decodeURIComponent(match[1]))
  })

  const credentials = credentialsFor('ADMIN')
  await page.goto('/login')
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill('admin')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(credentials.password)
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const status = (await login).status()
  if (status === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(status).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  await page.getByRole('link', { name: 'Products', exact: true }).click()
  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/api/v1/products' && url.searchParams.get('category') === qaProducts.scope
      && response.request().method() === 'GET'
  })
  await page.getByRole('combobox', { name: 'Category', exact: true }).click()
  await page.getByRole('option', { name: qaProducts.scope, exact: true }).click()
  const filteredResponse = await filtered
  expect(filteredResponse.status()).toBe(200)
  const ownPage = await filteredResponse.json() as ProductPage
  expect(ownPage.totalElements).toBe(1)
  expect(ownPage.content.map(item => item.id)).toEqual([product.id])
  const remove = page.getByRole('button', { name: `Delete ${product.name}`, exact: true })
  await expect(remove).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Remove this product?', exact: true })

  await test.step('cancel preserves the product and sends no DELETE', async () => {
    await remove.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(product.name)
    await dialog.getByRole('button', { name: 'Keep product', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(remove).toBeVisible()
    expect(deletedIds).toHaveLength(0)
    expect(await adminApi.product(product.id)).toMatchObject({
      id: product.id, name: product.name, version: product.version,
    })
    expect(await adminApi.totalProducts()).toBe(501)
  })

  await test.step('confirmation deletes once and refreshes the list', async () => {
    await remove.click()
    await expect(dialog).toBeVisible()
    const deleted = page.waitForResponse(response => new URL(response.url()).pathname ===
      `/api/v1/products/${encodeURIComponent(product.id)}` && response.request().method() === 'DELETE')
    const refreshed = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/api/v1/products' && url.searchParams.get('category') === qaProducts.scope
        && response.request().method() === 'GET'
    })
    await dialog.getByRole('button', { name: 'Remove product', exact: true }).click()
    expect((await deleted).status()).toBe(204)
    const refreshedResponse = await refreshed
    expect(refreshedResponse.status()).toBe(200)
    const empty = await refreshedResponse.json() as ProductPage
    expect(empty.totalElements).toBe(0)
    expect(empty.content).toHaveLength(0)
    await expect(dialog).not.toBeVisible()
    await expect(remove).toHaveCount(0)
    await expect(page.getByText('Nothing in this view yet', { exact: true })).toBeVisible()
    expect(deletedIds).toEqual([product.id])
    expect(await adminApi.product(product.id)).toBeNull()
    expect(await adminApi.totalProducts()).toBe(500)
    expect(await page.evaluate(async id => (await fetch(`/api/v1/products/${encodeURIComponent(id)}`,
      { credentials: 'include' })).status, product.id)).toBe(404)
    const unfiltered = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/api/v1/products' && !url.searchParams.has('category')
        && response.request().method() === 'GET'
    })
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    const restored = await unfiltered
    expect(restored.status()).toBe(200)
    expect((await restored.json() as ProductPage).totalElements).toBe(500)
    await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Product catalogue' }).getByRole('row')).toHaveCount(11)
  })
  // Independent finally cleanup also handles failures before UI confirmation.
})
