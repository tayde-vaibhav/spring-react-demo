# H1 finding-by-finding remediation plan

Status: P1 and P2 were separately approved and implemented. P1 full verification
passed in the user's terminal (63 tests); P2 final focused verification passed
(79 tests in nine suites, including 38 new P2 cases). The Java rescan sequence is
52 -> 30 -> 28 -> 25: the 22 collection aliases, both locale/logging findings and
three constructor findings are
removed, zero new findings, zero analysis errors/missing classes. No suppressions
or live service tests occurred. H1 remains **FAILED** for 25 Java findings and
61 frontend warnings after the approved P3 rescan (previously 65). Full clean verify for the P2 revision
subsequently passed in the user's terminal: 101 tests in 12 suites, no failures,
errors or skips, successful packaging and JaCoCo reporting. The agent corroborated
local artifacts rather than running the build. Approved P3 hardening and offline
verification are complete: normal lint, 51 unit tests, E2E typecheck, production
build and changed-runner syntax checks passed. P4 hardening was subsequently
approved and implemented as noted below; further fixes, live reruns and all
exclusions still require approval. See [P2 classifications and draft exclusions](h1-batch2-findings.md)
and [P3 results and remaining classifications](h1-batch3-findings.md).

P4 review/proposals were subsequently approved and completed without source,
test, configuration or exclusion changes. See [P4 exact scopes and proposals](h1-batch4-review.md).
It retains three conditional constructor findings, identifies eight narrow
exclusion candidates (not applied), and defers dispositions for 17 hotspots
pending stronger regression evidence. No fresh analyzer/test run is claimed.

Subsequent approved P4 implementation made AuthService/LoginRateLimiter final
and added 127 offline regression cases without modifying existing tests. Final
focused result: 180 cases, 177 passed, three failed, zero errors/skips. Both
isolated Spring contexts and all 64 access-matrix cases passed; the three failures
expose an existing empty-CSRF-pair acceptance gap. Unfiltered Java scan is now
25 findings, zero errors/missing classes, no exclusions. See
[P4 implementation evidence and approval request](h1-batch4-implementation.md).
That initial failure is now resolved by a separately approved null/blank CSRF
guard, 21 additional cases and README/SECURITY documentation. The original
rejecting assertions remain; final focused result is 201 passed, zero failures/
errors/skips. Fresh unfiltered scan remains 25 findings, zero errors/missing
classes, no exclusions. Full clean verify subsequently PASSED in the user's
terminal: 249 tests across 15 suites, zero failures/errors/skips. Local aggregate
reports corroborate line coverage 83.48% (561/672) and branch coverage 74.06%
(197/266), successful packaging and report timing. The agent did not run the
build or rerun analyzers afterward. H1 remains FAILED for the last 25 Java
findings and 61 frontend warnings; exclusions remain unapproved/unapplied.

## Inventory and severity

- 52 Java findings, each listed as J01–J52 below. Native tool priorities are
  normal/medium (31) or low (21), not verified vulnerability severities.
- 65 frontend findings, each listed as F01–F65, including separate column-level
  findings on the same line. Sixty-four are QA-only; one is application code.
- 22 Java findings confirm mutable collection aliases in entities/record DTOs;
  these are in-process integrity/design-hardening issues, not demonstrated
  authorization bypasses or remote mass assignment.
- One confirmed locale-dependent ProblemDetail type construction issue and one
  logging-hardening candidate. No remote exploit was demonstrated in this review.
- Four DI aliases, 17 endpoint/input/cookie hotspots, two dev fixture RNG reports,
  three throwing-constructor reports and two framework throws-signature reports
  require individual expected-design dispositions, not blanket security exclusions.
- No high/critical vulnerability was confirmed by this source review. This is not
  proof that none exists; no exploit tests or timing checks occurred. Only the
  separately approved Java analyzer rescan described above was repeated.

