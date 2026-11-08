import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { describe, expect, it, vi } from 'vitest'
import { loadEnv, type ConfigEnv, type UserConfigFn } from 'vite'
import { developmentSecurityHeaders, REVIEWED_REFRESH_TEMPLATE } from './security-headers'
import config from './vite.config'

// Do not inspect local dotenv contents in configuration contract tests.
vi.mock('vite', async () => ({
  ...await vi.importActual<typeof import('vite')>('vite'),
  loadEnv: vi.fn(() => ({ VITE_BACKEND_PROXY_TARGET: 'http://localhost:8080' })),
}))

const dev: ConfigEnv = { command: 'serve', mode: 'development', isPreview: false }

describe('development-only frontend headers', () => {
  it('authorizes precisely the reviewed installed Refresh bootstrap', () => {
    expect(react.preambleCode).toBe(REVIEWED_REFRESH_TEMPLATE)
    const csp = developmentSecurityHeaders(dev, react.preambleCode)?.['Content-Security-Policy'] ?? ''
    const hash = createHash('sha256').update(react.preambleCode.replace('__BASE__', '/')).digest('base64')
    expect(csp.split('; ').find(value => value.startsWith('script-src ')))
      .toBe(`script-src 'self' 'sha256-${hash}'`)
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('nonce-')
    expect(csp).not.toContain('*')
    expect(csp).toContain("script-src-attr 'none'")
  })

  it('rejects template drift rather than hashing unknown script bytes', () => {
    for (const changed of ['', REVIEWED_REFRESH_TEMPLATE + '\n', 'unreviewed inline script']) {
      expect(() => developmentSecurityHeaders(dev, changed)).toThrow('bootstrap changed')
    }
  })

  it('sets framing and MIME protection alongside the bounded dev CSP', () => {
    const headers = developmentSecurityHeaders(dev, react.preambleCode)
    expect(headers?.['X-Frame-Options']).toBe('DENY')
    expect(headers?.['X-Content-Type-Options']).toBe('nosniff')
    for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'",
      "object-src 'none'", "form-action 'self'", "frame-src 'none'", "connect-src 'self' ws://localhost:5173"]) {
      expect(headers?.['Content-Security-Policy']).toContain(directive)
    }
    expect(headers?.['Content-Security-Policy']).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
    expect(headers?.['Content-Security-Policy']).toContain("font-src 'self' https://fonts.gstatic.com")
    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(headers).not.toHaveProperty('Strict-Transport-Security')
  })

  for (const environment of [
    { command: 'build', mode: 'production', isPreview: false },
    { command: 'build', mode: 'development', isPreview: false },
    { command: 'serve', mode: 'production', isPreview: false },
    { command: 'serve', mode: 'test', isPreview: false },
    { command: 'serve', mode: 'development', isPreview: true },
  ] as const) {
    it(`does not install dev policy for ${JSON.stringify(environment)}`, () => {
      expect(developmentSecurityHeaders(environment, 'unused outside dev')).toBeUndefined()
    })
  }

  it('preserves the configured backend proxy and React plugin in actual config', async () => {
    const resolved = await (config as UserConfigFn)(dev)
    expect(resolved.server?.proxy).toEqual({ '/api': { target: 'http://localhost:8080', changeOrigin: true } })
    expect(resolved.server?.headers).toEqual(developmentSecurityHeaders(dev, react.preambleCode))
    expect(resolved.plugins?.length).toBeGreaterThan(0)
    expect(resolved.preview).toBeUndefined()
  })

  it('preserves dev target fail-fast and leaves production serving config alone', async () => {
    const mockedEnv = vi.mocked(loadEnv)
    mockedEnv.mockReturnValueOnce({})
    expect(() => (config as UserConfigFn)(dev)).toThrow('VITE_BACKEND_PROXY_TARGET')
    const resolved = await (config as UserConfigFn)({ command: 'build', mode: 'production' })
    expect(resolved.server).toBeUndefined()
  })
})
