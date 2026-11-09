# H1 supporting evidence and review guards

Scope approved on 2026-11-07: supporting evidence tests, inert positive analyzer
fixtures and candidate-reconciliation guards. Exclusions remain disabled. This
is not approval to accept findings, change the raw gates, start services, run
live G1–G4 runners, install dependencies or alter Git state.

## Diff and boundaries

- Added [ProductSeederEvidenceTest](../../backend/springreactdemo/src/test/java/com/vaibhav/springreactdemo/product/ProductSeederEvidenceTest.java):
  16 mock-only cases covering dev-only registration/default/configurable counts,
  batch boundaries, disabled/nonempty skipping, second-run skipping and complete
  deterministic product snapshots. The context uses MockEnvironment and mocked
  MongoTemplate/Repository, never Boot auto-configuration or Mongo clients.
  Captured mock inserts are not evidence of actual database ID/auditing behavior.
- Extracted the unchanged G4 canonicalizer into
  [canonical.mjs](../../frontend/e2e/support/canonical.mjs), with four offline
  tests for value/array preservation, own prototype-name keys, inherited/key
  exclusions and sparse arrays. The runner still calls the same implementation;
  no live runner module is imported by unit tests.
- Added [review-guard.mjs](../../frontend/e2e/support/review-guard.mjs), its typed
  interface and 94 synthetic tests. Strict schemas, exact hashes, full supplied
  source/control inventories, exact native identity/spans/counts, per-Java-site
  multiplicity, overlap/unused rejection, error/exit consistency and source/tool
  drift are checked. All raw findings/exits are retained; exclusionsActive is
  always false. No manifest, native adapter, CLI, POM/script wiring or acceptance
  policy exists. Caller-provided provenance/completeness/health booleans and
  evidence strings are NOT independently verified by this pure module. A future
  trusted native-report adapter/inventory discovery/evidence verifier is required
  before any acceptance-gate activation.
- Added inert ESLint snippets and 24 installed-analyzer tests: unsafe/safe pairs
  for nested regex, dynamic object write, dynamic RegExp and dynamic fs filename,
  at a new path and unaccepted spans of two reviewed paths. lintText analyzes
  strings only; it does not execute snippets or read/import live runners.
- Added [isolated Java controls](../../tools/qa/java-fixtures/pom.xml): standalone
  Maven `pom` packaging with explicitly bound compilation and cached analyzer
  versions, not an application reactor module or dependency. Its twelve inert
  classes are compiled/analyzed only, never executed or loaded by the verifier.
  A separate JDK XML verifier and built-in Node wrapper/tests parse reports with
  DTD/entities/external access disabled and bounded input/time/output. This is a
  fixture-presence/health verifier, not the future native acceptance adapter.

## Completed offline verification

Diff summary was shown before verification. First normal frontend lint failed
on three no-unexpected-multiline test formatting errors. Only the three it.each
call layouts were corrected; no assertions or lint rules changed. A sandbox
stream-fd denial required rerunning frontend tools outside the sandbox, still
offline and without any package install. Both initial failed attempts remain
part of the history rather than being presented as passes.

Focused backend command (cached Maven, offline):

```bash
cd backend/springreactdemo
timeout 180s ./mvnw -o -B -Dtest=ProductSeederEvidenceTest,SecurityComponentConstructionTest,CookieSecurityContractTest,SecurityAccessMatrixTest,LoginRateLimiterTest,SecurityConfigurationTest,ApiExceptionHandlerContractTest,LogSanitizerTest,ProductServiceTest,ProductRequestValidationTest test
```

Result: 217 tests, zero failures/errors/skips, BUILD SUCCESS in 14.467 seconds.
Seeder log messages in this run describe mocked inserts, not database changes.
Final editor checks identified three null-safety diagnostics on method references
in the new seeder helper. Replaced them with explicit Objects.requireNonNull
lambdas, preserving all assertions and adding no suppressions. Editor diagnostics
are clear; the same focused command passed again: 217 cases, no failures/errors/
skips, 13.908 seconds, finished 2026-11-07 18:17:38 +05:30.

