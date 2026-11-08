import type { Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { test as guardedTest, expect } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'
import { Safe4C4Diagnostics } from './support/4c4-diagnostics.mjs'

const test = guardedTest.extend<{ diagnostics: Safe4C4Diagnostics }>({
  diagnostics: async ({ browserName }, provide, info) => {
    if (browserName !== 'chromium') throw new QaFailure('QA_CAPTURE_ENABLED')
    const diagnostics = new Safe4C4Diagnostics()
    try { await provide(diagnostics) } finally {
      // Generated, ignored test artifact. Never serialize the test/error/context.
      await writeFile(info.outputPath('4c4-safe-summary.json'),
        JSON.stringify(diagnostics.snapshot(), null, 2), { mode: 0o600 })
    }
  },
})

function notLimited(status: number) {
  if (status === 429) throw new QaFailure('QA_RATE_LIMITED')
}

async function signIn(page: Page, password: string, diagnostics: Safe4C4Diagnostics) {
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill('admin')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(password)
  const result = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const response = await result
  diagnostics.http('login', response.status())
  notLimited(response.status())
  if (response.status() !== 200) throw new QaFailure('QA_AUTH_FAILED')
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  await expect(page.getByRole('button', { name: 'Account menu for admin', exact: true })).toBeVisible()
  return response
}

async function me(page: Page, diagnostics: Safe4C4Diagnostics) {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/me', {
      credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    const body = await response.json()
    return { status: response.status,
      admin: body.username === 'admin' && Array.isArray(body.roles) && body.roles.includes('ADMIN'),
      sanitizedProblem: response.headers.get('content-type')?.startsWith('application/problem+json') === true
        && body.status === 401 && body.title === 'Authentication required'
        && body.detail === 'Authentication failed or is required to access this resource.'
        && typeof body.type === 'string'
        && Object.keys(body).every(key => ['type', 'title', 'status', 'detail', 'instance'].includes(key)) }
  })
  diagnostics.http('me', result.status)
  diagnostics.check('admin', result.admin)
  diagnostics.check('problem', result.sanitizedProblem)
  notLimited(result.status)
  return result
}

async function count(page: Page, diagnostics: Safe4C4Diagnostics) {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', {
      credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (response.status !== 200) return { status: response.status, count: null }
    return { status: response.status, count: (await response.json()).totalElements }
  })
  diagnostics.http('products', result.status)
  diagnostics.check('baseline', result.count === 500)
  if (typeof result.count === 'number' && Number.isSafeInteger(result.count)
    && result.count >= 0 && result.count <= 1_000_000) diagnostics.count('productCount', result.count)
  notLimited(result.status)
  expect(result).toEqual({ status: 200, count: 500 })
}

async function logoutProbe(page: Page, mode: 'missing' | 'wrong' | 'valid', diagnostics: Safe4C4Diagnostics) {
  // Match the SPA's write contract: authenticated reads need not preserve the
  // previous readable CSRF cookie. Bootstrap before each deliberate probe.
  const bootstrap = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/csrf', {
      credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (response.status !== 200) return { status: response.status, matches: false }
    const body = await response.json()
    const cookie = document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith('XSRF-TOKEN='))?.slice('XSRF-TOKEN='.length)
    return { status: response.status, matches: typeof body?.token === 'string' && body.token.trim().length > 0
      && cookie !== undefined && decodeURIComponent(cookie) === body.token }
  })
  diagnostics.http('csrf', bootstrap.status)
  diagnostics.check('csrfMatches', bootstrap.matches)
  notLimited(bootstrap.status)
  expect(bootstrap).toEqual({ status: 200, matches: true })
  const observed = await page.evaluate(async mode => {
    const raw = document.cookie.split(';').map(cookie => cookie.trim())
      .find(cookie => cookie.startsWith('XSRF-TOKEN='))?.slice('XSRF-TOKEN='.length)
    if (!raw) return { status: 0, sanitizedProblem: false }
    const token = decodeURIComponent(raw)
    const headers: Record<string, string> = {}
    if (mode !== 'missing') headers['X-XSRF-TOKEN'] = mode === 'valid' ? token : `${token}-qa-mismatch`
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST', credentials: 'include', redirect: 'error', headers, signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 204) return { status: 204, sanitizedProblem: false }
    const body = await response.json()
    const checks = {
      contentType: response.headers.get('content-type')?.startsWith('application/problem+json') === true,
      bodyStatus: body.status === 403,
      title: body.title === 'Access denied',
      detail: body.detail === 'You do not have permission to access this resource.',
      type: typeof body.type === 'string',
      fields: Object.keys(body).every(key => ['type', 'title', 'status', 'detail', 'instance'].includes(key)),
    }
    return { status: response.status,
      sanitizedProblem: response.headers.get('content-type')?.startsWith('application/problem+json') === true
        && body.status === 403 && body.title === 'Access denied'
        && body.detail === 'You do not have permission to access this resource.'
        && typeof body.type === 'string'
        && Object.keys(body).every(key => ['type', 'title', 'status', 'detail', 'instance'].includes(key)), checks }
  }, mode)
  const result = { status: observed.status, sanitizedProblem: observed.sanitizedProblem }
  if (observed.checks) {
    diagnostics.check('contentType', observed.checks.contentType)
    diagnostics.check('bodyStatus', observed.checks.bodyStatus)
    diagnostics.check('title', observed.checks.title)
    diagnostics.check('detail', observed.checks.detail)
    diagnostics.check('type', observed.checks.type)
    diagnostics.check('fields', observed.checks.fields)
  }
  diagnostics.http('logout', result.status)
  diagnostics.check('xsrfPresent', result.status !== 0)
  diagnostics.check('problem', result.sanitizedProblem)
  notLimited(result.status)
  return result
}

