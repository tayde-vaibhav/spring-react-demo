# H1 — Collector traversal/version hardening

Date: 2026-11-07. User approved G01/G02 fixes, regression tests, QA documentation
and offline verification. **No exclusions or reviewed-gate activation.**

## Outcome and diff

G01/G02 hardening: **PASSED**. H1 overall remains **FAILED** on raw gates.
Only this stage's implementation/test edits:

- [review-inputs.mjs](../../frontend/e2e/support/review-inputs.mjs): fixed frozen
  limits (depth 64, entries 10,000, version length 128). Explicit roots start at
  depth zero; attempting depth 65 blocks before opening that directory.
- Replace whole-list readdirSync with opendirSync(bufferSize=1) and bounded
  incremental readSync. Every returned entry counts globally, including hidden
  names, directories and ignored extensions, even across separate root walks.
  Retained entry lists are bounded before deterministic sorting; directory
  handles always close in finally before processing/recurse. Budget exhaustion
  uses the existing REVIEW_INPUTS_BLOCKED error; no partial map is returned.
- The existing package-version grammar and exact name checks remain; non-string,
  empty or >128-character versions fail before regex evaluation. No full SemVer
  normalization/tightening was introduced. The original grammar intentionally
  still accepts values such as 01.002.0003 and 1.2.3--.
- [review-inputs.test.mjs](../../frontend/e2e/support/review-inputs.test.mjs): all
  original 15 case bodies preserved verbatim; 23 cases added, for 38 total.
  Source roots, hidden-input/symlink/O_NOFOLLOW, byte/hash/UTF-8 checks, raw gates,
  application code/configuration and existing functional assertions unchanged.

Diff summary was shown before verification. Limits are fixed local tooling
controls, not caller-configurable acceptance settings. No new gate machinery,
package, manifest, profile, script wiring or logging was added.

## Regression evidence

- Depth 64 with empty directories succeeds; 65 fails with the sanitized error.
  Removing only the extra test directory restores success on a new invocation.
- An independent fixture baseline has 13 traversed entries. Adding 64 empty
  directories and the remaining ignored .txt entries reaches exactly 10,000 and
  succeeds with five source files; one more ignored entry fails. This verifies
  both directory/nonmatching-entry accounting and the global cross-root budget.
- A spy calls through the real Dir.closeSync and verifies all 69 directory
  handles close on success and entry-budget failure. A separate injected read
  error verifies immediate handle closure and subsequent recovery. Spies are
  restored in finally. Tests operate only on generated temporary repositories,
  not the real checkout or live application/database records.
- Sorting is deterministic regardless of creation order/nested directories.
- Ordinary/prerelease and prior permissive version values remain valid; all four
  pinned package identities accept a 128-character value and reject 129.
  Empty/malformed/wrong-type and a 100,006-character value fail. The long fixture
  stays below the existing manifest-file size limit, testing the field bound.

These tests prove the implemented local budgets and cleanup, not protection from
all hostile concurrent filesystem mutation or authentic scanner provenance.

## Commands and results

From frontend, installed tools only:

```bash
timeout 180s ./node_modules/.bin/vitest run e2e/support/review-inputs.test.mjs
timeout 180s npm run lint
timeout 180s npm run test
timeout 180s npm run typecheck:e2e
timeout 180s npm run build
timeout 180s npm run lint:security -- --format json --output-file ../docs/qa/h1-collector-hardening-security-20261107.json
```

| Check | Result |
| --- | --- |
| Focused collector tests | 38 pass; 1.98 seconds |
| Full frontend unit suite | 234 pass in nine files; 3.04 seconds |
| Normal lint | pass, exit 0 |
| E2E typecheck/application build | pass, exit 0 |
| Editor diagnostics/whitespace | clear/pass |
| Real-checkout read-only collector smoke | 84 sources, 11 controls, zero hidden input paths; no contents printed |
| Bundle | unchanged 1,004,980 JS bytes / gzip 304.24 kB; zero source maps; existing >500 kB warning |
| Raw security scan | FAILED, exit 1; 89 warnings, zero errors/fatal errors, 49 files |

No Java code/test changed, so no backend tests, full verify, coverage generation
or Java scanner ran. The last Java report remains 25 findings with verified 38/38
class coverage. Python parser tests were not rerun; historical results are not
presented as new evidence.

## Raw findings retained; no automatic acceptance

| Security rule | Previous raw | Current raw |
| --- | ---: | ---: |
| detect-unsafe-regex | 32 | 32 |
| detect-object-injection | 34 | 34 |
| detect-non-literal-fs-filename | 18 | 22 |
| detect-non-literal-regexp | 1 | 1 |
| **Total** | **85** | **89** |

