import type { Page } from '@playwright/test'
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

async function assertCookieAndStorageIsolation(page: Page) {
  // Never return cookie or storage values to assertions/reporters.
  const metadata = await page.evaluate(() => {
    const visibleCookieNames = document.cookie.split(';').map(pair => pair.split('=', 1)[0].trim())
    const inspectStorage = (storage: Storage) => {
      let jwtValues = 0
      let authKeys = 0
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index) ?? ''
        const value = storage.getItem(key) ?? ''
        if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(value)) jwtValues++
        if (/(?:password|jwt|access.?token|authorization)/i.test(key)) authKeys++
      }
      return { entries: storage.length, jwtValues, authKeys }
    }
    return {
      authCookieReadable: visibleCookieNames.includes('ACCESS_TOKEN'),
      jwtCookieReadable: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(document.cookie),
      local: inspectStorage(localStorage), session: inspectStorage(sessionStorage),
    }
  })
  expect(metadata).toEqual({
    authCookieReadable: false, jwtCookieReadable: false,
    local: { entries: 0, jwtValues: 0, authKeys: 0 },
    session: { entries: 0, jwtValues: 0, authKeys: 0 },
  })
}

test('E8.cookie-storage-and-inert-xss', async ({ page, context, qaProducts, adminApi }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === UI_ORIGIN
    ? route.fallback() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else socket.close()
  })
  let dialogs = 0
  let probeImageRequests = 0
  let browserProductWrites = 0
  page.on('dialog', dialog => { dialogs++; void dialog.dismiss().catch(() => {}) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (request.resourceType() === 'image' && /(?:^|\/)x$/.test(url.pathname)) probeImageRequests++
    if (url.pathname.startsWith('/api/v1/products')
        && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) browserProductWrites++
  })
  const probeName = `${qaProducts.scope}-<img src=x onerror=alert(1)>`
  const product = await qaProducts.create({ ...qaProducts.input('xss'), name: probeName })
  expect(product.name).toBe(probeName)
  expect(await adminApi.totalProducts()).toBe(501)

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
  await expect(page.getByRole('button', { name: 'Account menu for user', exact: true })).toBeVisible()
  const authCookie = (await context.cookies(UI_ORIGIN)).find(cookie => cookie.name === 'ACCESS_TOKEN')
  expect({
    present: Boolean(authCookie?.value), httpOnly: authCookie?.httpOnly === true,
    rootPath: authCookie?.path === '/', sameSiteLax: authCookie?.sameSite === 'Lax',
  }).toEqual({ present: true, httpOnly: true, rootPath: true, sameSiteLax: true })
  // Secure is intentionally not required over HTTP with the dev profile.
  await assertCookieAndStorageIsolation(page)
  await page.getByRole('link', { name: 'Products', exact: true }).click()

  for (const reload of [false, true]) {
    if (reload) await page.reload()
    const filtered = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/api/v1/products' && url.searchParams.get('category') === qaProducts.scope
        && response.request().method() === 'GET'
    })
    await page.getByRole('combobox', { name: 'Category', exact: true }).click()
    await page.getByRole('option', { name: qaProducts.scope, exact: true }).click()
    const response = await filtered
    expect(response.status()).toBe(200)
    const ownPage = await response.json() as ProductPage
    expect(ownPage.totalElements).toBe(1)
    expect(ownPage.content.map(item => item.id)).toEqual([product.id])
    const name = page.getByText(probeName, { exact: true })
    await expect(name).toBeVisible()
    await expect(name).toHaveText(probeName)
    expect(await name.evaluate(element => element.childElementCount)).toBe(0)
    const row = page.getByRole('table', { name: 'Product catalogue' }).getByRole('row').filter({ has: name })
    await expect(row).toHaveCount(1)
    await expect(row.locator('img, script, [onerror]')).toHaveCount(0)
    // Yield two rendering frames so an accidental image/error handler can surface.
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    expect(dialogs).toBe(0)
    expect(probeImageRequests).toBe(0)
    await assertCookieAndStorageIsolation(page)
  }
  expect(browserProductWrites).toBe(0)
  expect(await adminApi.totalProducts()).toBe(501)
  // Independent finally cleanup removes only the probe and requires total=500.
})
