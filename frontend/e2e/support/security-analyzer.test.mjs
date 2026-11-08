import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import { securityAnalyzerFixtures } from './security-analyzer-fixtures.mjs'

// Use the installed analyzer and repository config, with no rule overrides or exclusions.
const eslint = new ESLint({
  cwd: fileURLToPath(new URL('../../', import.meta.url)),
  overrideConfigFile: fileURLToPath(new URL('../../eslint.security.config.js', import.meta.url)),
  allowInlineConfig: false,
})

describe('installed ESLint security positive controls (analysis only)', () => {
  // lintText uses these as virtual paths for config selection; no runner is imported/read.
  // The padded spans are deliberately outside the documented candidate diagnostics.
  for (const filePath of [
    'e2e/support/security-positive-control.mjs',
    'e2e/restart-idempotence.mjs',
    'e2e/support/form-label.ts',
  ]) {
    describe(filePath, () => {
      for (const fixture of securityAnalyzerFixtures) {
        it(`reports exactly ${fixture.ruleId} for ${fixture.name}`, async () => {
          const results = await eslint.lintText('\n'.repeat(400) + fixture.unsafe, { filePath })
          expect(results).toHaveLength(1)
          const [result] = results
          expect(result.fatalErrorCount).toBe(0)
          expect(result.messages.map(message => message.ruleId)).toEqual([fixture.ruleId])
          expect(result.messages[0].severity).toBeGreaterThan(0)
          expect(result.messages[0].line).toBeGreaterThan(400)
          expect(result.errorCount + result.warningCount).toBe(1)
          expect(result.suppressedMessages).toEqual([])
        })

        it(`does not report the literal counterpart for ${fixture.name}`, async () => {
          const results = await eslint.lintText('\n'.repeat(400) + fixture.safe, { filePath })
          expect(results).toHaveLength(1)
          const [result] = results
          expect(result.fatalErrorCount).toBe(0)
          expect(result.messages).toEqual([])
          expect(result.errorCount + result.warningCount).toBe(0)
          expect(result.suppressedMessages).toEqual([])
        })
      }
    })
  }
})