All diagnostics outside the changed collector/test files retain their exact
coordinates, including the original 61 pre-tooling warnings. Collector diagnostics
are now seven (previously eight); its test file has 13 (previously eight).
The old readdirSync diagnostic T07 disappeared because the full-directory API
was replaced for the real resource-budget fix. The installed heuristic does not
flag opendirSync here; that absence is a detector limitation, not proof of safe
path handling. Five additional filesystem warnings are new synthetic fixture
mkdir/write operations. The bounded regex remains flagged, as expected.

The new five operations are restricted to generated temporary test roots and
suggest DESIGN CHOICE rationales; no exception membership is approved or added.
Earlier T01–T24 positions/hashes are historical review evidence, not an active
baseline; changed collector positions and new test calls must be separately
reconciled before any future acceptance. The one existing non-security
react-refresh suppression is retained; zero security suppressions introduced.

Current collector diagnostics (metadata only, not approved exceptions):

| File/line | Exclusive columns | Rule |
| --- | --- | --- |
| [review-inputs.mjs:50](../../frontend/e2e/support/review-inputs.mjs#L50) | 7–25 | `security/detect-non-literal-fs-filename` |
| [review-inputs.mjs:50](../../frontend/e2e/support/review-inputs.mjs#L50) | 39–54 | `security/detect-non-literal-fs-filename` |
| [review-inputs.mjs:68](../../frontend/e2e/support/review-inputs.mjs#L68) | 11–29 | `security/detect-non-literal-fs-filename` |
| [review-inputs.mjs:70](../../frontend/e2e/support/review-inputs.mjs#L70) | 9–29 | `security/detect-non-literal-fs-filename` |
| [review-inputs.mjs:77](../../frontend/e2e/support/review-inputs.mjs#L77) | 24–83 | `security/detect-non-literal-fs-filename` |
| [review-inputs.mjs:109](../../frontend/e2e/support/review-inputs.mjs#L109) | 10–30 | `security/detect-non-literal-fs-filename` |
| [review-inputs.mjs:146](../../frontend/e2e/support/review-inputs.mjs#L146) | 11–49 | `security/detect-unsafe-regex` |
| [review-inputs.test.mjs:12](../../frontend/e2e/support/review-inputs.test.mjs#L12) | 3–60 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:13](../../frontend/e2e/support/review-inputs.test.mjs#L13) | 3–40 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:42](../../frontend/e2e/support/review-inputs.test.mjs#L42) | 78–108 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:43](../../frontend/e2e/support/review-inputs.test.mjs#L43) | 41–71 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:67](../../frontend/e2e/support/review-inputs.test.mjs#L67) | 7–64 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:68](../../frontend/e2e/support/review-inputs.test.mjs#L68) | 7–75 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:78](../../frontend/e2e/support/review-inputs.test.mjs#L78) | 5–113 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:104](../../frontend/e2e/support/review-inputs.test.mjs#L104) | 5–46 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:112](../../frontend/e2e/support/review-inputs.test.mjs#L112) | 5–56 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:114](../../frontend/e2e/support/review-inputs.test.mjs#L114) | 5–47 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:127](../../frontend/e2e/support/review-inputs.test.mjs#L127) | 7–62 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:130](../../frontend/e2e/support/review-inputs.test.mjs#L130) | 7–76 | `security/detect-non-literal-fs-filename` |
| [review-inputs.test.mjs:139](../../frontend/e2e/support/review-inputs.test.mjs#L139) | 7–68 | `security/detect-non-literal-fs-filename` |

Raw evidence: [security JSON](h1-collector-hardening-security-20261107.json).
SHA-256: `4e03e75489089dc6142fbd6ad2bcd3d83d6094b21f3985b035cfed36d927062d`.
Collector source SHA-256: `cf05e001313bc830fdd9bb9aaa2abbdc7c825b0be4ddadb7b901956917e5cef2`.
Test source SHA-256: `ed431584d27876137715a18c08b7bdc9acff94af96084568a4a77510e738abd6`.
Both files exactly match source retained in this fresh report. These are evidence
hashes, not refreshed acceptance fingerprints.

## Documentation, side effects and next decision

This note, the existing review's completion note and the pre-approved QA report
record G01/G02 completion. README's earlier XML-only paragraph and the POM fix
are preserved, not changed again. All unrelated untracked preparation files are
preserved. No .env/credential/token/cookie/runtime-log content, package registry,
network, install, app/database traffic, service restart or Git mutation occurred.
Synthetic temporary test trees were cleaned by their fixture hooks; no repository
or dev-database records were deleted. Build/QA outputs stay ignored. No production
behavior, API contract, token strategy or user data changed. No restart needed.

The targeted defects are resolved with passing regression tests. Remaining H1
work is an explicit residual-finding review/acceptance decision and previously
documented gate prerequisites, not further speculative runtime fixes or more
gate scaffolding. Raw gates remain strict FAILED at last Java=25/frontend=89.
No findings or unchanged trust boundaries were silently accepted. Ask before any
next disposition policy, code change, exclusion activation or H2/H3 run.
