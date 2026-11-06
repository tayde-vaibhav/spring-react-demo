// F1 regression: localhost only, in-memory credentials, no product writes or recordings.
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const axeModule = require('@axe-core/playwright')
const AxeBuilder = axeModule.default ?? axeModule.AxeBuilder ?? axeModule
const ORIGIN = 'http://localhost:5173'
const checks = []
const scans = []
let browser
let context
let page
let rateLimited = false
let blockedExternalRequests = 0
let blockedWrites = 0
let productWriteRequests = 0
let baselineCount = null
let finalCount = null
let failure = null
let currentStep = 'setup'
let failedStep = null
let failureCategory = null

function step(id) {
  currentStep = id
  console.log(JSON.stringify({ step: id }))
}

function result(id, passed) {
  checks.push({ id, passed: Boolean(passed) })
  console.log(JSON.stringify({ check: id, passed: Boolean(passed) }))
}

function requireCondition(condition, reason) {
  if (!condition) throw new Error(reason)
}

async function focused(locator) {
  return locator.evaluate(element => element === document.activeElement)
}

async function assertFocus(locator, checkId) {
  try {
    // Observe focus with retrying assertions; never move it to satisfy a check.
    await expect(locator).toBeFocused({ timeout: 7000 })
    result(checkId, true)
  } catch (error) {
    result(checkId, false)
    throw error
  }
}

async function focusByTab(locator, backwards = false) {
  for (let index = 0; index < 100; index++) {
    if (await focused(locator)) return true
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab')
  }
  return false
}

async function scan(screen) {
  step(`axe-${screen}`)
  await page.evaluate(async () => { await document.fonts.ready })
  const analyzed = await new AxeBuilder({ page }).analyze()
  // Never serialize raw HTML, accessibility trees, inputs, cookies or request logs.
  const summary = {
    screen,
    violations: analyzed.violations.map(rule => ({
      id: rule.id,
      impact: rule.impact,
      affectedNodes: rule.nodes.length,
      targets: rule.nodes.map(node => node.target),
    })),
    incomplete: analyzed.incomplete.map(rule => ({ id: rule.id, affectedNodes: rule.nodes.length })),
    passedRules: analyzed.passes.length,
  }
  scans.push(summary)
  console.log(JSON.stringify({ axe: summary }))
}

async function countProducts() {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', {
      credentials: 'include', signal: AbortSignal.timeout(10_000),
    })
    if (response.status !== 200) return { status: response.status, count: null }
    const body = await response.json()
    return { status: response.status, count: body.totalElements }
  })
}

