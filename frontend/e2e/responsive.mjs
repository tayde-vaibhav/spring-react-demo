// F2 regression: viewport checks only; no product writes or browser recordings.
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const ORIGIN = 'http://localhost:5173'
const views = [
  { width: 320, height: 740 },
  { width: 380, height: 844 },
  { width: 381, height: 844 },
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]
const checks = []
const completed = []
const phaseErrors = []
let browser
let context
let page
let stage = 'setup'
let rateLimited = false
let externalBlocked = 0
let writesBlocked = 0
let productWrites = 0
let initialCount = null
let finalCount = null
let failure = null

function record(view, screen, check, passed, metrics = {}) {
  const item = { width: view.width, screen, check, passed: Boolean(passed), ...metrics }
  checks.push(item)
  if (!item.passed) console.log(JSON.stringify({ failedCheck: item }))
}

function requireCondition(passed, code) {
  if (rateLimited) throw new Error('QA_RATE_LIMITED')
  if (!passed) throw new Error(code)
}

function safeError(error) {
  if (rateLimited) return 'QA_RATE_LIMITED'
  const message = String(error?.message || '')
  if (/^QA_[A-Z_]+$/.test(message)) return message
  if (/net::ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(message)) return 'QA_SERVICE_UNREACHABLE'
  if (/Executable doesn.t exist/.test(message)) return 'QA_BROWSER_UNAVAILABLE'
  if (/Timeout|timed out/i.test(message)) return 'QA_WAIT_TIMEOUT'
  return 'QA_RESPONSIVE_RUNNER_ERROR'
}

async function phase(view, screen, action) {
  stage = `${view.width}-${screen}`
  console.log(JSON.stringify({ stage }))
  try {
    await action()
    completed.push({ width: view.width, screen })
  } catch (error) {
    const reason = safeError(error)
    phaseErrors.push({ width: view.width, screen, reason })
    console.log(JSON.stringify({ phaseError: { width: view.width, screen, reason } }))
    if (rateLimited || ['QA_SERVICE_UNREACHABLE', 'QA_BROWSER_UNAVAILABLE'].includes(reason)) throw error
  }
}

async function horizontalFit(view, screen) {
  await page.evaluate(() => { window.scrollTo({ left: 0, top: 0 }) })
  const metrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }))
  record(view, screen, 'page-horizontal-fit',
    Math.max(metrics.documentWidth, metrics.bodyWidth) <= metrics.viewportWidth + 1, metrics)
}

async function controlFit(view, screen, name, locator) {
  const visible = await locator.isVisible()
  const metrics = visible ? await locator.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const round = value => Math.round(value * 10) / 10
    return { left: round(rect.left), right: round(rect.right),
      controlWidth: round(rect.width), controlHeight: round(rect.height), viewportWidth: innerWidth }
  }) : {}
  record(view, screen, name, visible && metrics.controlWidth > 0 && metrics.controlHeight > 0
    && metrics.left >= -1 && metrics.right <= metrics.viewportWidth + 1, metrics)
}

async function headerFit(view, screen) {
  for (const [name, locator] of [
    ['header-home-fit', page.getByRole('link', { name: 'FFieldnote. home', exact: true })],
    ['header-overview-fit', page.getByRole('link', { name: 'Overview', exact: true })],
    ['header-products-fit', page.getByRole('link', { name: 'Products', exact: true })],
    ['header-create-fit', page.locator('button.top-create')],
    ['header-account-fit', page.getByRole('button', { name: /^Account menu for / })],
  ]) await controlFit(view, screen, name, locator)
}

async function productCount() {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', {
      credentials: 'include', signal: AbortSignal.timeout(10000),
    })
    if (response.status !== 200) return { status: response.status, count: null }
    return { status: response.status, count: (await response.json()).totalElements }
  })
}

async function loginFit(view) {
  await page.setViewportSize(view)
  await page.goto('/login')
  await page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true }).waitFor()
  await horizontalFit(view, 'login')
  await controlFit(view, 'login', 'username-fit', page.getByLabel(/^Username(?:\s*\*)?\s*$/))
  await controlFit(view, 'login', 'password-fit', page.getByLabel(/^Password(?:\s*\*)?\s*$/))
  await controlFit(view, 'login', 'submit-fit', page.getByRole('button', { name: 'Sign in', exact: true }))
}

