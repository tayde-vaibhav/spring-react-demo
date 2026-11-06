import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect, credentialsFor } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

// E2 deliberately uses the Vite proxy only, never the backend origin directly.
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === UI_ORIGIN
    ? route.fallback() : route.abort('blockedbyclient'))
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === 'ws://localhost:5173') socket.connectToServer()
    else socket.close()
  })
})

async function submitLogin(page: Page, username: string, password: string): Promise<number> {
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill(username)
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(password)
  const response = page.waitForResponse(item => new URL(item.url()).pathname === '/api/v1/auth/login'
    && item.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const status = (await response).status()
  if (status === 429) throw new QaFailure('QA_RATE_LIMITED')
  return status
}

async function assertSession(page: Page, username: string, role: 'USER' | 'ADMIN') {
  const result = await page.evaluate(async ({ expectedUsername, expectedRole }) => {
    const response = await fetch('/api/v1/auth/me', { credentials: 'include' })
    const body = await response.json()
    return {
      status: response.status,
      expectedUser: body.username === expectedUsername,
      expectedRole: Array.isArray(body.roles) && body.roles.includes(expectedRole),
    }
  }, { expectedUsername: username, expectedRole: role })
  expect(result).toEqual({ status: 200, expectedUser: true, expectedRole: true })
  await expect(page.getByRole('button', { name: `Account menu for ${username}`, exact: true })).toBeVisible()
}

async function assertCount(page: Page) {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', { credentials: 'include' })
    const body = await response.json()
    return { status: response.status, count: body.totalElements }
  })
  expect(result).toEqual({ status: 200, count: 500 })
}

test('E2.anonymous-invalid', async ({ page }) => {
  for (const path of ['/products', '/dashboard']) {
    await page.goto(path)
    await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  }
  // Synthetic wrong value is generated in memory, never committed or logged.
  expect(await submitLogin(page, 'admin', randomUUID())).toBe(401)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill('')
})

test('E2.user-restore-logout', async ({ page, context }) => {
  const credentials = credentialsFor('USER')
  await page.goto('/login')
  expect(await submitLogin(page, 'user', credentials.password)).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  await assertSession(page, 'user', 'USER')
  await assertCount(page)
  const restored = page.waitForResponse(item => new URL(item.url()).pathname === '/api/v1/auth/me'
    && item.request().method() === 'GET')
  await page.reload()
  expect((await restored).status()).toBe(200)
  await assertSession(page, 'user', 'USER')
  const logout = page.waitForResponse(item => new URL(item.url()).pathname === '/api/v1/auth/logout'
    && item.request().method() === 'POST')
  await page.getByRole('button', { name: 'Account menu for user', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  expect((await logout).status()).toBe(204)
  await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
  // Inspect only cookie presence, never assert/print cookie values.
  expect((await context.cookies()).some(cookie => cookie.name === 'ACCESS_TOKEN')).toBe(false)
  expect(await page.evaluate(async () => (await fetch('/api/v1/auth/me', { credentials: 'include' })).status)).toBe(401)
  await page.goto('/products')
  await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
})

test('E2.admin-restore-mid-session-401', async ({ page, context }) => {
  const credentials = credentialsFor('ADMIN')
  await page.goto('/login')
  expect(await submitLogin(page, 'admin', credentials.password)).toBe(200)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  await assertSession(page, 'admin', 'ADMIN')
  const restored = page.waitForResponse(item => new URL(item.url()).pathname === '/api/v1/auth/me'
    && item.request().method() === 'GET')
  await page.reload()
  expect((await restored).status()).toBe(200)
  await assertSession(page, 'admin', 'ADMIN')
  await assertCount(page)
  await expect(page.getByRole('img', { name: 'Bar chart showing product counts by category' })).toBeVisible()
  // Simulate session expiry in this isolated browser only; exercise a real 401.
  await context.clearCookies({ name: 'ACCESS_TOKEN' })
  const unauthorized = page.waitForResponse(item => new URL(item.url()).pathname === '/api/v1/products'
    && item.status() === 401)
  await page.getByRole('link', { name: 'Products', exact: true }).click()
  expect((await unauthorized).status()).toBe(401)
  await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})