Line numbers are report/source anchors from the existing scan, not future patch
positions. Compiler-generated record constructor reports may anchor at line 1.
This is the original pre-P1 scan inventory. The approved fresh Java rescan verifies
removal of J04–J07, J20–J33, J40–J41 and J51–J52 (22 collection aliases).
P2 also removed J02 and J03; the other 28 Java rows remain. No new findings appeared. Comparison used a
multiset of bug pattern, class, method and field, not shifting line numbers.
The pre-P2 full backend suite passed in the user's terminal (63 tests);
local Surefire/JaCoCo artifacts corroborate it. Coverage: 516/649 lines (79.51%)
and 158/236 branches (66.95%). These are pre-P2 figures, not new full-build or live
results. Current P2 focused tests passed; the user's full rerun subsequently
passed (101 tests). Current full coverage is 542/671 lines (80.77%) and 185/262
branches (70.61%). No live API verification is implied.

## Proposed implementation batches — separate approval required

### P1 — Collection ownership (approved and implemented)

Targets: Product tags/specs, User roles, product request/update/response/page records,
and AuthUserResponse. This accounts for 22 findings, not the four DI warnings.

Use null-preserving snapshots on collection entry and exposure. Copy nested Map/List
containers recursively for specs, retaining null values and numeric types. Shallow
Map.copyOf is insufficient and rejects permitted null values. Preserve absent/null
optional tags/specs so Jakarta validation and the existing wire contract do not
change. Do not turn DTO construction into the validation layer: invalid null
elements/unsupported/deep inputs must still reach the existing 400 validation
contract rather than becoming an uncaught constructor exception. Bound/guard any
recursive helper against cyclic or excessive-depth programmatic inputs; preserve
SpecsValidator's acceptance/rejection rules.

Mongo field mapping must continue to hydrate Product/User, and any collection
returned from a getter/accessor must not allow a caller to mutate persisted/entity
state. Records need compact constructors and safe accessors where necessary;
copy nested containers, not Spring collaborators. Preserve Decimal128-compatible
prices, auditing, version and JWT roles.

Tests implemented in CollectionSnapshotsTest, CollectionOwnershipTest and
CollectionContractTest (26 new test cases, plus 15 unchanged isolated regressions):
- Mutating original tags/specs/roles after construction or assignment leaves stored
  state unchanged; mutating returned collections cannot mutate internal state.
- Nested map/list aliases, null entries/optional fields and numeric values are
  covered, including deliberately invalid inputs that must still validate to 400.
- Request/response JSON compatibility, strict unknown-field rejection, version
  409 behavior and Mongo mapping round-trip using the isolated test database or
  offline converter where sufficient.
- Full backend tests remain intact; no assertion or coverage exclusion removed.

Docs proposed with this batch: short collection-ownership/testing note in README
and QA report. No API/security claim beyond what tests demonstrate.

### P2 — Stable ProblemDetail types and bounded logging (approved and implemented)

Targets: ApiExceptionHandler, package-private LogSanitizer, focused tests and README.
Final evidence: 79 focused tests passed, exact literal type/status/title/detail/field
contracts checked under root/English/Turkish defaults; one-line/control/truncation
and sensitive-source non-leakage checks passed. Both P2 scanner findings vanished
without exclusions. The diff was shown before verification. The plan below records
the intended scope; see the P2 report for final details.
- Use Locale.ROOT for stable lowercasing of the type suffix; assert the same type
  under Turkish and root/default locales, restoring any changed test locale in
  finally and avoiding parallel-test interference.
- Bound the logged request path and escape CR/LF for log safety; do not decode
  encoded delimiters into raw controls. Preserve generic client 500 ProblemDetail.
- Do not start logging request bodies, query strings, authorization/cookie headers,
  credentials or tokens. Raw exception messages/cause/suppressed chains are now
  omitted together with the attached stack trace; retain only the already-logged
  path and original exception type, both bounded/sanitized. This intentionally
  reduces server diagnostics to avoid a bypass around path sanitization.
- Test synthetic malicious paths and sanitized client response using in-process
  mocks/log capture, not live credentials. Never persist captured canary values.

Exploitability of the current CRLF path remains unproven because the HTTP parser/
container may reject raw controls. Treat it as low-cost defense in depth rather
than a demonstrated log-forgery incident.

Docs updated: narrow error/logging-contract note, QA report and classification
report. No restart performed now; user-owned restart may be needed later only
for live checks against changed backend code.

### P3 — Frontend/QA findings without weakening assertions