async function dashboardFit(view) {
  await page.goto('/dashboard')
  await page.getByRole('img', { name: 'Bar chart showing product counts by category', exact: true }).waitFor()
  await page.locator('.recharts-bar-rectangle').first().waitFor()
  await horizontalFit(view, 'dashboard')
  await headerFit(view, 'dashboard')
  for (const [name, selector, expected] of [
    ['metric-columns', '.metric-grid', view.width <= 760 ? 1 : 3],
    ['chart-columns', '.chart-grid', view.width <= 760 ? 1 : 2],
  ]) {
    const columns = await page.locator(selector).evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.split(/\s+/).length)
    record(view, 'dashboard', name, columns === expected, { columns, expected })
  }
  const charts = page.locator('.chart-area')
  record(view, 'dashboard', 'two-live-charts', await charts.count() === 2)
  for (let index = 0; index < await charts.count(); index++) {
    await controlFit(view, 'dashboard', `chart-${index + 1}-fit`, charts.nth(index))
  }
}

async function productsFit(view) {
  await page.getByRole('link', { name: 'Products', exact: true }).click()
  await page.waitForURL(`${ORIGIN}/products`)
  await page.getByRole('table', { name: 'Product catalogue' }).getByRole('row').nth(1).waitFor()
  await horizontalFit(view, 'products')
  await headerFit(view, 'products')
  for (const [name, locator] of [
    ['search-fit', page.getByRole('textbox', { name: 'Search products', exact: true })],
    ['category-fit', page.getByRole('combobox', { name: 'Category', exact: true })],
    ['min-price-fit', page.getByRole('spinbutton', { name: 'Min price', exact: true })],
    ['max-price-fit', page.getByRole('spinbutton', { name: 'Max price', exact: true })],
  ]) await controlFit(view, 'products', name, locator)
  const container = page.locator('.table-card .MuiTableContainer-root')
  const metrics = await container.evaluate(element => ({
    clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }))
  console.log(JSON.stringify({ tableScroll: { width: view.width, ...metrics } }))
  record(view, 'products', 'table-scroll-contained', metrics.scrollWidth <= metrics.clientWidth + 1
    || ['auto', 'scroll'].includes(metrics.overflowX), metrics)
  await container.evaluate(element => { element.scrollLeft = element.scrollWidth })
  const remove = page.getByRole('button', { name: /^Delete / }).first()
  await controlFit(view, 'products', 'last-column-reachable-after-table-scroll', remove)
  const editPath = await page.getByRole('link', { name: /^Edit / }).first().getAttribute('href')
  requireCondition(editPath?.startsWith('/products/') && editPath.endsWith('/edit'), 'QA_EDIT_LINK_MISSING')
  return editPath
}

async function dialogFit(view) {
  const remove = page.getByRole('button', { name: /^Delete / }).first()
  await remove.click()
  const dialog = page.getByRole('dialog', { name: 'Remove this product?', exact: true })
  await dialog.waitFor()
  const keep = dialog.getByRole('button', { name: 'Keep product', exact: true })
  await expect(keep).toBeFocused()
  await controlFit(view, 'dialog', 'dialog-fit', dialog)
  await controlFit(view, 'dialog', 'cancel-fit', keep)
  await controlFit(view, 'dialog', 'confirmation-fit', dialog.getByRole('button', { name: 'Remove product', exact: true }))
  const vertical = await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), viewportHeight: innerHeight }
  })
  record(view, 'dialog', 'dialog-vertical-fit', vertical.top >= 0 && vertical.bottom <= vertical.viewportHeight, vertical)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  record(view, 'dialog', 'escape-closes-dialog', true)
}

