# H1 — Inactive reviewed-gate preparation

Date: 2026-11-07. Approval: refresh four relocated review entries and prepare
reviewed-gate adapters, **without activating exclusions or changing raw gates**.

## Status and exact scope

Preparation verification: **PASSED**. H1 overall: **FAILED** on the last raw
application gates. There is still no executable reviewed gate, accepted-finding
manifest, filter XML, Maven profile/npm command wiring, or activation switch.
These modules are preparation components, not a security clearance or working CI
acceptance gate. Merely importing or running tests cannot enable exclusions.

New reusable files (not staged/committed):

- [review-inputs.mjs](../../frontend/e2e/support/review-inputs.mjs) and
  [15 synthetic tests](../../frontend/e2e/support/review-inputs.test.mjs): fixed-scope,
  bounded read-only source/config discovery; fresh source/control hash maps;
  package identities; reject symlink/invalid UTF-8/oversized/missing inputs. Source
  scope is backend main Java, frontend src/e2e, and root frontend code/config;
  node_modules reads are limited to four explicit package manifests. Hidden/local
  configuration, runtime logs, build outputs and application data are not opened.
  The real-repository metadata-only smoke found 84 sources (35 Java/49 frontend),
  11 controls and no hidden input paths. No source content was printed.
- [review-native-frontend.mjs](../../frontend/e2e/support/review-native-frontend.mjs),
  [declarations](../../frontend/e2e/support/review-native-frontend.d.mts), and
  [23 synthetic tests](../../frontend/e2e/support/review-native-frontend.test.mjs):
  native result/count/coverage/path/exit checks, exact source/control/parser pins,
  exact diagnostic snippet and smallest enclosing parsed statement/declaration
  anchors using installed Espree/TypeScript parsers. Fatal, null-rule, unlocated,
  duplicate, unexpected and suppressed diagnostics are retained and block. No
  automatic native path rewriting, unlocated-to-clean projection or baseline
  regeneration. Plain-data input rejects getters/proxies/cycles and is bounded
  by depth 64, 100,000 nodes and 8 Mi UTF-16 text units cumulatively.
- [java_report.py](../../tools/qa/reviewed/java_report.py) and
  [41 synthetic tests](../../tools/qa/reviewed/test_java_report.py): pure byte-input
  native SpotBugs XML adapter. DTD/entities/external references/namespaces and
  malformed/oversized/deep XML are rejected without I/O. Checks exact project
  output/version, raw exit, counters, complete supplied expected class inventory,
  per-class/package totals, exact primary annotations and JVM signatures. Retains
  all native findings, including unknown patterns and duplicates. Unrepresentable
  class-only/field-only reports retain their raw diagnostics and block instead of
  inventing a method. Empty/absent class coverage blocks even with zero errors.

All new tests are synthetic/offline. Existing tests/guard behavior remain intact.
No intentionally unsafe fixture is executed. Python tests are separate tooling
checks, not additions to Maven/Surefire application test counts.

## Approved proposal refresh

Updated only the original [documentation-only proposal](h1-final-dispositions.md):

- F54 now points to frontend/e2e/support/canonical.mjs:5:84–94.
- F55/F56/F57 point to restart-idempotence.mjs:68:31–68, :78:21–45,
  and :79:19–39, respectively.
- Updated the changed runner hash and added the extracted helper hash. All 27
  candidate source hashes were independently checked: zero drift. IDs, rule
  identities, rationale groups and 61 total candidates remain unchanged.
- Replaced outdated statements that the supporting tests/raw reconciliation were
  still pending with links to the completed evidence. Preserved separate full
  build/coverage limitations and the activation boundary.

This was an explicit one-time documentation update, not approval of accepted
exceptions. The earlier [raw reconciliation](h1-raw-reconciliation-20261107.md)
remains historical evidence of the previous coordinates/hash; it was not rewritten.

## Diff-before-verification and commands

The user was shown file/diff summaries before verification of each component.
Commands used installed tools only, with timeouts and no downloads:

```bash
# Repository root: pure Python adapter tests.
timeout 180s python3 -B -m unittest discover -s tools/qa/reviewed -p test_java_report.py

# frontend/: focused and full checks.
timeout 180s ./node_modules/.bin/vitest run e2e/support/review-inputs.test.mjs
timeout 180s ./node_modules/.bin/vitest run e2e/support/review-native-frontend.test.mjs e2e/support/review-inputs.test.mjs e2e/support/review-guard.test.ts
timeout 180s npm run lint
timeout 180s npm run test
timeout 180s npm run typecheck:e2e
timeout 180s npm run build

# Explicit declaration validation (TypeScript 6).
timeout 120s ./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2023 --types node e2e/support/review-native-frontend.d.mts
```