Approved and implemented: literal label escaping, Map-backed QA counters,
unchanged price-rule extraction, and 39 new offline regression cases. All 51
unit tests pass, with normal lint/typechecks/build/syntax checks passing. The
unfiltered security gate remains FAILED: 61 warnings, zero errors; four counter
warnings removed, no new pattern counts. See the P3 report for moved locations,
remaining trust boundaries and limits. No suppressions or live E5/G1/G2 run.
Remaining own-key canonicalizer/array/allowlist statements were inspected and
retained, not refactored or separately runtime-tested to silence the scanner.

All 65 rows are mapped below; recommended choices:
- Preserve the bounded price grammar (F65) and bounded reporter-id parser (F64).
  Add focused valid/invalid/long-input tests before any expression-local,
  rule-specific justification. Do not loosen price precision or expose raw titles.
- Twenty-nine unsafe-regex warnings identify label locators, not redaction regexes.
  Corrects the earlier broad initial triage: none of the 31 unsafe-regex warnings
  in this report is on a token-redaction regex. These labels inspect controlled
  local DOM. Retain optional required-marker/whitespace matching, uniqueness and
  timeout assertions. Prefer exact-expression justifications with evidence;
  do not rewrite locators merely to silence a heuristic.
- F43 constructs a pattern from an internal label argument. Escape label
  metacharacters in the generic helper and test literal punctuation plus required
  suffix behavior if this small test-only hardening is approved.
- For all 30 dynamic-property warnings, distinguish constant field/environment/
  metadata allowlists, bounded array indexes and status counters. Preserve every
  equality, winner, ownership, cleanup and environment-value redaction assertion.
  Map/null-prototype counters are an option, not an automatic necessary rewrite.
  Test own keys such as __proto__/constructor without printing payload data.
- For the three filesystem warnings, retain fixed module-relative log/checkpoint
  URLs and read-only access; do not add arbitrary CLI/environment path overrides.
- Any approved lint exception must name one rule at the smallest practical
  statement/expression and explain the trust boundary. No file-wide disables,
  deleting tests, changing warning threshold, broad QA exclusion or all-rule off.

Docs proposed: individual dispositions here and commands/limitations in README.
Existing token/password redaction must not be changed based on this warning list.

### P4 — Expected framework/dev behavior and narrowly scoped dispositions

Review/proposals, constructor hardening and the separately approved CSRF fix are
implemented. Focused verification now PASSED all 201 cases, including the three
previously failing CSRF cases. The strict analyzer gate remains FAILED for 25
findings. All exclusions remain unapproved/unapplied.
The P4 note documents all 28 exact scopes, local JDK finalization caveats,
proxy-safe fix options, regression gaps and draft exact filters. H1 stays FAILED.

Review each relevant Java row, then propose an exact class + method/signature or
field + bug-pattern filter entry; no category/package-wide filtering. Preserve:
- request-level authorization and default-deny behavior for all listed endpoints;
- typed filters/parameter allowlists, validation, JWT verification and duplicate
  cookie rejection;
- CSRF checks, cookie flags, null roles handling and stale-cookie login recovery;
- fixed-seed dev data generation (never replace required deterministic RNG solely
  for the scanner);
- constructor fail-fast validation and supported Spring builder signatures;
- Spring proxy compatibility: do not make beans final merely to silence warnings.

For throwing-constructor findings, first establish the hostile-subclass/finalizer
preconditions and safe options on this runtime. Do not remove throws/validation.
Retain these findings open if a safe, narrow disposition cannot be justified.

If approved, add a narrowly matched SpotBugs exclude file with a rationale per
entry, keep the unfiltered original inventory for traceability, validate that
entries match only reviewed findings, and retain positive lint/security-rule
fixtures proving newly introduced unsafe code is still detected. Do not lower
effort/confidence settings or disable all SECURITY findings.

### P5 — Verification, separately gated

Prerequisite: MONGODB_TEST_URI exported into the actual build environment with no
fallback to development MONGODB_URI. Do not inspect .env or invent/search for a
credential. Missing variable blocks full backend regression tests.

After explicit approval and applicable P1–P4 implementation:
1. Run full backend clean verify with all existing tests; separately activate the
   static-analysis profile to verify analysis and narrow dispositions.
2. Run frontend normal/security lint, all unit tests, E2E typecheck and build.
3. Rerun approved focused B2/B3/C6 and E5 checks if production collection/error
   behavior changes; these need live credentials/services and data-write approval,
   qa-owned cleanup and final total 500. No such runtime rerun is approved now.
