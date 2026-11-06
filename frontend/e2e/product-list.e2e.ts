import type { Page, Response } from '@playwright/test'
import type { ProductPage } from '../src/api/client'
import { test, expect, credentialsFor } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

function listResponse(page: Page, matches: (query: URLSearchParams) => boolean) {
  return page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.origin === UI_ORIGIN && url.pathname === '/api/v1/products'
      && response.request().method() === 'GET' && matches(url.searchParams)
  })
}

async function productPage(response: Response): Promise<ProductPage> {
  expect(response.status()).toBe(200)
  return await response.json() as ProductPage
}

async function assertRendered(page: Page, result: ProductPage) {
  const rows = page.getByRole('table', { name: 'Product catalogue', exact: true }).getByRole('row')
  await expect(rows).toHaveCount(result.content.length + 1)
  for (const [index, product] of result.content.entries()) {
    const cells = rows.nth(index + 1).getByRole('cell')
    await expect(cells.nth(0)).toContainText(product.name)
    await expect(cells.nth(1)).toHaveText(product.category)
    await expect(cells.nth(2)).toHaveText(new Intl.NumberFormat(undefined, {
      style: 'currency', currency: 'USD', maximumFractionDigits: 2,
    }).format(product.price))
  }
}

test('E4.product-list-states-and-controls', async ({ page, context }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === UI_ORIGIN
    ? route.fallback() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else socket.close()
  })
  let productWrites = 0
  const searchQueries: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/v1/products') return
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) productWrites++
    if (url.searchParams.has('q')) searchQueries.push(url.searchParams.get('q') ?? '')
  })

  const credentials = credentialsFor('USER')
  await page.goto('/login')
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill('user')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(credentials.password)
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const loginStatus = (await login).status()
  if (loginStatus === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(loginStatus).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)

  let mode: 'loading' | 'empty' | 'error' | 'live' = 'loading'
  let releaseLoading = () => {}
  const loadingGate = new Promise<void>(resolve => { releaseLoading = resolve })
  const emptyPage: ProductPage = {
    content: [], page: 0, size: 10, totalElements: 0, totalPages: 0, first: true, last: true,
  }
  await page.route(url => url.origin === UI_ORIGIN && url.pathname === '/api/v1/products', async route => {
    if (route.request().method() !== 'GET' || mode === 'live') return route.fallback()
    const currentMode = mode
    if (currentMode === 'loading') await loadingGate
    // React can cancel a mount request; visible-state assertions still require a successful response.
    await route.fulfill(currentMode === 'error'
      ? { status: 500, contentType: 'application/problem+json', body: JSON.stringify({
        type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'qa-list-service-unavailable',
      }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify(emptyPage) }).catch(() => {})
  })

  try {
    await test.step('loading and empty states', async () => {
      await page.getByRole('link', { name: 'Products', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
      await expect(page.getByRole('table', { name: 'Product catalogue' }).locator('.MuiSkeleton-root')).toHaveCount(5)
      await expect(page.getByText('Nothing in this view yet', { exact: true })).toHaveCount(0)
      mode = 'empty'
      releaseLoading()
      await expect(page.getByText('Nothing in this view yet', { exact: true })).toBeVisible()
      await expect(page.getByText('0–0 of 0', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Go to next page', exact: true })).toBeDisabled()
    })

    let baseline: ProductPage | undefined
    await test.step('error and retry recovery', async () => {
      mode = 'error'
      await page.reload()
      await expect(page.getByRole('alert')).toContainText('qa-list-service-unavailable')
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
      mode = 'live'
      const recovered = listResponse(page, query => query.get('page') === '0' && query.get('size') === '10')
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      baseline = await productPage(await recovered)
      expect(baseline.totalElements).toBe(500)
      expect(baseline.content).toHaveLength(10)
      await assertRendered(page, baseline)
      await expect(page.getByRole('alert')).toHaveCount(0)
    })
    if (!baseline?.content[0]) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
    const initial = baseline

    await test.step('server pagination and cached previous page', async () => {
      const next = listResponse(page, query => query.get('page') === '1')
      await page.getByRole('button', { name: 'Go to next page', exact: true }).click()
      const secondPage = await productPage(await next)
      expect(secondPage.page).toBe(1)
      expect(secondPage.size).toBe(10)
      expect(secondPage.totalElements).toBe(500)
      expect(secondPage.content).toHaveLength(10)
      expect(secondPage.content.every(product => !initial.content.some(first => first.id === product.id))).toBe(true)
      await assertRendered(page, secondPage)
      await expect(page.getByText('11–20 of 500', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Go to previous page', exact: true }).click()
      await assertRendered(page, initial)
      await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Go to next page', exact: true }).click()
      await assertRendered(page, secondPage)
    })

    await test.step('debounced server search resets pagination', async () => {
      const term = initial.content[0].name.match(/[A-Za-z]{4,}/)?.[0]
      if (!term) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
      const clockStart = new Date()
      await page.clock.install({ time: clockStart })
      await page.clock.pauseAt(new Date(clockStart.getTime() + 1000))
      try {
        const search = page.getByRole('textbox', { name: 'Search products', exact: true })
        await search.fill(term.slice(0, -1))
        await page.clock.runFor(200)
        expect(searchQueries).toHaveLength(0)
        await search.fill(term)
        await page.clock.runFor(300)
        expect(searchQueries).toHaveLength(0)
        const searched = listResponse(page, query => query.get('q') === term)
        await page.clock.runFor(100)
        await page.clock.resume()
        const result = await productPage(await searched)
        expect(searchQueries).toEqual([term])
        expect(result.page).toBe(0)
        expect(result.totalElements).toBeGreaterThan(0)
        expect(result.content.some(product => product.id === initial.content[0].id)).toBe(true)
        await assertRendered(page, result)
        await page.getByRole('button', { name: 'Clear', exact: true }).click()
        await expect(search).toHaveValue('')
        await assertRendered(page, initial)
      } finally { await page.clock.resume() }
    })

    await test.step('server price sorting in both directions', async () => {
      for (const direction of ['asc', 'desc'] as const) {
        const sorted = listResponse(page, query => query.get('sort') === `price,${direction}` && !query.has('q'))
        await page.getByRole('columnheader', { name: /^Price/ }).getByRole('button').click()
        const result = await productPage(await sorted)
        expect(result.page).toBe(0)
        expect(result.content).toHaveLength(10)
        expect(result.content.every((product, index, products) => index === 0 || (direction === 'asc'
          ? products[index - 1].price <= product.price : products[index - 1].price >= product.price))).toBe(true)
        await expect(page.getByRole('columnheader', { name: /^Price/ })).toHaveAttribute('aria-sort',
          direction === 'asc' ? 'ascending' : 'descending')
        await assertRendered(page, result)
      }
    })

    await test.step('combined category and price filters', async () => {
      const sample = initial.content[0]
      const categoryResult = listResponse(page, query => query.get('category') === sample.category)
      await page.getByRole('combobox', { name: 'Category', exact: true }).click()
      await page.getByRole('option', { name: sample.category, exact: true }).click()
      const byCategory = await productPage(await categoryResult)
      expect(byCategory.totalElements).toBeGreaterThan(0)
      expect(byCategory.content.every(product => product.category === sample.category)).toBe(true)
      await assertRendered(page, byCategory)
      const lower = Math.floor(sample.price)
      const upper = Math.ceil(sample.price) + 1
      const minimum = listResponse(page, query => query.get('category') === sample.category
        && query.get('minPrice') === String(lower) && !query.has('maxPrice'))
      await page.getByRole('spinbutton', { name: 'Min price', exact: true }).fill(String(lower))
      const byMinimum = await productPage(await minimum)
      expect(byMinimum.totalElements).toBeGreaterThan(0)
      expect(byMinimum.content.every(product => product.category === sample.category && product.price >= lower)).toBe(true)
      await assertRendered(page, byMinimum)
      const maximum = listResponse(page, query => query.get('category') === sample.category
        && query.get('minPrice') === String(lower) && query.get('maxPrice') === String(upper))
      await page.getByRole('spinbutton', { name: 'Max price', exact: true }).fill(String(upper))
      const combined = await productPage(await maximum)
      expect(combined.page).toBe(0)
      expect(combined.totalElements).toBeGreaterThan(0)
      expect(combined.content.every(product => product.category === sample.category
        && product.price >= lower && product.price <= upper)).toBe(true)
      await assertRendered(page, combined)
      await page.getByRole('button', { name: 'Clear', exact: true }).click()
      await expect(page.getByRole('spinbutton', { name: 'Min price', exact: true })).toHaveValue('')
      await expect(page.getByRole('spinbutton', { name: 'Max price', exact: true })).toHaveValue('')
      await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
    })

    const final = await page.evaluate(async () => {
      const response = await fetch('/api/v1/products?page=0&size=1', { credentials: 'include' })
      const body = await response.json()
      return { status: response.status, count: body.totalElements }
    })
    expect(final).toEqual({ status: 200, count: 500 })
    expect(productWrites).toBe(0)
  } finally { releaseLoading() }
})
