import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { UI_ORIGIN } from './support/qa-api'

// Phase 4B: production build served by the standalone Node server, NOT Vite.
// Never request adminApi/qaProducts: all APIs are fulfilled here before dispatch.
const product = {
  id: 'qa-nonce-product', name: 'qa-nonce-chair', description: 'Mock browser fixture',
  category: 'qa-furniture', price: 125, stock: 12, tags: ['qa-fixture'], specs: {},
  active: true, version: 0, createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
}
const stats = [
  { category: 'qa-furniture', count: 4, averagePrice: 125 },
  { category: 'qa-lighting', count: 6, averagePrice: 25 },
]

async function isolate(page: Page, context: BrowserContext, signedIn = true) {
  const evidence = { unexpectedApi: 0, pageErrors: 0, websocketAttempts: 0 }
  page.on('pageerror', () => evidence.pageErrors++)
  await context.addInitScript(() => {
    const counts: Record<string, number> = {}
    Object.defineProperty(window, '__qaCspCounts', { value: counts })
    document.addEventListener('securitypolicyviolation', event => {
      counts[event.effectiveDirective] = (counts[event.effectiveDirective] || 0) + 1
    })
  })
  await context.routeWebSocket('**/*', socket => { evidence.websocketAttempts++; socket.close() })
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== UI_ORIGIN) return route.abort('blockedbyclient')
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return route.fallback()
    if (route.request().method() !== 'GET') {
      evidence.unexpectedApi++
      return route.abort('blockedbyclient')
    }
    const json = (body: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
    })
    if (url.pathname === '/api/v1/auth/me') return json(signedIn
      ? { username: 'qa-nonce-admin', roles: ['ADMIN'] } : { status: 401 }, signedIn ? 200 : 401)
    if (url.pathname === '/api/v1/products/stats') return json(stats)
    if (url.pathname === '/api/v1/products') return json({
      content: [product], page: 0, size: 10, totalElements: 1, totalPages: 1, first: true, last: true,
    })
    if (url.pathname === `/api/v1/products/${product.id}`) return json(product)
    evidence.unexpectedApi++
    return route.abort('blockedbyclient')
  })
  return evidence
}

async function healthy(page: Page, evidence: Awaited<ReturnType<typeof isolate>>) {
  expect(evidence).toEqual({ unexpectedApi: 0, pageErrors: 0, websocketAttempts: 0 })
  const styles = await page.evaluate(() => {
    const nonce = document.querySelector<HTMLMetaElement>('meta[name="app-style-nonce"]')?.content
    const sheets = [...document.querySelectorAll<HTMLStyleElement>('style[data-emotion]')]
    const counts = (window as Window & { __qaCspCounts?: Record<string, number> }).__qaCspCounts
    return { nonced: Boolean(nonce) && sheets.length > 0 && sheets.every(sheet => sheet.nonce === nonce),
      violations: Object.values(counts || {}).reduce((sum, value) => sum + value, 0) }
  })
  expect(styles).toEqual({ nonced: true, violations: 0 })
}

test('H2.nonce-response-cache-coherence', async ({ page, context }) => {
  const evidence = await isolate(page, context, false)
  const response = await page.goto('/login')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  const result = await page.evaluate(async () => {
    const initial = document.querySelector<HTMLMetaElement>('meta[name="app-style-nonce"]')!.content
    const requests = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
      const response = await fetch(index % 2 ? '/products/new' : '/login', {
        cache: 'no-store', redirect: 'error', headers: { 'If-None-Match': '"qa-validator"', 'If-Modified-Since': 'Sun, 08 Nov 2026 00:00:00 GMT' },
      })
      const body = await response.text()
      const nonce = new DOMParser().parseFromString(body, 'text/html')
        .querySelector<HTMLMetaElement>('meta[name="app-style-nonce"]')?.content
      const policy = response.headers.get('content-security-policy') || ''
      return { nonce, valid: response.status === 200 && Boolean(nonce) && nonce?.length === 32
        && policy.includes(`style-src-elem 'self' 'nonce-${nonce}'`)
        && !/unsafe-inline|unsafe-eval|\*/.test(policy)
        && policy.includes("script-src-attr 'none'") && policy.includes("style-src-attr 'none'")
        && response.headers.get('cache-control') === 'no-store'
        && !response.headers.has('etag') && !response.headers.has('last-modified')
        && !response.headers.has('server') && !response.headers.has('x-powered-by')
        && response.headers.get('x-content-type-options') === 'nosniff'
        && response.headers.get('x-frame-options') === 'DENY'
        && response.headers.get('referrer-policy') === 'no-referrer'
        && !body.includes('__FRONTEND_STYLE_NONCE__') && !body.includes('/@vite/client') }
    }))
    const head = await fetch('/login', { method: 'HEAD', redirect: 'error' })
    const rejected = await Promise.all(['/src/main.tsx', '/assets/qa-missing.js', '/actuator/health', '/qa-missing.js']
      .map(async path => (await fetch(path, { redirect: 'error' })).status))
    return { valid: requests.every(item => item.valid),
      unique: new Set([initial, ...requests.map(item => item.nonce)]).size === 7,
      head: head.status === 200 && (await head.text()) === '' && head.headers.get('cache-control') === 'no-store',
      reservedBlocked: rejected.every(status => status === 404) }
  })
  expect(result).toEqual({ valid: true, unique: true, head: true, reservedBlocked: true })
  await healthy(page, evidence)
})

