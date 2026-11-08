import { createHash } from 'node:crypto'
import { test, expect } from './support/fixtures'
import { UI_ORIGIN } from './support/qa-api'
import { developmentSecurityHeaders, REVIEWED_REFRESH_TEMPLATE } from '../security-headers'

const expectedHeaders = developmentSecurityHeaders(
  { command: 'serve', mode: 'development', isPreview: false }, REVIEWED_REFRESH_TEMPLATE,
)!

test('H2.headers-csp-and-rendering', async ({ page, context }) => {
  let signedIn = false
  let actualApiRequests = 0
  let pageErrors = 0
  page.on('pageerror', () => pageErrors++)
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== UI_ORIGIN) return route.abort('blockedbyclient')
    if (!url.pathname.startsWith('/api/')) return route.fallback()
    // Every API call is mocked. No credentials, cookies, real login or DB writes.
    if (route.request().method() !== 'GET') { actualApiRequests++; return route.abort() }
    if (url.pathname === '/api/v1/auth/me') return route.fulfill({
      status: signedIn ? 200 : 401, contentType: 'application/json',
      body: JSON.stringify(signedIn ? { username: 'qa-header-user', roles: ['USER'] } : { status: 401 }),
    })
    if (url.pathname === '/api/v1/products/stats') return route.fulfill({
      contentType: 'application/json', body: JSON.stringify([{ category: 'qa-header-category', count: 5, averagePrice: 25 }]),
    })
    if (url.pathname === '/api/v1/products') return route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0, first: true, last: true }),
    })
    return route.abort()
  })
  const response = await page.goto('/login')
  if (!response) throw new Error('QA_CHECK_FAILED')
  for (const [name, value] of Object.entries(expectedHeaders)) expect(await response.headerValue(name)).toBe(value)
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  const inlineHashes = await page.locator('script:not([src])').allTextContents()
  expect(inlineHashes.map(code => createHash('sha256').update(code).digest('base64')))
    .toEqual([createHash('sha256').update(REVIEWED_REFRESH_TEMPLATE.replace('__BASE__', '/')).digest('base64')])
  const styled = await page.evaluate(() => ({
    emotionSheets: document.querySelectorAll('style[data-emotion]').length,
    storyBackground: getComputedStyle(document.querySelector('.login-story')!).backgroundColor,
    refreshAvailable: typeof (window as Window & { $RefreshReg$?: unknown }).$RefreshReg$ === 'function',
  }))
  expect(styled.emotionSheets).toBeGreaterThan(0)
  expect(styled.storyBackground).toBe('rgb(36, 69, 61)')
  expect(styled.refreshAvailable).toBe(true)
  // DOM-inserted scripts are governed by CSP; do not use eval() as an XSS test.
  const blocked = await page.evaluate(async () => {
    let violations = 0
    const listener = (event: SecurityPolicyViolationEvent) => {
      if (event.effectiveDirective === 'script-src-elem') violations++
    }
    document.addEventListener('securitypolicyviolation', listener)
    const node = document.createElement('script')
    node.textContent = 'document.documentElement.dataset.qaInlineExecuted = "yes"'
    document.head.append(node)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    node.remove()
    document.removeEventListener('securitypolicyviolation', listener)
    return { violations, executed: document.documentElement.dataset.qaInlineExecuted === 'yes' }
  })
  expect(blocked.executed).toBe(false)
  expect(blocked.violations).toBeGreaterThan(0)

  signedIn = true
  const root = await page.goto('/')
  if (!root) throw new Error('QA_CHECK_FAILED')
  expect(await root.headerValue('Content-Security-Policy')).toBe(expectedHeaders['Content-Security-Policy'])
  await expect(page.getByRole('img', { name: 'Bar chart showing product counts by category', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Bar chart showing average prices by category', exact: true })).toBeVisible()
  await expect(page.locator('.chart-area svg').first()).toBeVisible()
  await page.getByRole('link', { name: 'Products', exact: true }).click()
  await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
  expect(actualApiRequests).toBe(0)
  expect(pageErrors).toBe(0)
})

test('H2.fast-refresh-preserves-state', async ({ page, context }) => {
  let updateModule = false
  let sendUpdate: ((message: string) => void) | undefined
  let connected = false
  let navigations = 0
  let moduleUpdates = 0
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== UI_ORIGIN) return route.abort('blockedbyclient')
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"status":401}' })
    if (updateModule && url.pathname === '/src/pages/LoginPage.tsx' && url.searchParams.has('t')) {
      const original = await route.fetch({ maxRedirects: 0 })
      if (original.status() !== 200) throw new Error('QA_CHECK_FAILED')
      const code = await original.text()
      if (!code.includes('Sign in to Fieldnote')) throw new Error('QA_CHECK_FAILED')
      moduleUpdates++
      return route.fulfill({ response: original, body: code.replace('Sign in to Fieldnote', 'qa-hmr-ready') })
    }
    return route.fallback()
  })
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin !== 'ws://localhost:5173') return socket.close()
    const server = socket.connectToServer()
    server.onMessage(message => {
      if (typeof message === 'string') {
        try { if (JSON.parse(message).type === 'connected') connected = true } catch { /* Not a control message. */ }
      }
      socket.send(message)
    })
    sendUpdate = message => socket.send(message)
  })
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  await expect.poll(() => connected).toBe(true)
  await page.getByRole('textbox', { name: 'Username', exact: false }).fill('qa-hmr-state')
  const before = navigations
  updateModule = true
  if (!sendUpdate) throw new Error('QA_CHECK_FAILED')
  sendUpdate(JSON.stringify({ type: 'update', updates: [{
    type: 'js-update', path: '/src/pages/LoginPage.tsx', acceptedPath: '/src/pages/LoginPage.tsx',
    timestamp: Date.now(), explicitImportRequired: false,
  }] }))
  await expect(page.getByRole('heading', { name: 'qa-hmr-ready', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Username', exact: false })).toHaveValue('qa-hmr-state')
  expect(moduleUpdates).toBe(1)
  expect(navigations).toBe(before)
})