async function formFit(view, screen, path) {
  await page.goto(path)
  await page.getByRole('heading', { name: screen === 'create-form' ? 'Add a product' : 'Edit product', exact: true }).waitFor()
  await horizontalFit(view, screen)
  await headerFit(view, screen)
  const columns = await page.locator('.form-grid').first().evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.split(/\s+/).length)
  record(view, screen, 'form-columns', columns === (view.width <= 520 ? 1 : 2), { columns })
  for (const [name, locator] of [
    ['name-fit', page.getByLabel(/^Product name(?:\s*\*)?\s*$/)],
    ['category-fit', page.getByLabel(/^Category(?:\s*\*)?\s*$/)],
    ['price-fit', page.getByLabel(/^Price(?:\s*\*)?\s*$/)],
    ['stock-fit', page.getByLabel(/^Stock quantity(?:\s*\*)?\s*$/)],
    ['description-fit', page.getByLabel('Description', { exact: true })],
    ['tags-fit', page.getByLabel('Tags', { exact: true })],
    ['specifications-fit', page.getByLabel('Specifications (JSON)', { exact: true })],
    ['cancel-fit', page.getByRole('link', { name: 'Cancel', exact: true })],
    ['submit-fit', page.getByRole('button', { name: screen === 'create-form' ? 'Create product' : 'Save changes', exact: true })],
  ]) await controlFit(view, screen, name, locator)
  await page.getByRole('link', { name: 'Cancel', exact: true }).click()
  await page.waitForURL(`${ORIGIN}/products`)
  record(view, screen, 'cancel-navigation', true)
}

try {
  const password = process.env.DEV_ADMIN_PASSWORD
  requireCondition(password, 'QA_MISSING_CREDENTIALS')
  browser = await chromium.launch({ headless: true, timeout: 15000 })
  context = await browser.newContext({ baseURL: ORIGIN, serviceWorkers: 'block', reducedMotion: 'reduce' })
  await context.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== ORIGIN) { externalBlocked++; return route.abort('blockedbyclient') }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
        && !(request.method() === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(url.pathname))) {
      writesBlocked++
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else { externalBlocked++; socket.close() }
  })
  context.on('response', response => { if (response.status() === 429) rateLimited = true })
  page = await context.newPage()
  page.setDefaultTimeout(7000)
  page.setDefaultNavigationTimeout(15000)
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/products')
        && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) productWrites++
  })
  for (const view of views) await phase(view, 'login', () => loginFit(view))
  stage = 'authenticate-once'
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill(process.env.DEV_ADMIN_USERNAME || 'admin')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(password)
  const loggedIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const loginStatus = (await loggedIn).status()
  requireCondition(loginStatus !== 429, 'QA_RATE_LIMITED')
  requireCondition(loginStatus === 200, 'QA_AUTH_FAILED')
  await page.waitForURL(`${ORIGIN}/dashboard`)
  const baseline = await productCount()
  initialCount = baseline.count
  requireCondition(initialCount === 500, 'QA_BASELINE_MISMATCH')
  for (const view of views) {
    await page.setViewportSize(view)
    await phase(view, 'dashboard', () => dashboardFit(view))
    let editPath
    await phase(view, 'products', async () => { editPath = await productsFit(view) })
    await phase(view, 'dialog', () => dialogFit(view))
    // Ensure a failing dialog cannot leave its modal overlay over the next page.
    await page.goto('/products/new')
    await phase(view, 'create-form', () => formFit(view, 'create-form', '/products/new'))
    if (editPath) await phase(view, 'edit-form', () => formFit(view, 'edit-form', editPath))
    else phaseErrors.push({ width: view.width, screen: 'edit-form', reason: 'QA_EDIT_LINK_MISSING' })
  }
} catch (error) {
  failure = { stage, reason: safeError(error) }
} finally {
  if (page && !page.isClosed()) {
    try { const final = await productCount(); finalCount = final.count } catch { /* No raw errors. */ }
  }
  await context?.close().catch(() => {})
  await browser?.close().catch(() => {})
}
const failedChecks = checks.filter(check => !check.passed)
const summary = { failure, phaseErrors, viewports: views, completedPhases: completed.length,
  expectedPhases: views.length * 6, passedChecks: checks.length - failedChecks.length,
  failedChecks, initialCount, finalCount, productWrites, writesBlocked, externalBlocked,
  rateLimited, recordingsEnabled: false, viewportOnlyNotPhysicalDeviceEmulation: true }
console.log(JSON.stringify({ summary }))
if (failure || phaseErrors.length || failedChecks.length || completed.length !== views.length * 6
    || initialCount !== 500 || finalCount !== 500 || productWrites || writesBlocked) process.exitCode = 1
