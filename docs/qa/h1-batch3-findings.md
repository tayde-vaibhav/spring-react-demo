# H1 / Batch 3 — Frontend and QA hardening

Date: 2026-11-07. Scope: approved frontend/QA fixes, offline regression tests,
security rescan and documentation. No suppressions, installs/downloads, service
changes, network/app traffic, database writes or Git mutations.

## Diff summary

- [form-label.ts](../../frontend/e2e/support/form-label.ts): escape literal label
  metacharacters before constructing the E5 locator pattern. Preserve anchoring,
  case sensitivity and optional whitespace/required-marker suffix. The existing
  [E5 assertions](../../frontend/e2e/product-form.e2e.ts) remain intact.
- [qa-counter.mjs](../../frontend/e2e/support/qa-counter.mjs) and its TypeScript
  declaration: private Map-backed counters handle prototype-name keys as data,
  reject unsupported key types and preserve numeric/string key normalization,
  detached snapshots and nested JSON output. Used only for metrics in
  [G1](../../frontend/e2e/concurrency.mjs) and
  [G2](../../frontend/e2e/load-smoke.mjs); workload, ownership, winner, equality,
  cleanup and safety assertions are unchanged.
- [productPrice.ts](../../frontend/src/validation/productPrice.ts): extract the
  form's exact existing bounded regex and positivity check. No precision,
  validation message, request contract or authorization change.
- [frontend-hardening.test.ts](../../frontend/e2e/support/frontend-hardening.test.ts):
  nine offline tests for literal labels, prototype-safe counter keys/schema and
  existing reporter grammar/no-raw-output boundaries.
- [productPrice.test.ts](../../frontend/src/validation/productPrice.test.ts):
  30 cases covering valid/invalid prices, limits, line terminators and long input.
  Existing 12 unit tests were not altered or removed.
- [README](../../README.md): describe these helpers, offline checks and limits.

## Verification and intermediate corrections

The first new price fixture incorrectly expected a trailing newline to pass.
The original pre-extraction regex independently returned false, confirming a new
test expectation error, not a behavior regression. Only that new test was
corrected and expanded to CR/LF/Unicode line terminators; production regex stayed
unchanged. Initial lint also identified two no-unexpected-multiline errors in new
it.each formatting; formatting was corrected without changing assertions.

Final commands from frontend:

```bash
npm run lint -- --format json --output-file test-results/h1-p3-lint.json
npm run test
npm run typecheck:e2e
npm run build
node --check e2e/concurrency.mjs
node --check e2e/load-smoke.mjs
node --check e2e/support/qa-counter.mjs
npm run lint:security -- --format json --output-file test-results/h1-p3-security.json
```

- Normal lint: PASSED, zero errors/warnings.
- Unit tests: PASSED, 51 cases in four files, zero failures/skips (39 new + 12 existing).
- E2E typecheck, app TypeScript check and production build: PASSED.
- Three changed/new MJS syntax checks: PASSED; runners were not executed.
- Editor diagnostics and git diff whitespace check: PASSED.
- Bundle: JS 1,004.98 kB, gzip 304.24 kB; prior approximately 1,004.95/304.23 kB.
  Existing >500 kB chunk warning remains; zero emitted production source maps.
- Security gate: FAILED, exit 1 for 61 warnings, zero errors; threshold remains zero.

## Remaining frontend findings — unfiltered

| Pattern | Before | After | Classification and trust boundary |
| --- | ---: | ---: | --- |
| detect-unsafe-regex | 31 | 31 | FALSE POSITIVE for the reported application-input exploit: 29 static locators inspect controlled local DOM, one bounded reporter-id parser, one bounded price grammar. Price/reporter boundary tests pass; no claim of general ReDoS immunity for arbitrary regexes/inputs. |
| detect-object-injection | 30 | 26 | DESIGN CHOICE: retained reads/writes use constant product-field/environment/metadata allowlists, own-key canonicalization, or bounded array/winner/worker indexes. Four plain-object counter accesses removed by real Map hardening. No arbitrary request operator is executed at these sites. |
| detect-non-literal-regexp | 1 | 1 | DESIGN CHOICE: dynamic literal-label helper now escapes metacharacters; original E5 warning moves to form-label.ts:4. Tests show regex-looking label text cannot become regex syntax. Only fixed required-marker suffix remains regex syntax. |
| detect-non-literal-fs-filename | 3 | 3 | DESIGN CHOICE: G4 reads fixed module-relative baseline/log paths, never a caller-selected filename. No path override or broader file access added. |
| **Total** | **65** | **61** | **REAL remaining = 0 demonstrated by this review; FALSE POSITIVE = 31; DESIGN CHOICE = 30. This is a disposition, not a passing analyzer gate or proof of absence of other vulnerabilities.** |

The price warning moves from ProductFormPage.tsx to productPrice.ts:3; extraction
does not remove/suppress it. The original F01–F65 row inventory and individual
trust boundaries remain in [the remediation plan](h1-remediation-plan.md).
F13/F14/F38/F39 are removed; F43/F65 move as described. No new warning category
or count increase, no ignored files, rule disables or exclusion entries added.

No new test is claimed for the unchanged G4 own-key canonicalizer or fixed-path
reads. They were source-reviewed; live G4 and other runtime checks remain
separately gated. No E5/G1/G2 browser/load/concurrency rerun or database count
check was performed, since this batch used no app/database traffic.

## Handoff

H1 overall remains FAILED: 61 current frontend warnings plus 28 Java findings
from the previous approved Java scan (not rerun in this batch). The user-run
101-test backend build remains the latest backend verification, not a new P3
build. Batch 4/any narrow exclusions, live reruns and Git operations need separate
approval. No backend restart is required for these frontend/QA changes.
The QA reports remain ignored by the repository's docs rule; normal staging
will not include them. README and source/tests are not excluded from Git.