Results: 15 collector tests pass; 132 focused frontend tests pass (94 existing
pure-guard + 23 adapter + 15 collector); full frontend **211 tests in nine files**
pass. Python **41 tests pass**. Normal lint, E2E typecheck, explicit declaration
check and production build pass. Editor diagnostics for all seven new files are
clear. Git whitespace check passes. No assertion, lint rule or threshold weakened.

Two verification-command corrections are disclosed: a targeted ESLint invocation
explicitly selected .d.mts, which is outside existing ESLint matching rules and
therefore returned an ignored-file warning. No configuration was altered; normal
lint passed and declarations were checked with TypeScript instead. The initial
explicit TypeScript filename command returned TS5112; adding TypeScript 6's
required --ignoreConfig flag made it pass, without editing repository tsconfigs.
Neither was a production or assertion failure.

Build output remains 1,004,980 JavaScript bytes, gzip 304.24 kB, zero emitted
production source maps and the existing >500 kB chunk warning. The preparation
modules are not imported by application source. No application runtime behavior
or production API contract changed; no backend restart is required.

## SpotBugs class-statistics root cause and unapplied correction

Read-only cached-bytecode inspection of spotbugs-maven-plugin 4.10.5.0 and core
SpotBugs 4.10.5 explains the combination seen in the previous run:

1. With simultaneous HTML and XML enabled, the Maven plugin adds HTML first.
2. BugReportDispatcher.getProjectStats() returns the statistics object from the
   first reporter; FindBugsSummaryStats updates that object.
3. Findings dispatch to both reporters, so the XML still contains 25 findings
   while its statistics inventory remains empty (total_classes=0, no ClassStats).

This identifies a reporting-path problem, not evidence that every application
class was skipped or that the 25 findings are fabricated. It also does not make
zero-count coverage trustworthy. The new parser was applied read-only to the
saved XML against the 38 current compiled application class identities: status
blocked, issue EMPTY_COVERAGE, healthy=false, original exit=1 and all 25 native/
normalized finding slots retained. No application scanner was rerun in this stage.

Proposed **next correction requiring approval**: use XML-only output for the
native scan (disable simultaneous HTML, render presentation output separately
if needed), preserving Max/Low/strict failure/FindSecBugs/production-only scope.
Then rerun and verify class statistics against an independently obtained exact
compiled class inventory. This has NOT been implemented or verified by a new
application scan; Maven configuration and raw commands remain unchanged.

## Remaining prerequisites and safety boundary

- The strict frontend adapter deliberately blocks all suppressed diagnostics.
  The prior raw report contains one existing non-security react-refresh directive
  in AuthContext.tsx. It was disclosed, not silently allowed or removed. A later
  decision is needed on fixing that non-security source organization or narrowly
  reviewed policy; security suppressions must remain blockers.
- The last frontend raw scan predates the new preparation files. A future approved
  raw rescan may report additional diagnostics in this tooling; none may be
  auto-added to candidate exceptions. Last raw totals remain historical 25 Java/
  61 frontend, not a fresh current scan of this preparation.
- Input maps/parser metadata establish supplied-data consistency, not authentic
  execution provenance. A future runner must bind complete before/after source,
  compiled-bytecode and analyzer/config/runtime inventories to a fresh unfiltered
  invocation; map native Java source paths to exact repository identities; verify
  Java member/AST anchors and valid current test evidence; and exercise native
  filter membership before any activation. These prerequisites are not claimed
  complete by this preparation, and no acceptance result is emitted.
- Collector pins currently cover only the fixed listed inputs, not the entire
  transitive runtime implementation or future CI trust chain. New parser/tool
  versions, changes in source/config or additional files must cause renewed
  review, never automatic fingerprints or broader acceptance.
- Full backend clean verify/coverage remains user-owned/pending after supporting
  seeder cases (expected full app count 265). The previous 217 focused backend and
  249 full-suite results are historical; no new Maven test/full build ran here.
- Updated only pre-approved ignored QA documents plus the seven new inactive
  tooling/test files. No production source, POM, npm scripts/lock/configuration,
  manifest/filter, existing assertion, Git setting, service or application data
  changed. No .env, real credential, JWT/cookie value or runtime log body was read
  or printed. No remote traffic, install, app/database action, restart or Git
  mutation. Build output and QA documents remain ignored; new reusable files are
  visible/untracked for the user's later Git workflow, not staged by the agent.

H1 remains FAILED; no raw gate is relabeled PASSED. Request approval for the
XML-only reporting correction and fresh H1 rescans next, with exclusions still
disabled. Do not start H2/H3 or activate a reviewed policy without further approval.
