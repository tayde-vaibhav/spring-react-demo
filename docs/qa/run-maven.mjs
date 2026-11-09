import { spawnSync } from 'node:child_process'

const mode = process.argv[2]
if (!['focused', 'verify'].includes(mode)) throw new Error('Invalid QA build mode')
const args = ['-o', '-Dspring.test.mockmvc.print=none',
  ...(mode === 'focused' ? ['-Dtest=AuthSecurityIntegrationTest', 'test'] : ['clean', 'verify'])]
// Deliberately unauthenticated, dedicated test DB: no dev URI or credential fallback.
const result = spawnSync('./mvnw', args, {
  cwd: new URL('../../backend/springreactdemo/', import.meta.url),
  env: { ...process.env, MONGODB_TEST_URI: 'mongodb://localhost:27017/springreactdemo-test' },
  timeout: 240_000, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
})
const output = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '')
const summaries = [...output.matchAll(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/g)]
console.log(JSON.stringify({ mode, exitCode: result.status, offline: true, dedicatedTestUri: true,
  spawnError: result.error?.code || null,
  success: result.status === 0 && output.includes('BUILD SUCCESS'),
  summary: summaries.at(-1)?.slice(1).map(Number) || null,
  sandboxDenied: /Operation not permitted|Permission denied|EPERM/i.test(output),
  missingOfflineDependency: /Cannot access.*offline|has not been downloaded|offline mode/i.test(output),
  compilationFailure: /COMPILATION ERROR|compilation failure/i.test(output),
  timedOut: result.error?.code === 'ETIMEDOUT',
}))
// No raw Maven output: Spring diagnostics can contain request cookies or URI credentials.
if (result.status !== 0) process.exitCode = 1
