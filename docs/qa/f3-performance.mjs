import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const ORIGIN = 'http://localhost:5173'
const dist = new URL('../../frontend/dist/', import.meta.url)
const index = readFileSync(new URL('index.html', dist))
const assets = new Map()
for (const name of readdirSync(new URL('assets/', dist))) {
  const body = readFileSync(new URL(`assets/${name}`, dist))
  assets.set(`/assets/${name}`, { body,
    contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream' })
}
for (const name of ['favicon.svg', 'icons.svg']) {
  assets.set(`/${name}`, { body: readFileSync(new URL(name, dist)), contentType: 'image/svg+xml' })
}
const bundle = [...assets].filter(([path]) => /\.(?:js|css)$/.test(path))
  .map(([path, asset]) => ({ type: path.endsWith('.js') ? 'javascript' : 'css',
    bytes: asset.body.length, gzipBytes: gzipSync(asset.body).length }))
const samples = []
let browser
let context
let page
let session
let stage = 'setup'
let failure = null
let rateLimited = false
let externalBlocked = 0
let unknownRequestsBlocked = 0
let writesBlocked = 0
let productWrites = 0
let pageErrors = 0
let initialCount = null
let finalCount = null

function requireCondition(passed, code) {
  if (rateLimited) throw new Error('QA_RATE_LIMITED')
  if (!passed) throw new Error(code)
}

async function countProducts() {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', {
      credentials: 'include', signal: AbortSignal.timeout(10000),
    })
    if (response.status !== 200) return null
    return (await response.json()).totalElements
  })
}

