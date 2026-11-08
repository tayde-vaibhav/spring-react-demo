import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { loadBuild } from './assets.mjs'
import { createFrontendHandler } from './app.mjs'
import { BASE_HEADERS } from './policy.mjs'

try {
  const host = process.env.FRONTEND_HOST || 'localhost'
  const value = process.env.FRONTEND_PORT || '5173'
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error()
  const build = loadBuild(fileURLToPath(new URL('../dist/', import.meta.url)))
  const handler = createFrontendHandler({ ...build, apiTarget: process.env.FRONTEND_API_PROXY_TARGET })
  const server = createServer({ maxHeaderSize: 16_384 }, (request, response) => {
    handler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500, { ...BASE_HEADERS, 'content-type': 'application/problem+json' })
      response.end('{"type":"about:blank","title":"Request failed","status":500}')
    })
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000
  server.maxRequestsPerSocket = 100
  server.on('error', () => { console.error('Frontend server startup failed'); process.exitCode = 1 })
  server.listen(Number(value), host, () => console.info('Frontend HTML server ready'))
} catch {
  // No config values, filesystem paths, request bodies or underlying errors in logs.
  console.error('Frontend server startup failed; check build and server configuration')
  process.exitCode = 1
}
