import type { Locator, Page } from '@playwright/test'
import type { CategoryStats } from '../src/api/client'
import { test, expect, credentialsFor } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

function metric(page: Page, label: string): Locator {
  return page.locator('.metric-card').filter({ has: page.getByText(label, { exact: true }) }).locator('.metric-value')
}

function statsResponse(page: Page) {
  return page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/products/stats'
    && response.request().method() === 'GET')
}

async function expectedLabels(page: Page, stats: CategoryStats[]) {
  return page.evaluate(items => {
    const total = items.reduce((sum, item) => sum + item.count, 0)
    const price = (value: number) => new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value)
    return {
      total: total.toLocaleString(), categories: String(items.length),
      weighted: price(total ? items.reduce((sum, item) => sum + item.count * item.averagePrice, 0) / total : 0),
      counts: items.map(item => `${item.count.toLocaleString()} items`),
      averages: items.map(item => price(item.averagePrice)),
    }
  }, stats)
}

async function assertMetrics(page: Page, stats: CategoryStats[]) {
  const labels = await expectedLabels(page, stats)
  await expect(metric(page, 'PRODUCTS IN CATALOGUE')).toHaveText(labels.total)
  await expect(metric(page, 'CATEGORIES')).toHaveText(labels.categories)
  await expect(metric(page, 'WEIGHTED AVERAGE PRICE')).toHaveText(labels.weighted)
  return labels
}

test('E7.dashboard-live-charts-empty-error', async ({ page, context }) => {
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
  let mode: 'live' | 'empty' | 'error' = 'live'
  await page.route(url => url.origin === UI_ORIGIN && url.pathname === '/api/v1/products/stats', async route => {
    if (route.request().method() !== 'GET' || mode === 'live') return route.fallback()
    return route.fulfill(mode === 'empty'
      ? { status: 200, contentType: 'application/json', body: '[]' }
      : { status: 500, contentType: 'application/problem+json', body: JSON.stringify({
        type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'qa-dashboard-service-unavailable',
      }) })
  })

  const credentials = credentialsFor('USER')
  await page.goto('/login')
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill('user')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(credentials.password)
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  const initialStats = statsResponse(page)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const loginStatus = (await login).status()
  if (loginStatus === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(loginStatus).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  const statsResult = await initialStats
  expect(statsResult.status()).toBe(200)
  const stats = await statsResult.json() as CategoryStats[]
  expect(stats.length).toBeGreaterThan(0)
  expect(stats.reduce((sum, item) => sum + item.count, 0)).toBe(500)
  expect(stats.every(item => Number.isInteger(item.count) && item.count > 0
    && Number.isFinite(item.averagePrice) && item.averagePrice > 0)).toBe(true)
  const countChart = page.getByRole('img', { name: 'Bar chart showing product counts by category', exact: true })
  const averageChart = page.getByRole('img', { name: 'Bar chart showing average prices by category', exact: true })

  await test.step('live metrics and every category tooltip match the API', async () => {
    const labels = await assertMetrics(page, stats)
    for (const [chart, values] of [[countChart, labels.counts], [averageChart, labels.averages]] as const) {
      await expect(chart).toBeVisible()
      const bars = chart.locator('.recharts-bar-rectangle')
      await expect(bars).toHaveCount(stats.length)
      for (const [index, item] of stats.entries()) {
        await bars.nth(index).hover()
        const tooltip = chart.locator('.recharts-tooltip-wrapper')
        await expect(tooltip).toBeVisible()
        await expect(tooltip.locator('.recharts-tooltip-label')).toHaveText(item.category)
        await expect(tooltip.locator('.recharts-tooltip-item-value')).toHaveText(values[index])
      }
    }
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  await test.step('empty response renders both chart placeholders', async () => {
    mode = 'empty'
    const emptyStats = statsResponse(page)
    await page.reload()
    expect((await emptyStats).status()).toBe(200)
    await assertMetrics(page, [])
    await expect(page.getByText('No category data to chart yet.', { exact: true })).toHaveCount(2)
    await expect(countChart).toHaveCount(0)
    await expect(averageChart).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  await test.step('error is visible and retry restores live statistics', async () => {
    mode = 'error'
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('qa-dashboard-service-unavailable')
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    mode = 'live'
    const retried = statsResponse(page)
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    const response = await retried
    expect(response.status()).toBe(200)
    const recovered = await response.json() as CategoryStats[]
    expect(recovered).toEqual(stats)
    await assertMetrics(page, recovered)
    await expect(countChart.locator('.recharts-bar-rectangle')).toHaveCount(recovered.length)
    await expect(averageChart.locator('.recharts-bar-rectangle')).toHaveCount(recovered.length)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('No category data to chart yet.', { exact: true })).toHaveCount(0)
  })

  const final = await page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', { credentials: 'include' })
    const body = await response.json()
    return { status: response.status, count: body.totalElements }
  })
  expect(final).toEqual({ status: 200, count: 500 })
  expect(productWrites).toBe(0)
})
