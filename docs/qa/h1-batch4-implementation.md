# H1 / Batch 4 — Hardening and approved CSRF follow-up

Current status: the separately approved CSRF correction and focused regressions
**PASSED: 201 tests, zero failures/errors/skips**. The three empty-pair failures
below are historical and now resolved without weakening assertions. See
[the current follow-up evidence](#approved-csrf-follow-up-current).
The unfiltered Java gate remains **FAILED** for 25 findings; no exclusions added.
Full clean verify subsequently PASSED in the user's terminal: 249 tests in 15
suites, zero failures/errors/skips; aggregate local reports corroborate the run.
Current line coverage is 83.48%, branch coverage 74.06%. See the full-build
handoff at the end of this note; no analyzer was rerun after that clean build.

## Historical initial implementation

Date: 2026-11-07. Focused verification: **FAILED** (177 passed, three failed).
Unfiltered Java security gate: **FAILED** (25 findings, zero analysis errors).
No exclusions or suppressions applied. No live services, DB or real credentials used.

## Shown diff and implementation

Before verification, showed the exact two-line production diff:

- [AuthService](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java#L21)
  is now final.
- [LoginRateLimiter](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/LoginRateLimiter.java#L17)
  is now final.

Constructor injection, null/range/positive-window checks, exceptions/messages,
authentication, limiter behavior and HTTP/ProblemDetail contracts are unchanged.
Finality prevents hostile subclass finalizers, but also deliberately prevents
future subclass-based proxies. No validation was removed, factory introduced,
deprecated finalizer added, VM policy changed or AOP configuration disabled.

No explicit subclass, custom aspect or transactional/async/cache annotation for
these two classes was found in current source. The new isolated context enables
advisor auto-proxying and uses real AuthService/LoginRateLimiter/security beans;
it verifies that the beans remain concrete/unproxied and the same limiter is
constructor-injected. Both test/dev profile contexts initialize successfully.
This is current isolated-context evidence, not the full Boot auto-configuration
test or a guarantee for future advisors. Keep future cross-cutting advice/proxy
changes under review; full Boot verification remains user-owned and pending.

Added tests, without modifying existing test files:

| New file | Cases | Final result / coverage |
| --- | ---: | --- |
| [SecurityComponentConstructionTest](../../backend/springreactdemo/src/test/java/com/vaibhav/springreactdemo/security/SecurityComponentConstructionTest.java) | 11 | PASSED; expiry boundaries and unchanged failure message, both limiter constructors/nulls/minimum-positive duration, finality. |
| [CookieSecurityContractTest](../../backend/springreactdemo/src/test/java/com/vaibhav/springreactdemo/security/CookieSecurityContractTest.java) | 34 | PASSED; missing/unrelated/single/duplicate access cookies, empty-first duplicate, context-path recovery endpoints, safe-method rules, POST/PUT/DELETE missing/wrong/empty-cookie/duplicate CSRF and valid matching pairs. |
| [SecurityAccessMatrixTest](../../backend/springreactdemo/src/test/java/com/vaibhav/springreactdemo/security/SecurityAccessMatrixTest.java) | 82 | 79 PASSED, three FAILED; 64-case real-chain matrix plus logout flags, empty CSRF, real JWT decoder failures, repeated/unknown search parameters, sort support, proxy compatibility and dev-only docs matcher isolation. |

Matrix identities: anonymous, USER, ADMIN and valid signed token without roles.
Routes: list, get, stats, create, update, delete, me, logout, csrf, invalid login,
unknown API, legacy app-test, actuator env, Swagger entry/asset and OpenAPI.
Unsafe matrix requests have valid bootstrap CSRF pairs so 401/403 authorization
results are not obscured by missing-CSRF errors. Public login uses an invalid
empty DTO to prove reachability; it is not a real login/password test. Exact
401/403 type URIs and zero product-service calls on denied requests are asserted.
Stats remains authentication-only, including roleless JWT, preserving current
request-matcher ordering. Product reads remain USER/ADMIN only.

The explicit test-only configuration imports real MVC/security/controller beans
but no Boot auto-configuration/YAML/Mongo configuration. Product persistence and
database-user lookup are mocked. It asserts no Mongo client/user repository bean.
The @TestConfiguration fixture cannot be accidentally component-scanned into
other Boot tests. Generated JWT/CSRF/key material stays in memory; there is no
request dump, body/headers/cookie recording or real password source.

## Final commands and results

From backend/springreactdemo, using cached dependencies only:

```bash
timeout 180s ./mvnw -o -B -Dtest=SecurityComponentConstructionTest,CookieSecurityContractTest,SecurityAccessMatrixTest,LoginRateLimiterTest,SecurityConfigurationTest,ApiExceptionHandlerContractTest,LogSanitizerTest,ProductServiceTest,ProductRequestValidationTest test
timeout 240s ./mvnw -o -B -Pstatic-analysis -DskipTests compile spotbugs:check
```

- Final focused run: **180 cases in nine suites; 177 passed, three failures,
  zero errors/skips**, exit 1. All 53 selected existing regressions passed.
  All 64 access-matrix cases passed. All three failures are the retained CSRF
  rejection expectation described below.
- Initial new-fixture run stopped at a read-only shared conversion service
  (99 cases, one setup error). Replaced it with a mutable per-context service;
  switched deprecated converter configuration to the installed Spring 7 builder.
  A subsequent matrix run had 14 failures: eleven from missing Spring Data MVC
  argument resolvers/static-resource fallback, corrected in the fixture, and
  three CSRF failures that remained. No existing assertion was weakened.
- Valid QA product bodies were added to the failing CSRF requests to avoid
  unrelated missing-body 400 responses. They now demonstrate POST/PUT/DELETE
  reaching mocked services; no real DB writes occur. All expected 403 assertions
  remain intact. The final @TestConfiguration revision was rerun with the same
  180/3/0/0 outcome.
- Compilation and new-test editor diagnostics passed. An existing IDE nullness
  warning on AuthService's unchanged GrantedAuthority method reference remains;
  it is not a javac build failure or part of this fix.
- Full clean verify, live API/browser checks, DB count check and fresh coverage
  reporting were not run. Do not infer a current full-suite pass from the earlier
  101-test P2 result; the new failing tests must be resolved before a green build.

## Confirmed new regression — QA-B4-CSRF-EMPTY (fix NOT APPLIED)

With a valid signed ADMIN JWT cookie but an empty XSRF-TOKEN cookie and empty
X-XSRF-TOKEN header, the real application filter chain produced:

| Request to mocked persistence | Expected | Actual |
| --- | ---: | ---: |
| POST /api/v1/products, valid qa- body | 403 | 201 |
| PUT /api/v1/products/qa-id, valid qa- body/version | 403 | 200 |
| DELETE /api/v1/products/qa-id | 403 | 204 |

Root cause: [CookieCsrfHeaderFilter line 40](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java#L40)
rejects null/mismatching values but treats two empty strings as equal. Cached
Spring Security 7.1.2 bytecode confirms OAuth2ResourceServerConfigurer registers
an ignored CSRF matcher for requests recognized by its authentication converter.
With this app's cookie bearer resolver, authenticated-cookie requests match that
exception. Therefore Spring's CsrfFilter is not a second check on this path;
the custom double-submit filter must reject empty values itself. The real cookie
repository rejects empty tokens, but is bypassed for this recognized bearer path.

This is an existing validation gap exposed by new tests, not introduced by the
final modifiers. It is not a demonstrated cross-origin browser exploit: the
isolated harness deliberately supplies an authenticated cookie and controls both
CSRF inputs; actual exploitability also depends on browser/CORS/SameSite and
cookie/header control. The request-level invariant is nevertheless broken.
No related COOKIE_USAGE/SERVLET_HEADER hotspot should be treated as cleared.

Proposed minimum follow-up, requiring approval:

1. Reject null or blank cookie/header CSRF values before the existing constant-time
   comparison in CookieCsrfHeaderFilter. Preserve safe-method behavior, duplicate
   rejection, valid-pair handling and the exact 403 ProblemDetail response.
2. Extend direct/full-chain tests for empty and whitespace pairs across POST,
   PUT and DELETE; retain every existing assertion. Rerun focused verification
   and the unfiltered analyzer; user runs full clean verify afterward.
3. With documentation approval, explain in SECURITY.md that the custom filter
   enforces the cookie/header contract on authenticated cookie-bearer requests
   because the resource-server configuration exempts them from Spring CSRF.
   Add a short README offline-test/constructor-proxy note if approved.

No CSRF production fix, security-chain change or documentation claim in README/
SECURITY.md was silently applied. No new suppression is justified by this issue.

## Unfiltered Java findings after hardening

Analyzer finished with 25 findings, zero errors/missing classes; strict gate exit 1.
Sequence: 52 -> 30 -> 28 -> **25**. All three CT_CONSTRUCTOR_THROW findings are
gone, all other pattern counts unchanged, no new pattern introduced.

| Pattern | Count | Classification / caveat |
| --- | ---: | --- |
| EI_EXPOSE_REP2 | 4 | FALSE POSITIVE in intentional DI/security interpretation. |
| SPRING_ENDPOINT | 11 | DESIGN CHOICE; new access matrix passes, not a blanket security exemption. |
| COOKIE_USAGE | 4 | DESIGN CHOICE as a mechanism; the separate empty-CSRF flaw remains REAL and open. |
| PREDICTABLE_RANDOM | 2 | DESIGN CHOICE; deterministic dev-only fixtures. |
| SERVLET_PARAMETER | 1 | DESIGN CHOICE; repeated/unknown-name and bounded-service regressions pass. |
| SERVLET_HEADER | 1 | DESIGN CHOICE as input handling; related CSRF validation defect remains open. |
| THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | 2 | DESIGN CHOICE; supported fail-fast builder signatures. |

Remaining scanner dispositions: FALSE POSITIVE=4, DESIGN CHOICE=21. Separately,
the new regression establishes one REAL functional CSRF issue not independently
reported by a dedicated analyzer pattern. Do not interpret absence of a scanner
REAL label as absence of a real security issue.

No filters/annotations/ignores were added; Max effort, Low threshold and strict
gates are unchanged. Prior exact exclusion drafts are still proposals only.
Frontend's last result remains 61 warnings, not rerun in this backend batch.

## Side effects and handoff

Only the two final modifiers and three new test files change source in this
approved implementation. Prior dirty work is preserved. Five implementation
source/test files scanned: zero private-key markers, JWT literals or exact
matches for available approved dev passwords; no values/matching lines printed.
Build/report artifacts are ignored. QA implementation note, plan and test report
are also ignored and will not be included by ordinary staging.

No .env read, real credential use, network/download/install, socket/service/DB
operation, Git mutation or restart occurred. These offline checks need no backend
restart; no live runtime uptake is claimed. Stop here pending approval of the
CSRF correction, tests and suitable README/SECURITY.md documentation. Do not
start unrelated QA items, apply exclusions or advise merging the failing revision.

## Approved CSRF follow-up (current)

After separate explicit approval, changed only the custom filter's unsafe-request
guard to reject null or Java String.isBlank() cookie/header values before the
existing MessageDigest.isEqual comparison. No trimming/normalization, matcher,
cookie flag, safe-method behavior or ProblemDetail contract changed. Added a
comment explaining the resource-server CSRF exemption. The shown production
diff was reviewed before verification; no further source change followed it.

Preserved the original three full-chain empty-pair rejection tests and their
no-product-service-call checks. Added 12 direct filter cases (empty/spaces/tabs/
Unicode whitespace across POST/PUT/DELETE) and nine full-chain whitespace cases.
The latter also assert exact 403 status/title/type and problem JSON content type.
Existing valid-pair, missing/duplicate/mismatched material, recovery, JWT,
authorization and constructor regressions all remain and pass. Whitespace tests
use servlet mocks; they do not claim that every HTTP parser accepts such values.

Final command is the same nine-suite focused Maven command above. Results:

| Suite/group | Cases | Outcome |
| --- | ---: | --- |
| SecurityComponentConstructionTest | 11 | PASSED |
| CookieSecurityContractTest | 46 | PASSED |
| SecurityAccessMatrixTest | 91 | PASSED, including all 64 access-matrix cases |
| Six selected pre-P4 regression suites | 53 | PASSED |
| **Total** | **201** | **Zero failures/errors/skips; BUILD SUCCESS** |

Focused run completed 2026-11-07 14:57:21 +05:30 in 13.249 seconds. This resolves
QA-B4-CSRF-EMPTY in isolated real-chain tests: POST/PUT/DELETE now return 403
before mocked persistence. No live data or services were contacted. The fix
does not automatically prove safety of every CSRF attack/precondition.

Reran the same unfiltered offline SpotBugs command after passing tests. It
completed 14:58:01 +05:30 in 13.450 seconds with 25 findings, zero analysis
errors/missing classes and exit 1 for the strict gate. Pattern counts remain
EI_EXPOSE_REP2=4, SPRING_ENDPOINT=11, COOKIE_USAGE=4, PREDICTABLE_RANDOM=2,
SERVLET_PARAMETER=1, SERVLET_HEADER=1,
THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION=2. Dispositions remain FALSE POSITIVE=4
and DESIGN CHOICE=21. No dedicated scanner report tracked the now-fixed empty
CSRF defect; tests supply that evidence. No suppressions, filters, threshold or
effort changes, or new pattern appeared. Frontend's prior 61 warnings were not
rerun and overall H1 is still FAILED.

Approved documentation changes: SECURITY.md explains nonblank matching and why
the custom filter is authoritative on recognized cookie-bearer requests; README
adds the isolated security command/limits and final-class proxy caveat. Prior
README edits are preserved. Updated this ignored note, remediation status and
pre-approved QA report; retained all historical failures for traceability.

New-test/filter editor checks and git diff whitespace checks passed. Five changed
source/test/README/SECURITY files scanned: zero private-key markers, JWT literals
or exact matches for available approved dev passwords. No values/lines printed.
No .env read, real credential use, network/download/install, live API/database
write, dependency/config change, service restart or Git mutation occurred.

The user subsequently ran ./mvnw clean verify and shared sanitized Maven output:
249 tests (101 pre-P4 + 148 current P4), zero failures/errors/skips, successful
JAR packaging/repackage and JaCoCo reporting. BUILD SUCCESS in 29.479 seconds,
finished 2026-11-07 15:02:08 +05:30. The agent did not execute this build.

Read-only local corroboration: 249 cases across 15 Surefire suites, no failures/
errors/skips; packaged JAR present. Root JaCoCo counters: 561 covered/111 missed/
672 total lines (83.48%), 197 covered/69 missed/266 total branches (74.06%);
35 analyzed classes per supplied output. Coverage XML mtime is
2026-11-07T09:32:08.221Z, matching the user-run build completion.

The clean build removed the native SpotBugs report, as expected. It did not
activate the static-analysis profile; last Java result remains 25 findings and
frontend remains 61 warnings. No fresh analyzer result, live-runtime uptake or
blanket security clearance is implied. No source/config/test edits, suppression,
download, credential read, app/DB traffic, service restart or Git mutation were
performed while recording this result. Only ignored QA status documents updated.

P4 implementation now has focused and full-build success, but H1 remains FAILED
for unresolved strict analyzer gates. Further exclusion proposals/implementation,
live reruns, restarts, unrelated QA and Git operations require separate approval.
No restart was needed for the build; user-owned restart is needed before live
verification of changed application code. No restart was performed by the agent.