4. Compare raw and reviewed inventories; a zero filtered gate alone is not proof
   of vulnerability absence. Report fixed/justified/open counts explicitly.
5. Ask before H2; no Docker image, service change, Git operation or new download
   is part of this plan.

## Complete Java inventory

| ID | Location / member | Rule | Assessment | Proposed action / evidence |
| --- | --- | --- | --- | --- |
| J01 | [AppTestController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/AppTestController.java) :17 · appTest  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J02 | [ApiExceptionHandler.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/api/ApiExceptionHandler.java) :101 · handleUnexpected  | CRLF_INJECTION_LOGS | Low log-hardening candidate; runtime exploit unproven | P2: bounded CR/LF-safe path logging, no body/header logging; synthetic capture test |
| J03 | [ApiExceptionHandler.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/api/ApiExceptionHandler.java) :108 · problem  | DM_CONVERT_CASE | Confirmed default-locale dependency; low correctness issue | P2: Locale.ROOT; Turkish-locale ProblemDetail type test |
| J04 | [Product.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/Product.java) :113 · getSpecs (specs) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J05 | [Product.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/Product.java) :105 · getTags (tags) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J06 | [Product.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/Product.java) :117 · setSpecs (specs) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J07 | [Product.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/Product.java) :109 · setTags (tags) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J08 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :42 · <init> (productService) | EI_EXPOSE_REP2 | Expected DI alias; not an external injection finding | P4: retain constructor injection; exact member/rule justification after approval |
| J09 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :79 · search  | SERVLET_PARAMETER | Expected request input; allowlist and typed binding present | P4: preserve parameter-name, operator-input and bounded-filter tests |
| J10 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :47 · create  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J11 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :67 · delete  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J12 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :57 · getById  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J13 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :85 · getStats  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J14 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :79 · search  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J15 | [ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) :62 · update  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J16 | [ProductSeeder.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java) :56 · <init> (mongoTemplate) | EI_EXPOSE_REP2 | Expected DI alias; not an external injection finding | P4: retain constructor injection; exact member/rule justification after approval |
| J17 | [ProductSeeder.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java) :71 · run  | PREDICTABLE_RANDOM | Intentional deterministic dev-only fixture randomness | P4: narrow seeder-only justification; retain fixed seed and dev guard |
| J18 | [ProductSeeder.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java) :72 · run  | PREDICTABLE_RANDOM | Intentional deterministic dev-only fixture randomness | P4: narrow seeder-only justification; retain fixed seed and dev guard |
| J19 | [ProductService.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductService.java) :41 · <init> (mongoTemplate) | EI_EXPOSE_REP2 | Expected DI alias; not an external injection finding | P4: retain constructor injection; exact member/rule justification after approval |
| J20 | [ProductPageResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductPageResponse.java) :6 · content (content) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J21 | [ProductPageResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductPageResponse.java) :1 · <init> (content) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J22 | [ProductRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductRequest.java) :21 · specs (specs) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J23 | [ProductRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductRequest.java) :20 · tags (tags) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J24 | [ProductRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductRequest.java) :1 · <init> (specs) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J25 | [ProductRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductRequest.java) :1 · <init> (tags) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J26 | [ProductResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductResponse.java) :16 · specs (specs) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J27 | [ProductResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductResponse.java) :15 · tags (tags) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J28 | [ProductResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductResponse.java) :1 · <init> (specs) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J29 | [ProductResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductResponse.java) :1 · <init> (tags) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J30 | [ProductUpdateRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductUpdateRequest.java) :22 · specs (specs) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J31 | [ProductUpdateRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductUpdateRequest.java) :21 · tags (tags) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J32 | [ProductUpdateRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductUpdateRequest.java) :1 · <init> (specs) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J33 | [ProductUpdateRequest.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/dto/ProductUpdateRequest.java) :1 · <init> (tags) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J34 | [AuthController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java) :39 · csrf  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J35 | [AuthController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java) :45 · login  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J36 | [AuthController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java) :60 · logout  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J37 | [AuthController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java) :72 · me  | SPRING_ENDPOINT | Endpoint discovery hotspot; not proof of missing access control | P4: exact method/rule disposition tied to request-chain authorization tests |
| J38 | [AuthService.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java) :32 · <init>  | CT_CONSTRUCTOR_THROW | Low in-process finalizer hardening; no remote exploit shown | P4: retain fail-fast checks; verify subclass/proxy/finalization assumptions before exact-member disposition |
| J39 | [AuthService.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java) :36 · <init> (rateLimiter) | EI_EXPOSE_REP2 | Expected DI alias; not an external injection finding | P4: retain constructor injection; exact member/rule justification after approval |
| J40 | [AuthUserResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthUserResponse.java) :5 · roles (roles) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J41 | [AuthUserResponse.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthUserResponse.java) :1 · <init> (roles) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J42 | [CookieBearerTokenResolver.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieBearerTokenResolver.java) :24 · resolve  | COOKIE_USAGE | Expected cookie read; security depends on issuance and validation | P4: retain duplicate-cookie rejection, decoder checks and cookie/CSRF tests |
| J43 | [CookieBearerTokenResolver.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieBearerTokenResolver.java) :28 · resolve  | COOKIE_USAGE | Expected cookie read; security depends on issuance and validation | P4: retain duplicate-cookie rejection, decoder checks and cookie/CSRF tests |
| J44 | [CookieCsrfHeaderFilter.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java) :57 · csrfCookieValue  | COOKIE_USAGE | Expected cookie read; security depends on issuance and validation | P4: retain duplicate-cookie rejection, decoder checks and cookie/CSRF tests |
| J45 | [CookieCsrfHeaderFilter.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java) :61 · csrfCookieValue  | COOKIE_USAGE | Expected cookie read; security depends on issuance and validation | P4: retain duplicate-cookie rejection, decoder checks and cookie/CSRF tests |
| J46 | [CookieCsrfHeaderFilter.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java) :39 · doFilterInternal  | SERVLET_HEADER | Expected untrusted CSRF header; checked against cookie | P4: keep matching/duplicate/missing-token checks and CSRF regression tests |
| J47 | [LoginRateLimiter.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/LoginRateLimiter.java) :28 · <init>  | CT_CONSTRUCTOR_THROW | Low in-process finalizer hardening; no remote exploit shown | P4: retain fail-fast checks; verify subclass/proxy/finalization assumptions before exact-member disposition |
| J48 | [LoginRateLimiter.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/LoginRateLimiter.java) :35 · <init>  | CT_CONSTRUCTOR_THROW | Low in-process finalizer hardening; no remote exploit shown | P4: retain fail-fast checks; verify subclass/proxy/finalization assumptions before exact-member disposition |
| J49 | [SecurityConfiguration.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java) :60 · devApiDocumentationSecurityFilterChain  | THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | Expected Spring security builder exception signature | P4: retain framework contract; exact method/rule justification |
| J50 | [SecurityConfiguration.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java) :136 · securityFilterChain  | THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | Expected Spring security builder exception signature | P4: retain framework contract; exact method/rule justification |
| J51 | [User.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/user/User.java) :44 · getRoles (roles) | EI_EXPOSE_REP | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |
| J52 | [User.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/user/User.java) :28 · <init> (roles) | EI_EXPOSE_REP2 | Confirmed mutable-collection alias; medium design hardening | P1: null-preserving defensive snapshots; mutation-isolation and JSON/Mongo mapping tests |

