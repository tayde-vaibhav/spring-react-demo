import type { FullResult, Reporter, Suite, TestCase, TestError, TestResult } from '@playwright/test/reporter'
import { safeReason } from './qa-api'

/** Never serialize raw errors, titles, call logs, stdout, bodies or headers. */
export function resultRecord(title: string, status: TestResult['status'], durationMs: number,
  errors: readonly { message?: string }[]) {
  const id = title.match(/^E[1-9](?:\.[a-z0-9-]{1,40})?(?=\s|$)/i)?.[0] ?? 'SETUP'
  return {
    id, status, durationMs,
    ...(status === 'failed' || status === 'timedOut' || status === 'interrupted'
      ? { reason: safeReason(errors) } : {}),
  }
}

export default class SafeReporter implements Reporter {
  printsToStdio() { return true }
  onBegin(_config: unknown, suite: Suite) {
    process.stdout.write(`${JSON.stringify({ phase: 'start', tests: suite.allTests().length })}\n`)
  }
  onTestEnd(test: TestCase, result: TestResult) {
    process.stdout.write(`${JSON.stringify(resultRecord(test.title, result.status, result.duration, result.errors))}\n`)
  }
  onError(error: TestError) {
    const message = error.message ?? ''
    const reason = /No tests found/i.test(message) ? 'QA_NO_TESTS_DISCOVERED'
      : /fixture|destructuring/i.test(message) ? 'QA_FIXTURE_CONFIGURATION'
        : /Cannot find|Cannot load|module/i.test(message) ? 'QA_MODULE_RESOLUTION'
          : /browser|executable/i.test(message) ? 'QA_BROWSER_UNAVAILABLE'
            : 'QA_RUNNER_ERROR'
    process.stdout.write(`${JSON.stringify({ reason })}\n`)
  }
  onStdOut() { /* Deliberately discard worker output. */ }
  onStdErr() { /* Deliberately discard worker output. */ }
  onEnd(result: FullResult) {
    process.stdout.write(`${JSON.stringify({ phase: 'end', status: result.status })}\n`)
  }
}