async function measure(screen, iteration) {
  stage = `${screen}-${iteration}`
  console.log(JSON.stringify({ stage }))
  await page.goto(screen === 'login' ? '/login' : '/products', { waitUntil: 'load' })
  if (screen === 'login') {
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  } else {
    await expect(page.getByRole('table', { name: 'Product catalogue' }).getByRole('row')).toHaveCount(11)
    await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
  }
  const readyMs = await page.evaluate(() => performance.now())
  // Fixed observation window, not a claim of field Web Vitals or a final LCP.
  await page.waitForTimeout(1000)
  const metrics = await page.evaluate(() => {
    const round = number => Math.round(number * 100) / 100
    const nav = performance.getEntriesByType('navigation')[0]
    const paints = performance.getEntriesByType('paint')
    const resources = performance.getEntriesByType('resource')
    const state = globalThis.__qaPerformance
    return {
      documentResponseMs: round(nav.responseStart - nav.requestStart),
      domContentLoadedMs: round(nav.domContentLoadedEventEnd),
      loadMs: round(nav.loadEventEnd),
      fcpMs: paints.find(entry => entry.name === 'first-contentful-paint')?.startTime ?? null,
      observedLcpMs: state.lcp,
      observedCls: Math.round(state.cls * 10000) / 10000,
      observedLongTaskBlockingMs: round(state.longTaskBlocking),
      longTaskCount: state.longTaskCount,
      observerSupport: state.supported,
      assetResourceCount: resources.filter(entry => new URL(entry.name).pathname.startsWith('/assets/')).length,
      decodedAssetBytes: resources.filter(entry => new URL(entry.name).pathname.startsWith('/assets/'))
        .reduce((total, entry) => total + entry.decodedBodySize, 0),
      devClientLoaded: resources.some(entry => /\/@vite\/client|\/@react-refresh|\/src\//.test(new URL(entry.name).pathname)),
      observationEndMs: round(performance.now()),
    }
  })
  const cdp = await session.send('Performance.getMetrics')
  const heap = cdp.metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value
  const sample = { screen, iteration, readyMs: Math.round(readyMs * 100) / 100,
    ...metrics, jsHeapUsedMiB: heap === undefined ? null : Math.round(heap / 1048576 * 100) / 100 }
  samples.push(sample)
  console.log(JSON.stringify({ sample }))
  requireCondition(!sample.devClientLoaded && sample.assetResourceCount === 2, 'QA_NOT_PRODUCTION_ASSETS')
  requireCondition(sample.fcpMs !== null && sample.observedLcpMs !== null, 'QA_MISSING_PAINT_METRICS')
}

try {
  const password = process.env.DEV_ADMIN_PASSWORD
  requireCondition(password, 'QA_MISSING_CREDENTIALS')
  browser = await chromium.launch({ headless: true, timeout: 15000 })
  context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block', reducedMotion: 'reduce' })
  await context.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== ORIGIN) { externalBlocked++; return route.abort('blockedbyclient') }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
        && !(request.method() === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(url.pathname))) {
      writesBlocked++
      return route.abort('blockedbyclient')
    }
    if (url.pathname.startsWith('/api/v1/')) return route.continue()
    if (request.method() !== 'GET') { unknownRequestsBlocked++; return route.abort('blockedbyclient') }
    const asset = assets.get(url.pathname)
    if (asset) return route.fulfill({ status: 200, body: asset.body, headers: {
      'content-type': asset.contentType, 'content-length': String(asset.body.length), 'cache-control': 'no-store',
    } })
    if (['/', '/login', '/products', '/dashboard'].includes(url.pathname)) {
      return route.fulfill({ status: 200, body: index, headers: {
        'content-type': 'text/html', 'content-length': String(index.length), 'cache-control': 'no-store',
      } })
    }
    unknownRequestsBlocked++
    return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => { unknownRequestsBlocked++; socket.close() })
  context.on('response', response => { if (response.status() === 429) rateLimited = true })
  await context.addInitScript(() => {
    const supported = PerformanceObserver.supportedEntryTypes
    const state = globalThis.__qaPerformance = { lcp: null, cls: 0, longTaskBlocking: 0,
      longTaskCount: 0, supported: {
        lcp: supported.includes('largest-contentful-paint'),
        cls: supported.includes('layout-shift'), longTasks: supported.includes('longtask'),
      } }
    let sessionStart = 0, lastShift = 0, sessionValue = 0
    if (state.supported.lcp) new PerformanceObserver(list => {
      for (const entry of list.getEntries()) state.lcp = entry.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    if (state.supported.cls) new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue
        if (entry.startTime - lastShift <= 1000 && entry.startTime - sessionStart <= 5000) sessionValue += entry.value
        else { sessionStart = entry.startTime; sessionValue = entry.value }
        lastShift = entry.startTime
        state.cls = Math.max(state.cls, sessionValue)
      }
    }).observe({ type: 'layout-shift', buffered: true })
    if (state.supported.longTasks) new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        state.longTaskCount++
        state.longTaskBlocking += Math.max(0, entry.duration - 50)
      }
    }).observe({ type: 'longtask', buffered: true })
  })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(20000)
  page.on('pageerror', () => { pageErrors++ })
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/products')
        && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) productWrites++
  })
  session = await context.newCDPSession(page)
  await session.send('Network.enable')
  await session.send('Network.setCacheDisabled', { cacheDisabled: true })
  await session.send('Performance.enable')
  for (let iteration = 1; iteration <= 3; iteration++) await measure('login', iteration)
  stage = 'authenticate-once-outside-measurements'
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill(process.env.DEV_ADMIN_USERNAME || 'admin')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(password)
  const loggedIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const loginStatus = (await loggedIn).status()
  requireCondition(loginStatus !== 429, 'QA_RATE_LIMITED')
  requireCondition(loginStatus === 200, 'QA_AUTH_FAILED')
  await page.waitForURL(`${ORIGIN}/dashboard`)
  initialCount = await countProducts()
  requireCondition(initialCount === 500, 'QA_BASELINE_MISMATCH')
  for (let iteration = 1; iteration <= 3; iteration++) await measure('products', iteration)
} catch (error) {
  const message = String(error?.message || '')
  const reason = rateLimited ? 'QA_RATE_LIMITED'
    : /^QA_[A-Z_]+$/.test(message) ? message
      : /net::ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(message) ? 'QA_SERVICE_UNREACHABLE'
        : /Executable doesn.t exist/.test(message) ? 'QA_BROWSER_UNAVAILABLE' : 'QA_PERFORMANCE_RUNNER_ERROR'
  failure = { stage, reason }
} finally {
  if (page && !page.isClosed()) {
    try { finalCount = await countProducts() } catch { /* No raw error output. */ }
  }
  await session?.detach().catch(() => {})
  await context?.close().catch(() => {})
  await browser?.close().catch(() => {})
}
const medians = ['login', 'products'].map(screen => {
  const entries = samples.filter(sample => sample.screen === screen)
  const result = { screen, samples: entries.length }
  for (const metric of ['readyMs', 'fcpMs', 'observedLcpMs', 'observedCls', 'observedLongTaskBlockingMs', 'jsHeapUsedMiB']) {
    const values = entries.map(entry => entry[metric]).filter(value => typeof value === 'number').sort((a, b) => a - b)
    result[metric] = values.length ? values[Math.floor(values.length / 2)] : null
  }
  return result
})
console.log(JSON.stringify({ summary: { failure, medians, bundle, sampleCount: samples.length,
  initialCount, finalCount, productWrites, writesBlocked, externalBlocked, unknownRequestsBlocked,
  pageErrors, rateLimited, recordingsEnabled: false, lighthouseScore: null,
  lab: 'desktop-unthrottled-cache-disabled-production-artifacts-browser-intercepted',
  observationWindowAfterReadyMs: 1000, documentNetworkTimingRepresentative: false } }))
if (failure || samples.length !== 6 || initialCount !== 500 || finalCount !== 500
    || productWrites || writesBlocked || pageErrors || unknownRequestsBlocked) process.exitCode = 1