## Complete frontend inventory

| ID | Location (line:column) | Rule | Assessment | Proposed action / evidence |
| --- | --- | --- | --- | --- |
| F01 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs) :135:36 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F02 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs) :136:41 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F03 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs) :222:32 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F04 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs) :225:34 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F05 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs) :226:31 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F06 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs) :227:31 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F07 | [e2e/auth.e2e.ts](../../frontend/e2e/auth.e2e.ts) :17:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F08 | [e2e/auth.e2e.ts](../../frontend/e2e/auth.e2e.ts) :18:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F09 | [e2e/auth.e2e.ts](../../frontend/e2e/auth.e2e.ts) :60:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F10 | [e2e/browser-security.e2e.ts](../../frontend/e2e/browser-security.e2e.ts) :66:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F11 | [e2e/browser-security.e2e.ts](../../frontend/e2e/browser-security.e2e.ts) :67:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F12 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :29:53 | security/detect-object-injection | Read from constant eight-field product allowlist | P3: retain allowlist and full-field equality assertions; exact-statement justification |
| F13 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :34:34 | security/detect-object-injection | Counter key from HTTP numeric status or internally generated error code | P3: prefer Map/null-prototype counter if useful, with key-edge tests; otherwise exact-statement justification |
| F14 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :34:52 | security/detect-object-injection | Counter key from HTTP numeric status or internally generated error code | P3: prefer Map/null-prototype counter if useful, with key-edge tests; otherwise exact-statement justification |
| F15 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :185:11 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F16 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :186:17 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F17 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :186:38 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F18 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :187:71 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F19 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :189:28 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F20 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :189:46 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F21 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :190:58 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F22 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :191:57 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F23 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :222:17 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F24 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :222:41 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F25 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :225:28 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F26 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :228:57 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F27 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :230:41 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F28 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :240:52 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F29 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :241:26 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F30 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :241:44 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F31 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :242:56 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F32 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) :243:55 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F33 | [e2e/dashboard.e2e.ts](../../frontend/e2e/dashboard.e2e.ts) :62:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F34 | [e2e/dashboard.e2e.ts](../../frontend/e2e/dashboard.e2e.ts) :63:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F35 | [e2e/dashboard.e2e.ts](../../frontend/e2e/dashboard.e2e.ts) :93:82 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F36 | [e2e/delete.e2e.ts](../../frontend/e2e/delete.e2e.ts) :30:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F37 | [e2e/delete.e2e.ts](../../frontend/e2e/delete.e2e.ts) :31:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F38 | [e2e/load-smoke.mjs](../../frontend/e2e/load-smoke.mjs) :32:31 | security/detect-object-injection | Counter key from HTTP numeric status or internally generated error code | P3: prefer Map/null-prototype counter if useful, with key-edge tests; otherwise exact-statement justification |
| F39 | [e2e/load-smoke.mjs](../../frontend/e2e/load-smoke.mjs) :32:46 | security/detect-object-injection | Counter key from HTTP numeric status or internally generated error code | P3: prefer Map/null-prototype counter if useful, with key-edge tests; otherwise exact-statement justification |
| F40 | [e2e/load-smoke.mjs](../../frontend/e2e/load-smoke.mjs) :98:5 | security/detect-object-injection | Array index from local bounded loop, worker index or computed winner | P3: retain bounds/winner assertions and complete comparisons; exact-statement justification |
| F41 | [e2e/mongo-outage.mjs](../../frontend/e2e/mongo-outage.mjs) :76:18 | security/detect-object-injection | Read from two explicitly allowlisted credential-variable names | P3: preserve in-memory compare and zero secret output; exact read-only statement justification |
| F42 | [e2e/mongo-outage.mjs](../../frontend/e2e/mongo-outage.mjs) :76:52 | security/detect-object-injection | Read from two explicitly allowlisted credential-variable names | P3: preserve in-memory compare and zero secret output; exact read-only statement justification |
| F43 | [e2e/product-form.e2e.ts](../../frontend/e2e/product-form.e2e.ts) :16:26 | security/detect-non-literal-regexp | Internal test-label parameter; generic helper lacks literal escaping | P3: escape label metacharacters while preserving suffix semantics; fixture tests; no locator assertion removal |
| F44 | [e2e/product-list.e2e.ts](../../frontend/e2e/product-list.e2e.ts) :50:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F45 | [e2e/product-list.e2e.ts](../../frontend/e2e/product-list.e2e.ts) :51:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F46 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :112:67 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F47 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :113:67 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F48 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :195:34 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F49 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :196:38 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F50 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :197:35 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F51 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :198:35 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F52 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :240:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F53 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) :241:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F54 | [e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs) :26:84 | security/detect-object-injection | Canonicalizer reads own JSON keys and returns Object.fromEntries | P3: preserve canonical output; add __proto__/constructor own-key test; exact-statement justification |
| F55 | [e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs) :75:31 | security/detect-non-literal-fs-filename | Fixed module-relative read path; not supplied by HTTP/CLI | P3: retain fixed URLs and read-only behavior; exact-statement justification; never broaden file access |
| F56 | [e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs) :85:21 | security/detect-non-literal-fs-filename | Fixed module-relative read path; not supplied by HTTP/CLI | P3: retain fixed URLs and read-only behavior; exact-statement justification; never broaden file access |
| F57 | [e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs) :86:19 | security/detect-non-literal-fs-filename | Fixed module-relative read path; not supplied by HTTP/CLI | P3: retain fixed URLs and read-only behavior; exact-statement justification; never broaden file access |
| F58 | [e2e/roles.e2e.ts](../../frontend/e2e/roles.e2e.ts) :43:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F59 | [e2e/roles.e2e.ts](../../frontend/e2e/roles.e2e.ts) :44:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F60 | [e2e/routing-errors.e2e.ts](../../frontend/e2e/routing-errors.e2e.ts) :32:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F61 | [e2e/routing-errors.e2e.ts](../../frontend/e2e/routing-errors.e2e.ts) :33:25 | security/detect-unsafe-regex | QA locator hotspot: controlled local DOM; not an application input sink | P3: verify required-marker/whitespace matching; exact-expression justification or equivalent tested helper |
| F62 | [e2e/support/mongo-user-metadata.mjs](../../frontend/e2e/support/mongo-user-metadata.mjs) :80:61 | security/detect-object-injection | Own-property numeric read from validated metadata key allowlist | P3: retain own-key/type/count validation; exact-statement justification |
| F63 | [e2e/support/mongo-user-metadata.mjs](../../frontend/e2e/support/mongo-user-metadata.mjs) :80:77 | security/detect-object-injection | Own-property numeric read from validated metadata key allowlist | P3: retain own-key/type/count validation; exact-statement justification |
| F64 | [e2e/support/safe-reporter.ts](../../frontend/e2e/support/safe-reporter.ts) :7:26 | security/detect-unsafe-regex | Likely false positive: bounded sanitized reporter id parser | P3: retain no-leak tests, add long-title rejection case, then exact-expression justification |
| F65 | [src/pages/ProductFormPage.tsx](../../frontend/src/pages/ProductFormPage.tsx) :151:8 | security/detect-unsafe-regex | Likely false positive: anchored, bounded price grammar | P3: boundary/adversarial-input test, then exact-expression justification; no price-rule relaxation |