async function main() {
  step('browser-setup')
  const password = process.env.DEV_ADMIN_PASSWORD
  requireCondition(password, 'QA_MISSING_CREDENTIALS')
  browser = await chromium.launch({ headless: true, timeout: 15_000 })
  context = await browser.newContext({
    baseURL: ORIGIN, viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block', reducedMotion: 'reduce',
    // No tracing, screenshots, video, HAR or storage-state serialization.
  })
  await context.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== ORIGIN) {
      blockedExternalRequests++
      return route.abort('blockedbyclient')
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
        && !(request.method() === 'POST'
          && ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(url.pathname))) {
      blockedWrites++
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else { blockedExternalRequests++; socket.close() }
  })
  context.on('response', response => {
    if (response.status() === 429) rateLimited = true
  })
  page = await context.newPage()
  page.setDefaultTimeout(7000)
  page.setDefaultNavigationTimeout(15000)
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/products')
        && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) productWriteRequests++
  })

  step('login-navigation')
  await page.goto('/login')
  const username = page.getByLabel(/^Username(?:\s*\*)?\s*$/)
  const passwordInput = page.getByLabel(/^Password(?:\s*\*)?\s*$/)
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  await username.waitFor({ state: 'visible' })
  result('login-username-autofocus', await focused(username))
  await scan('login')
  // The login scan happens before any credential is entered.
  step('login-keyboard-submit')
  requireCondition(await focused(username), 'QA_LOGIN_FOCUS_FAILED')
  await page.keyboard.insertText(process.env.DEV_ADMIN_USERNAME || 'admin')
  await page.keyboard.press('Tab')
  result('login-tab-to-password', await focused(passwordInput))
  requireCondition(await focused(passwordInput), 'QA_LOGIN_FOCUS_FAILED')
  await page.keyboard.insertText(password)
  await page.keyboard.press('Tab')
  result('login-tab-to-submit', await focused(signIn))
  requireCondition(await focused(signIn), 'QA_LOGIN_FOCUS_FAILED')
  const loggedIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.keyboard.press('Enter')
  const loginStatus = (await loggedIn).status()
  requireCondition(loginStatus !== 429, 'QA_RATE_LIMITED')
  requireCondition(loginStatus === 200, 'QA_AUTH_FAILED')
  await page.waitForURL(`${ORIGIN}/dashboard`)
  result('login-keyboard-submit', true)
  const initial = await countProducts()
  baselineCount = initial.count
  requireCondition(initial.status === 200 && baselineCount === 500, 'QA_BASELINE_MISMATCH')

  const overview = page.getByRole('link', { name: 'Overview', exact: true })
  const products = page.getByRole('link', { name: 'Products', exact: true })
  const topAdd = page.locator('button.top-create')
  const account = page.getByRole('button', { name: /^Account menu for / })
  const home = page.getByRole('link', { name: 'FFieldnote. home', exact: true })
  await page.getByRole('img', { name: 'Bar chart showing product counts by category', exact: true }).waitFor()
  await scan('dashboard')
  step('header-keyboard-navigation')
  await home.focus()
  for (const [label, locator] of [['overview', overview], ['products', products], ['create', topAdd], ['account', account]]) {
    await page.keyboard.press('Tab')
    result(`header-tab-${label}`, await focused(locator))
  }
  requireCondition(await focused(account), 'QA_HEADER_FOCUS_FAILED')
  await page.keyboard.press('Enter')
  await page.getByRole('menu').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('menu').waitFor({ state: 'hidden' })
  result('account-menu-escape-restores-focus', await focused(account))
  requireCondition(await focusByTab(products, true), 'QA_KEYBOARD_NAVIGATION_FAILED')
  await page.keyboard.press('Enter')
  await page.waitForURL(`${ORIGIN}/products`)
  await page.getByRole('table', { name: 'Product catalogue' }).getByRole('row').nth(1).waitFor()
  result('keyboard-navigation-to-products', true)
  await scan('products')

  step('product-filter-keyboard-navigation')
  const search = page.getByRole('textbox', { name: 'Search products', exact: true })
  const category = page.getByRole('combobox', { name: 'Category', exact: true })
  const minPrice = page.getByRole('spinbutton', { name: 'Min price', exact: true })
  const maxPrice = page.getByRole('spinbutton', { name: 'Max price', exact: true })
  result('products-search-reachable-by-tab', await focusByTab(search))
  await page.keyboard.press('Tab')
  result('products-tab-to-category', await focused(category))
  requireCondition(await focused(category), 'QA_FILTER_FOCUS_FAILED')
  await page.keyboard.press('Enter')
  await page.getByRole('listbox').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('listbox').waitFor({ state: 'hidden' })
  result('category-escape-restores-focus', await focused(category))
  for (const [label, locator] of [['min-price', minPrice], ['max-price', maxPrice]]) {
    await page.keyboard.press('Tab')
    result(`products-tab-${label}`, await focused(locator))
  }
  const sort = page.getByRole('table', { name: 'Product catalogue' }).getByRole('button', { name: 'Product', exact: true })
  await page.keyboard.press('Tab')
  result('products-sort-reachable-by-tab', await focused(sort))

  // Complete the fourth required screen before dialog checks, without dropping
  // any assertion if the dialog phase later exposes a real focus defect.
  step('form-keyboard-navigation')
  requireCondition(await focusByTab(topAdd, true), 'QA_CREATE_LINK_UNREACHABLE')
  await page.keyboard.press('Enter')
  await page.waitForURL(`${ORIGIN}/products/new`)
  await page.getByRole('heading', { name: 'Add a product', exact: true }).waitFor()
  result('keyboard-navigation-to-form', true)
  await scan('form')
  step('form-keyboard-tab-order')
  const name = page.getByLabel(/^Product name(?:\s*\*)?\s*$/)
  result('form-name-reachable-by-tab', await focusByTab(name))
  for (const [label, locator] of [
    ['category', page.getByLabel(/^Category(?:\s*\*)?\s*$/)],
    ['price', page.getByLabel(/^Price(?:\s*\*)?\s*$/)],
    ['stock', page.getByLabel(/^Stock quantity(?:\s*\*)?\s*$/)],
    ['description', page.getByLabel('Description', { exact: true })],
    ['tags', page.getByLabel('Tags', { exact: true })],
    ['specs', page.getByLabel('Specifications (JSON)', { exact: true })],
    ['active', page.getByLabel('Product is active', { exact: true })],
    ['cancel', page.getByRole('link', { name: 'Cancel', exact: true })],
    ['submit', page.getByRole('button', { name: 'Create product', exact: true })],
  ]) {
    step(`form-tab-${label}`)
    await page.keyboard.press('Tab')
    await assertFocus(locator, `form-tab-${label}`)
  }
  step('form-keyboard-cancel')
  await page.keyboard.press('Shift+Tab')
  requireCondition(await focused(page.getByRole('link', { name: 'Cancel', exact: true })), 'QA_FORM_CANCEL_UNREACHABLE')
  await page.keyboard.press('Enter')
  await page.waitForURL(`${ORIGIN}/products`)
  result('form-keyboard-cancel', true)
  await page.getByRole('table', { name: 'Product catalogue' }).getByRole('row').nth(1).waitFor()

  step('delete-trigger-keyboard-focus')
  const remove = page.getByRole('button', { name: /^Delete / }).first()
  await expect(remove).toBeVisible()
  requireCondition(await focusByTab(remove), 'QA_DELETE_TRIGGER_UNREACHABLE')
  step('delete-dialog-keyboard-open')
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Remove this product?', exact: true })
  const keep = dialog.getByRole('button', { name: 'Keep product', exact: true })
  const confirm = dialog.getByRole('button', { name: 'Remove product', exact: true })
  await dialog.waitFor()
  await keep.waitFor()
  step('delete-dialog-initial-focus')
  await assertFocus(keep, 'dialog-initial-focus-safe-cancel')
  await scan('delete-dialog')
  for (const [label, key, locator] of [
    ['forward-confirm', 'Tab', confirm], ['forward-wrap', 'Tab', keep],
    ['backward-wrap', 'Shift+Tab', confirm], ['backward-cancel', 'Shift+Tab', keep],
  ]) {
    step(`dialog-focus-trap-${label}`)
    await page.keyboard.press(key)
    await assertFocus(locator, `dialog-focus-trap-${label}`)
  }
  step('dialog-escape-focus-restoration')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await assertFocus(remove, 'dialog-escape-restores-trigger-focus')
  requireCondition(await focused(remove), 'QA_DIALOG_FOCUS_RESTORE_FAILED')
  await page.keyboard.press('Enter')
  await dialog.waitFor()
  step('dialog-reopen-cancel-focus')
  await assertFocus(keep, 'dialog-reopen-initial-focus-safe-cancel')
  step('dialog-keyboard-cancel')
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await assertFocus(remove, 'dialog-keyboard-cancel-restores-focus')
}