Frontend commands (existing installed dependencies, no network):

```bash
cd frontend
npm run lint
npm run test
npm run typecheck:e2e
npm run build
```

Result: lint/typechecks/build pass; 173 tests in seven files pass (previous 51,
plus 122 new frontend cases: 94 guard, 24 analyzer controls, four canonicalizer).
The 16 seeder cases are counted in Java, not in this frontend total.
Production JS remains 1,004.98 kB,
gzip 304.24 kB; the existing >500 kB warning remains. QA modules are not imported
by application source. Runner/helper syntax checks and git diff --check pass.

No new full backend build, updated full coverage, live/API/browser test or
database count is claimed. The user's prior full build had 249 passing cases;
expected full application count after the 16 seeder cases is 265, still pending
the user's full clean verify with dedicated MONGODB_TEST_URI. Focused Maven test
runs update Surefire/JaCoCo execution artifacts; they do not regenerate the full
coverage report and must not be used as fresh full-suite coverage evidence.

## Isolated Java analyzer verification

The initial fixture scan completed with nine findings/errors=0, but exposed
setup assumptions: an unsupported xmlWithMessages option, an incorrect checker
path (native XML is target/spotbugsXml.xml), and a getCookies() example that does
not exercise CookieReadDetector. Inspected the installed detector's bytecode:
it flags Cookie.getName/getValue/getPath as COOKIE_USAGE, not SERVLET_COOKIE.
Removed the invalid option, corrected the fixed report path, added an inert
Cookie.getValue method and corrected the fixture verifier's expected identity.
No application behavior, gate/rule or assertion was weakened. The unchanged
getCookies example remains without a detector-coverage claim.

After showing the fixture diff, ran (repository root):

```bash
timeout 240s backend/springreactdemo/mvnw -o -B -f tools/qa/java-fixtures/pom.xml compile spotbugs:check
node --test tools/qa/java-fixtures/check-report.test.mjs
node tools/qa/java-fixtures/check-report.mjs
```

The final raw fixture scan exits 1/BUILD FAILURE, as expected for deliberately
warning-bearing inputs: ten reports, zero analysis errors/missing classes. Eight
required patterns each appear once: EI_EXPOSE_REP2, PREDICTABLE_RANDOM,
CT_CONSTRUCTOR_THROW, SPRING_ENDPOINT, SERVLET_HEADER, SERVLET_PARAMETER,
COOKIE_USAGE and THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION. Two additional
DMI_RANDOM_USED_ONLY_ONCE reports (including the SecureRandom example) remain
visible and counted. The SecureRandom control claims absence of predictable RNG,
not absence of every possible warning. Other controls similarly prove absence
only of their corresponding pattern. Endpoints/request-read patterns are
informational controls, not proof of authorization or validation safety.

Verifier exits 0: findings=10, missing=0, controls=0, analysisErrors=0,
missingClasses=0. All five verifier test groups pass: complete/extra retained,
missing member/control rejection, control finding rejection, analyzer-error/
summary rejection and malformed/DTD/entity rejection. Parser failures output
only a fixed failure count, never XML contents/exception text. The generated
fixture XML/classes live under its own ignored target directory. No application
SpotBugs output was generated or overwritten. No exclusions or normal command
wiring changed. The fixture checker deliberately accepts extra counted fixture
findings; the separate candidate-reconciliation guard rejects unmatched findings
and is not yet wired to actual reports.

## Raw H1 and approval boundary

No fresh raw application scan ran. Last completed strict gates remain FAILED:
25 Java findings and 61 frontend warnings. Source/line provenance in the earlier
proposal is now stale for the extracted canonicalizer/G4 lines; new supporting
tooling may add findings. No previous hashes or candidate counts were silently
refreshed, and no current match-count claim is made.

Next, request separate approval for fresh unfiltered inventories and exact
candidate reconciliation. Any exclusion/manifest/native adapter or reviewed-gate
activation requires its own approval and shown diff. No wildcard exclusions,
rule disables or raw-exit reinterpretation are authorized. No restart required
for this supporting work. Existing production changes from earlier batches were
preserved, not expanded by these tests.