## Current approval request

P1–P4 implementation and the approved CSRF correction are complete. Latest full
backend build PASSED: 249 tests, zero failures/errors/skips, line coverage 83.48%
and branch coverage 74.06%. Last raw gates remain FAILED: Java=25 and frontend=61.

The separately approved proposal-only review is now complete in
[the final exact-scope dispositions](h1-final-dispositions.md): 22 exact Java
class/member/pattern entries cover 25 reports, and 61 distinct frontend
file/rule/span entries cover 55 statement anchors. All original surviving IDs
are preserved, with 26 current source fingerprints for provenance. Across the
86 remaining reports, dispositions are FALSE POSITIVE=33 and DESIGN CHOICE=53.
This is not a raw scanner pass or proof of absence of other defects.

No exclusion, manifest, profile, reviewed wrapper, inline directive, fixture,
dependency or production/test source change was applied by the proposal review.
Native Java matches remain unverified because clean verify removed that report;
fresh raw reconciliation is a prerequisite, not silently performed here.

The approved supporting stage is now implemented and verified in
[the supporting verification note](h1-supporting-verification.md): 217 focused
backend cases (including 16 new mock-only seeder cases), 173 frontend cases
(including 122 new controls/guard/canonicalizer cases), normal lint/typechecks/
build, eight Java detector-pattern controls and five XML-verifier groups pass.
The isolated raw fixture scan remains intentionally exit 1 for ten findings;
this is not a raw application gate pass. No fixture code/live runner executes.

Exclusions remain disabled. No fresh raw application inventory was run: last
completed counts remain Java=25/frontend=61, not current-revision counts. G4's
extracted canonicalizer invalidates its old proposal provenance; new supporting
files may add findings. No proposed hashes/counts were automatically refreshed.
The pure guard cannot establish caller-supplied provenance/completeness or valid
test evidence; native trusted adapters and acceptance wiring remain unimplemented.

Recommend separate approval for fresh unfiltered application inventories and
exact scope reconciliation next. Existing raw commands stay unchanged; any
XML/manifest/opt-in reviewed gate activation requires a second explicit approval.
Full backend clean verify remains user-owned (expected 265 tests, not verified
here). Live/runtime checks, services/restarts, H2 and Git operations remain
separately gated. No restart was performed or needed for the supporting stage.