test('H2.nonce-negative-and-positive-controls', async ({ page, context }) => {
  const evidence = await isolate(page, context, false)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  await healthy(page, evidence)
  const result = await page.evaluate(async () => {
    const root = document.createElement('section')
    document.body.append(root)
    const nodes = ['good', 'missing', 'wrong', 'attr', 'cssom'].map(name => {
      const node = document.createElement('span')
      node.className = `qa-probe-${name}`
      root.append(node)
      return node
    })
    const baseline = nodes.map(node => getComputedStyle(node).color)
    const nonce = document.querySelector<HTMLMetaElement>('meta[name="app-style-nonce"]')!.content
    const styles = ['good', 'missing', 'wrong'].map(name => {
      const sheet = document.createElement('style')
      if (name !== 'missing') sheet.nonce = name === 'good' ? nonce : 'qa-wrong-nonce'
      sheet.textContent = `.qa-probe-${name}{color:rgb(1,2,3)}`
      document.head.append(sheet)
      return sheet
    })
    nodes[3].setAttribute('style', 'color:rgb(1,2,3)')
    nodes[4].style.color = 'rgb(4,5,6)'
    const script = document.createElement('script')
    script.textContent = 'document.documentElement.dataset.qaScriptExecuted="yes"'
    document.head.append(script)
    const button = document.createElement('button')
    button.setAttribute('onclick', 'document.documentElement.dataset.qaHandlerExecuted="yes"')
    root.append(button)
    button.click()
    await new Promise(resolve => setTimeout(resolve, 100))
    const counts = (window as Window & { __qaCspCounts?: Record<string, number> }).__qaCspCounts || {}
    const result = {
      trustedStyle: getComputedStyle(nodes[0]).color === 'rgb(1, 2, 3)',
      missingBlocked: getComputedStyle(nodes[1]).color === baseline[1],
      wrongBlocked: getComputedStyle(nodes[2]).color === baseline[2],
      attrBlocked: getComputedStyle(nodes[3]).color === baseline[3],
      cssomWorks: getComputedStyle(nodes[4]).color === 'rgb(4, 5, 6)',
      scriptBlocked: document.documentElement.dataset.qaScriptExecuted !== 'yes',
      handlerBlocked: document.documentElement.dataset.qaHandlerExecuted !== 'yes',
      enforced: (counts['style-src-elem'] || 0) >= 2 && (counts['style-src-attr'] || 0) >= 1
        && (counts['script-src-elem'] || 0) >= 1 && (counts['script-src-attr'] || 0) >= 1,
    }
    root.remove(); script.remove(); styles.forEach(sheet => sheet.remove())
    return result
  })
  expect(Object.values(result).every(Boolean)).toBe(true)
  expect(evidence).toEqual({ unexpectedApi: 0, pageErrors: 0, websocketAttempts: 0 })
})

test('H2.nonce-mui-menus-dialog-transitions', async ({ page, context }) => {
  const evidence = await isolate(page, context)
  await page.goto('/products')
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
  await expect(page.getByText(product.name, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Account menu for qa-nonce-admin', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).not.toBeVisible()
  await page.getByRole('combobox', { name: 'Category', exact: true }).click()
  await expect(page.getByRole('option', { name: product.category, exact: true })).toBeVisible()
  await page.getByRole('option', { name: product.category, exact: true }).click()
  const trigger = page.getByRole('button', { name: `Delete ${product.name}`, exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Remove this product?', exact: true })
  await expect(dialog).toBeVisible()
  const keep = dialog.getByRole('button', { name: 'Keep product', exact: true })
  await expect(keep).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Remove product', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(keep).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await healthy(page, evidence)
})

test('H2.nonce-product-form-and-mobile-layout', async ({ page, context }) => {
  const evidence = await isolate(page, context)
  await page.goto('/products/new')
  await expect(page.getByRole('heading', { name: 'Add a product', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create product', exact: true }).click()
  await expect(page.getByText('Enter a product name.', { exact: true })).toBeVisible()
  await page.getByRole('switch', { name: 'Product is active', exact: true }).uncheck()
  await expect(page.getByRole('switch', { name: 'Product is inactive', exact: true })).not.toBeChecked()
  await healthy(page, evidence)
  await page.goto(`/products/${product.id}/edit`)
  await expect(page.getByRole('heading', { name: 'Edit product', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Product name', exact: false })).toHaveValue(product.name)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await healthy(page, evidence)
})

test('H2.nonce-charts-tooltip-and-resize', async ({ page, context }) => {
  const evidence = await isolate(page, context)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/dashboard')
  const chart = page.getByRole('img', { name: 'Bar chart showing product counts by category', exact: true })
  await expect(chart.locator('.recharts-bar-rectangle')).toHaveCount(2)
  await chart.locator('.recharts-bar-rectangle').first().hover()
  const tooltip = chart.locator('.recharts-tooltip-wrapper')
  await expect(tooltip).toBeVisible()
  await expect(tooltip.locator('.recharts-tooltip-label')).toHaveText(stats[0].category)
  await expect(tooltip.locator('.recharts-tooltip-item-value')).toHaveText('4 items')
  const before = await chart.locator('svg.recharts-surface').first().boundingBox()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await chart.locator('svg.recharts-surface').first().boundingBox())?.width ?? 0)
    .toBeLessThan(before!.width)
  await expect(chart.locator('svg.recharts-surface').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await healthy(page, evidence)
})