// Real proxy tests; private values stay in worker/browser memory, never fixtures,
// assertions, logs, attachments, recordings or storage-state files.
test('4C4.csrf-and-tampered-cookie-recovery', async ({ page, context, diagnostics }) => {
  const password = process.env.DEV_ADMIN_PASSWORD
  if (!password) throw new QaFailure('QA_MISSING_CREDENTIALS')
  let blockedLocalRequests = 0
  let loginRequests = 0
  let logoutRequests = 0
  let websocketAttempts = 0
  let pageErrors = 0
  // Record 429 before the existing auto fixture closes the browser context.
  context.on('response', response => {
    if (response.status() === 429) diagnostics.http('observed-429', 429)
    // Status only, before body parsing; never retain the URL/header/body object.
    switch (new URL(response.url()).pathname) {
      case '/api/v1/auth/login': diagnostics.http('login', response.status()); break
      case '/api/v1/auth/logout': diagnostics.http('logout', response.status()); break
      case '/api/v1/auth/me': diagnostics.http('me', response.status()); break
      case '/api/v1/auth/csrf': diagnostics.http('csrf', response.status()); break
      case '/api/v1/products': diagnostics.http('products', response.status()); break
      case '/api/v1/products/stats': diagnostics.http('stats', response.status()); break
    }
  })
  page.on('pageerror', () => { pageErrors++; diagnostics.count('pageErrors', pageErrors) })
  await context.routeWebSocket('**/*', socket => {
    websocketAttempts++; diagnostics.count('websocketAttempts', websocketAttempts); socket.close()
  })
  await context.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== UI_ORIGIN) return route.abort('blockedbyclient')
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/')
    if (request.method() === 'GET' && (!api || [
      '/api/v1/auth/me', '/api/v1/auth/csrf', '/api/v1/products', '/api/v1/products/stats',
    ].includes(url.pathname))) return route.fallback()
    if (request.method() === 'POST' && url.pathname === '/api/v1/auth/login') {
      loginRequests++; diagnostics.count('loginRequests', loginRequests)
      if (loginRequests <= 2) return route.fallback()
    }
    if (request.method() === 'POST' && url.pathname === '/api/v1/auth/logout') {
      logoutRequests++; diagnostics.count('logoutRequests', logoutRequests)
      if (logoutRequests <= 4) return route.fallback()
    }
    blockedLocalRequests++
    diagnostics.count('blockedLocalRequests', blockedLocalRequests)
    return route.abort('blockedbyclient')
  })
  diagnostics.stage('navigate')
  const start = await page.goto('/login', { timeout: 10_000 })
  if (start) diagnostics.http('document', start.status())
  diagnostics.check('noStore', (await start?.headerValue('cache-control')) === 'no-store')
  expect(start?.status()).toBe(200)
  expect(await start?.headerValue('cache-control')).toBe('no-store')
  expect(await page.evaluate(() => {
    const nonce = document.querySelector<HTMLMetaElement>('meta[name="app-style-nonce"]')?.content
    return Boolean(nonce && nonce.length === 32) && !document.querySelector('script[src*="/@vite/client"]')
  })).toBe(true)
  diagnostics.stage('login-initial')
  await signIn(page, password, diagnostics)
  diagnostics.stage('count-initial')
  await count(page, diagnostics)
  diagnostics.stage('capture-access')
  const original = (await context.cookies(UI_ORIGIN)).find(cookie => cookie.name === 'ACCESS_TOKEN')
  diagnostics.check('cookiePresent', Boolean(original))
  if (!original) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
  for (const mode of ['missing', 'wrong'] as const) {
    diagnostics.stage(mode === 'missing' ? 'csrf-missing' : 'csrf-wrong')
    expect(await logoutProbe(page, mode, diagnostics)).toEqual({ status: 403, sanitizedProblem: true })
    expect(await me(page, diagnostics)).toEqual({ status: 200, admin: true, sanitizedProblem: false })
    expect((await context.cookies(UI_ORIGIN)).some(cookie => cookie.name === 'ACCESS_TOKEN')).toBe(true)
  }
  diagnostics.stage('csrf-valid')
  expect(await logoutProbe(page, 'valid', diagnostics)).toEqual({ status: 204, sanitizedProblem: false })
  expect((await context.cookies(UI_ORIGIN)).some(cookie => cookie.name === 'ACCESS_TOKEN')).toBe(false)
  diagnostics.stage('after-valid-logout')
  expect(await me(page, diagnostics)).toEqual({ status: 401, admin: false, sanitizedProblem: true })
  diagnostics.stage('login-document')
  await page.goto('/login', { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()

  // Change an early signature byte, not padding bits at the end. Never sign a
  // fabricated token, read JWT_SECRET, alter claims or replay the intact token.
  diagnostics.stage('tamper')
  const parts = original.value.split('.')
  if (parts.length !== 3 || parts[2].length < 2) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
  const signature = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`
  const tampered = `${parts[0]}.${parts[1]}.${signature}`
  await context.addCookies([{ ...original, value: tampered }])
  diagnostics.stage('me-tampered')
  expect(await me(page, diagnostics)).toEqual({ status: 401, admin: false, sanitizedProblem: true })
  diagnostics.stage('csrf-recovery')
  const csrf = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/csrf', {
      credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (response.status !== 200) return { status: response.status, matches: false }
    const body = await response.json()
    const cookie = document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith('XSRF-TOKEN='))?.slice('XSRF-TOKEN='.length)
    return { status: response.status, matches: typeof body.token === 'string' && body.token.length > 0
      && cookie !== undefined && decodeURIComponent(cookie) === body.token }
  })
  diagnostics.http('csrf', csrf.status)
  diagnostics.check('csrfMatches', csrf.matches)
  notLimited(csrf.status)
  expect(csrf).toEqual({ status: 200, matches: true })
  diagnostics.stage('login-recovery')
  const recovered = await signIn(page, password, diagnostics)
  diagnostics.stage('verify-recovery')
  const sentCookie = (await recovered.request().allHeaders()).cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith('ACCESS_TOKEN='))?.slice('ACCESS_TOKEN='.length)
  diagnostics.check('tamperedSent', sentCookie === tampered)
  expect(sentCookie === tampered).toBe(true)
  const replacement = (await context.cookies(UI_ORIGIN)).find(cookie => cookie.name === 'ACCESS_TOKEN')
  diagnostics.check('replaced', Boolean(replacement?.value) && replacement?.value !== tampered && replacement?.httpOnly === true)
  expect(Boolean(replacement?.value) && replacement?.value !== tampered && replacement?.httpOnly === true).toBe(true)
  expect(await me(page, diagnostics)).toEqual({ status: 200, admin: true, sanitizedProblem: false })
  diagnostics.stage('count-final')
  await count(page, diagnostics)
  diagnostics.stage('logout-final')
  const logoutResult = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/logout'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Account menu for admin', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  const logout = await logoutResult
  diagnostics.http('logout', logout.status())
  notLimited(logout.status())
  expect(logout.status()).toBe(204)
  await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
  expect((await context.cookies(UI_ORIGIN)).some(cookie => cookie.name === 'ACCESS_TOKEN')).toBe(false)
  diagnostics.stage('after-final-logout')
  expect(await me(page, diagnostics)).toEqual({ status: 401, admin: false, sanitizedProblem: true })
  expect({ blockedLocalRequests, loginRequests, logoutRequests, websocketAttempts, pageErrors })
    .toEqual({ blockedLocalRequests: 0, loginRequests: 2, logoutRequests: 4, websocketAttempts: 0, pageErrors: 0 })
  diagnostics.stage('complete')
})
