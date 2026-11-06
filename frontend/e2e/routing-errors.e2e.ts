import { test, expect, credentialsFor } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

test('E9.routing-boundary-offline-recovery', async ({ page, context }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === UI_ORIGIN
    ? route.fallback() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else socket.close()
  })
  let productWrites = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/products')
        && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) productWrites++
  })
  let malformedStats = false
  let failList = false
  let abortedReads = 0
  await page.route(url => url.origin === UI_ORIGIN && url.pathname === '/api/v1/products/stats', route => {
    if (route.request().method() !== 'GET' || !malformedStats) return route.fallback()
    // Controlled invalid API shape causes a render error, without touching app source or Mongo.
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(url => url.origin === UI_ORIGIN && url.pathname === '/api/v1/products', route => {
    if (route.request().method() !== 'GET' || !failList) return route.fallback()
    abortedReads++
    return route.abort('failed')
  })

  const credentials = credentialsFor('USER')
  await page.goto('/login')
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill(credentials.username)
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(credentials.password)
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const status = (await login).status()
  if (status === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(status).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  const chart = page.getByRole('img', { name: 'Bar chart showing product counts by category', exact: true })
  const metric = page.locator('.metric-card').filter({
    has: page.getByText('PRODUCTS IN CATALOGUE', { exact: true }),
  }).locator('.metric-value')
  await expect(chart).toBeVisible()
  await expect(metric).toHaveText('500')

  try {
    await test.step('unknown route renders 404 with a working return link', async () => {
      await page.goto('/qa-e9-unknown-route')
      await expect(page.getByText('404 · NOT FOUND', { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'This page wandered off.', exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'Back to overview', exact: true }).click()
      await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
      await expect(chart).toBeVisible()
      await expect(metric).toHaveText('500')
    })

    await test.step('render failure is contained and reload restores the app', async () => {
      malformedStats = true
      await page.reload()
      const boundary = page.getByRole('alert')
      await expect(boundary).toContainText('Something went wrong')
      await expect(boundary).toContainText('We couldn’t render this page.')
      await expect(boundary).toContainText('Your saved data hasn’t been changed.')
      await expect(boundary).not.toContainText(/TypeError|\.tsx|\bat\s+\S+\s*\(|reduce is not/)
      await expect(chart).toHaveCount(0)
      malformedStats = false
      await page.getByRole('button', { name: 'Reload page', exact: true }).click()
      await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
      await expect(chart).toBeVisible()
      await expect(metric).toHaveText('500')
      await expect(page.getByRole('alert')).toHaveCount(0)
    })

    await test.step('failed fetch shows a safe retryable error and recovers', async () => {
      failList = true
      await page.getByRole('link', { name: 'Products', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('Products could not be loaded. Check your connection and try again.')
      expect(abortedReads).toBeGreaterThanOrEqual(2) // Original fetch and configured retry.
      await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
      await expect(page.locator('.fatal-error')).toHaveCount(0)
      failList = false
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
      await expect(page.getByRole('table', { name: 'Product catalogue' }).getByRole('row')).toHaveCount(11)
      await expect(page.getByRole('alert')).toHaveCount(0)
    })

    await test.step('loaded SPA remains usable offline and resumes its query online', async () => {
      await page.clock.install()
      await page.clock.pauseAt(new Date(Date.now() + 1000))
      await context.setOffline(true)
      expect(await page.evaluate(() => navigator.onLine)).toBe(false)
      const search = page.getByRole('textbox', { name: 'Search products', exact: true })
      const term = 'qa-e9-offline-no-matching-product'
      await search.fill(term)
      await page.clock.runFor(400) // Complete the app's 350-ms debounce while offline.
      await expect(search).toHaveValue(term)
      await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
      await expect(page.locator('.fatal-error')).toHaveCount(0)
      await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
      const resumed = page.waitForResponse(response => {
        const url = new URL(response.url())
        return url.origin === UI_ORIGIN && url.pathname === '/api/v1/products'
          && url.searchParams.get('q') === term && response.request().method() === 'GET'
      })
      await context.setOffline(false)
      await page.clock.resume()
      expect((await resumed).status()).toBe(200)
      await expect(page.getByText('Nothing in this view yet', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Clear', exact: true }).click()
      await expect(search).toHaveValue('')
      await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    })

    const final = await page.evaluate(async () => {
      const response = await fetch('/api/v1/products?page=0&size=1', { credentials: 'include' })
      const body = await response.json()
      return { status: response.status, count: body.totalElements }
    })
    expect(final).toEqual({ status: 200, count: 500 })
    expect(productWrites).toBe(0)
  } finally {
    malformedStats = false
    failList = false
    await context.setOffline(false)
    await page.clock.resume()
  }
})