try {
  await main()
} catch (error) {
  const message = String(error?.message || '')
  failedStep = currentStep
  failureCategory = /strict mode violation/i.test(message) ? 'locator-not-unique'
    : /Timeout|timed out/i.test(message) ? 'timeout'
      : /toBeFocused|expect\(/.test(message) ? 'assertion'
        : 'runner-error'
  // Discard raw Playwright call logs; fill actions could contain credentials.
  failure = /^QA_[A-Z_]+$/.test(message) ? message
    : /Executable doesn.t exist/.test(message) ? 'QA_BROWSER_UNAVAILABLE'
      : 'QA_RUNNER_OR_ASSERTION_FAILED'
  if (page && !page.isClosed()) {
    try {
      const state = await page.evaluate(() => ({
        activeTag: document.activeElement?.tagName ?? null,
        activeIsBody: document.activeElement === document.body,
        focusInDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
      }))
      console.log(JSON.stringify({ failureDiagnostic: { step: failedStep, category: failureCategory, ...state } }))
    } catch { /* Do not expose raw browser errors when the context is gone. */ }
  }
} finally {
  if (page && !page.isClosed()) {
    try {
      const final = await countProducts()
      if (final.status === 200) finalCount = final.count
    } catch { /* Report only the missing count below. */ }
  }
  await context?.close().catch(() => {})
  await browser?.close().catch(() => {})
}
result('product-count-unchanged', baselineCount === 500 && finalCount === 500)
result('no-product-write-requests', productWriteRequests === 0 && blockedWrites === 0)
const summary = {
  failure: rateLimited ? 'QA_RATE_LIMITED' : failure,
  failedStep, failureCategory,
  rateLimited, baselineCount, finalCount,
  productWriteRequests, blockedWrites, blockedExternalRequests,
  scans: scans.map(item => ({ screen: item.screen, violations: item.violations.length,
    affectedNodes: item.violations.reduce((sum, rule) => sum + rule.affectedNodes, 0),
    incompleteRules: item.incomplete.length })),
  passedChecks: checks.filter(check => check.passed).length,
  failedChecks: checks.filter(check => !check.passed).map(check => check.id),
  recordingsEnabled: false,
}
console.log(JSON.stringify({ summary }))
if (summary.failure || summary.failedChecks.length || scans.length !== 5
    || scans.some(item => item.violations.length)) process.exitCode = 1
