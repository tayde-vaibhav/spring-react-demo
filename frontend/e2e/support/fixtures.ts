import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import { credentialsFor, isAllowedBrowserUrl, QaApi, QaFailure, QaProducts, safeReason, UI_ORIGIN } from './qa-api'

type ProductGate = { products?: QaProducts }
type TestFixtures = { localOnly: void; productGate: ProductGate; qaProducts: QaProducts }
type WorkerFixtures = { adminApi: QaApi }

export const test = base.extend<TestFixtures, WorkerFixtures>({
  productGate: async ({ browserName }, provide) => {
    if (browserName !== 'chromium') throw new QaFailure('QA_CAPTURE_ENABLED')
    await provide({})
  },

  adminApi: [async ({ browserName }, provide) => {
    if (browserName !== 'chromium') throw new QaFailure('QA_CAPTURE_ENABLED')
    const api = new QaApi('ADMIN')
    try { await provide(api) } finally { api.dispose() }
  }, { scope: 'worker' }],

  localOnly: [async ({ context, productGate }, provide, info) => {
    const config = info.project.use
    if (config.trace !== 'off' || config.video !== 'off' || config.screenshot !== 'off'
        || config.serviceWorkers !== 'block' || config.baseURL !== UI_ORIGIN
        || process.env.PLAYWRIGHT_NO_COPY_PROMPT !== '1') {
      throw new QaFailure('QA_CAPTURE_ENABLED')
    }
    let mutationRejected = false
    await context.route('**/*', async route => {
      const request = route.request()
      if (!isAllowedBrowserUrl(request.url())) return route.abort('blockedbyclient')
      const url = new URL(request.url())
      const method = request.method()
      if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)
          && !(method === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(url.pathname))) {
        try {
          if (!productGate.products) throw new QaFailure('QA_NOT_OWNED')
          await productGate.products.authorizeBrowserMutation(url.pathname, method,
            method === 'DELETE' ? undefined : request.postDataJSON())
        } catch {
          mutationRejected = true
          return route.abort('blockedbyclient')
        }
      }
      return route.continue()
    })
    await context.routeWebSocket('**/*', socket => {
      const value = socket.url().replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
      if (isAllowedBrowserUrl(value)) socket.connectToServer()
      else socket.close()
    })
    let rateLimited = false
    context.on('response', response => {
      if (response.status() === 429) {
        rateLimited = true
        void context.close().catch(() => {})
      }
    })
    try { await provide() } finally {
      // Runs before context/artifact teardown. Never persist raw errors/call logs.
      for (const error of info.errors) {
        const reason = safeReason([error])
        for (const key of Object.keys(error)) Reflect.deleteProperty(error, key)
        error.message = reason
      }
    }
    if (rateLimited) throw new QaFailure('QA_RATE_LIMITED')
    if (mutationRejected) throw new QaFailure('QA_NOT_OWNED')
  }, { auto: true }],

  qaProducts: async ({ adminApi, productGate }, provide, info) => {
    const item = info.title.match(/^E[2-9](?=\s|\.)/)?.[0].toLowerCase()
    if (!item) throw new QaFailure('QA_BAD_TEST_ID')
    const products = new QaProducts(adminApi, `qa-${item}-${randomUUID()}`)
    await products.start()
    productGate.products = products
    try { await provide(products) } finally {
      productGate.products = undefined
      await products.cleanup()
    }
  },

  request: async () => {
    // Use the guarded QaApi helper, never an unrestricted APIRequestContext.
    throw new QaFailure('QA_USE_LOCAL_API_HELPER')
  },
})

export { expect, credentialsFor }
