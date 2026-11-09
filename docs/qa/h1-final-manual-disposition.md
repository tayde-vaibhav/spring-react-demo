# H1 — Final manual disposition decision packet

Date: 2026-11-07. **MANUAL DISPOSITIONS ACCEPTED BY USER — RAW GATES REMAIN FAILED.**
Approved scope: documentation-only final review and recording the user's acceptance.
No code/tooling/exclusion/manifest change, scan, test, build or service operation.

## Recorded user decision

On 2026-11-07 the user replied "yes" to: "Approve recording these specific
dispositions as manual QA acceptance, while keeping raw failures visible and
exclusions disabled? (yes / skip / stop)" The decision accepts only the 114
specific reports, classifications, trust boundaries and saved-evidence snapshot
identified below. It does not accept new findings or future source drift.

This authorizes this documentation record only. No scanner threshold, exclusion,
suppression, manifest, automated gate or checklist acceptance criterion changes.
H1 under its current raw-gate criterion remains FAILED; current full backend
verification remains pending/user-owned. H2 requires separate approval.

## Accepted scope and original review rationale

Recommend accepting the following **specific current residual reports for manual
QA review**, with their stated trust boundaries and evidence, and continuing to
H2 only after separate permission. Do not add further speculative runtime fixes
or gate scaffolding solely to make heuristic counts zero.

Manual review/acceptance is NOT an automated exclusion or a claim of clean
scanners. The accepted decision retains the raw gates as FAILED; do not relabel
their exit 1 results PASSED. H1 remains FAILED under the
current raw-gate criterion unless the user explicitly changes the checklist
acceptance criterion. This packet alone does not change that criterion or H1's
status. No executable reviewed policy is activated by approving this document.

| Current inventory | Reports | REAL remaining in these reports | FALSE POSITIVE | DESIGN CHOICE |
| --- | ---: | ---: | ---: | ---: |
| Java | 25 | 0 | 4 | 21 |
| Frontend / QA tooling | 89 | 0 | 32 | 57 |
| **Total** | **114** | **0** | **36** | **78** |

Zero confirmed REAL reports is a narrowly scoped review conclusion, **not proof
that the application, dependencies, tooling or deployment have no vulnerabilities**.
Design choices retain their documented residual risks and are not automatically
false positives. The separately found G01 resource-budget defect is resolved;
G02 defense-in-depth hardening is implemented. Earlier functional CSRF/logging/
collection/locale/constructor fixes and regressions are not waived or suppressed.

## Evidence checked in this documentation-only step

- Read project/security/QA instructions, the existing exact-scope proposal,
  warning review, latest collector implementation/tests and saved scan reports.
- Reparsed the saved Java XML with the previously tested adapter, against the
  38 current compiled class identities. Ready/healthy, zero issues, 25 retained
  findings; all 22 prior exact identities/counts match, no unmatched/ambiguous
  scope. This is saved-report consistency, not new scanning or provenance proof.
- Read the latest frontend raw JSON: 49 files, 89 warnings, zero errors/fatal
  errors. All 22 warning-bearing current source files exactly match their source
  text retained in that report. All 27 original proposal source hashes still
  match. No live runner or environment secret was read/executed.
- Reconciled every current report to a specific row below: 25 unique J IDs and
  89 unique F/T IDs. The original 61 F reports remain; current tooling reports=28.
  Historical T07 (full-directory API warning) is absent after the substantive
  incremental-enumeration fix. T25–T29 identify the five new temporary-fixture
  calls. These are **audit IDs**, not accepted baseline/manifest expansion.
- Recorded raw report hashes below. No policy or stored acceptance fingerprint
  was regenerated, and no existing raw gate or suppression changed.

Raw evidence:

- [Native Java XML](../../backend/springreactdemo/target/spotbugsXml.xml), SHA-256
  `d42c74577dc41631e15155aa12d6346d12f1c6811365af86009f00cabaa494b4`.
- [Frontend raw JSON](h1-collector-hardening-security-20261107.json), SHA-256
  `4e03e75489089dc6142fbd6ad2bcd3d83d6094b21f3985b035cfed36d927062d`.

## Grouped rationale and recommended dispositions

| Pattern / scope | Count | Disposition recommendation | Preserve / limitation |
| --- | ---: | --- | --- |
| Java EI_EXPOSE_REP2 | 4 | FALSE POSITIVE | Intentional constructor-injected collaborator sharing, exact four fields; not an exception for mutable entities/DTOs |
| Java SPRING_ENDPOINT | 11 | DESIGN CHOICE | Endpoint discovery hotspot; keep tested authorization/default-deny, validation and CSRF behavior |
| Java COOKIE_USAGE | 4 | DESIGN CHOICE | Intentional JWT/CSRF cookies; preserve flags, lifetime, duplicate/blank rejection and stale-cookie recovery; copied JWT revocation limitations remain |
| Java PREDICTABLE_RANDOM | 2 | DESIGN CHOICE | Reproducible dev-only product fixtures, not tokens/passwords/keys; preserve profile/nonempty/batch/determinism checks |
| Java SERVLET_PARAMETER | 1 | DESIGN CHOICE | Untrusted parameter names are checked, and values remain typed/bounded/allowlisted |
| Java SERVLET_HEADER | 1 | DESIGN CHOICE | CSRF header is deliberately read as untrusted validation input, not an identity claim |
| Java broad checked exception declaration | 2 | DESIGN CHOICE | Supported Spring security builder contract; keep fail-fast construction and exact error response contracts |
| Frontend unsafe regex | 32 | FALSE POSITIVE within reviewed context | 29 controlled DOM label patterns, bounded reporter and price grammars, plus bounded package version grammar; no blanket arbitrary-input regex safety claim |
| Frontend object injection | 34 | DESIGN CHOICE | 26 prior bounded-array/allowlist/own-key reads plus eight constant schema/parser/test-counter operations; no caller-selected Mongo operators/mass assignment |
| Frontend filesystem filename | 22 | DESIGN CHOICE | Three fixed-path G4 reads plus six checked collector reads and 13 generated temporary-fixture operations; keep root/symlink/byte/traversal limits and temp cleanup |
| Frontend dynamic regex | 1 | DESIGN CHOICE | Literal label input escaped before regex construction; preserve exact matching behavior/tests |

Frontend short rationale IDs R1–R3/D1–D7 reference the unchanged conditions in
[the original proposal](h1-final-dispositions.md). New tooling rationale IDs:

- VERSION-BOUND: current grammar remains unchanged and is evaluated only after
  the explicit 1–128-character check; normal/prerelease/malformed/boundary/long
  cases exist. The heuristic warning remains; no performance benchmark is claimed.
- FIXED-SCOPE-FS: trusted local canonical root and explicit source/config paths;
  every component checked, no hidden configuration read, read-only O_NOFOLLOW,
  exact bytes/hashes, fixed file/byte/depth/entry caps. This is not a defense
  against all hostile concurrent filesystem mutation or arbitrary caller roots.
- TEMP-FIXTURE: paths are constructed only inside mkdtemp-created test roots;
  data is synthetic and cleanup is scoped to registered generated directories.
  The tests do not open real credential files or operate on live application data.
- VALIDATED-JSON/AST: raw JSON cloned after proxy/accessor/cycle/custom-prototype
  rejection; own-key schemas and constant key lists, or trusted installed parser
  visitor keys. Arbitrary report JSON is not consumed as an AST, and source text
  is parsed rather than evaluated.
- FIXED-COUNTER-TEST: synthetic count tampering uses five literal field names and
  retains every rejection assertion; not a production arbitrary-property write.

## Exact Java report membership (25)

Each row is one native finding. Complete erased signatures and paired expected
counts remain in the [22-scope proposal](h1-final-dispositions.md). Metadata
membership was checked, not applied with a native exclusion filter.

| ID | Pattern | Current file/line | Member / field | Classification |
| --- | --- | --- | --- | --- |
| J08 | `EI_EXPOSE_REP2` | [ProductController.java:42](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L42) | `<init>`; field `productService` | FALSE POSITIVE |
| J16 | `EI_EXPOSE_REP2` | [ProductSeeder.java:56](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java#L56) | `<init>`; field `mongoTemplate` | FALSE POSITIVE |
| J19 | `EI_EXPOSE_REP2` | [ProductService.java:41](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductService.java#L41) | `<init>`; field `mongoTemplate` | FALSE POSITIVE |
| J39 | `EI_EXPOSE_REP2` | [AuthService.java:36](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java#L36) | `<init>`; field `rateLimiter` | FALSE POSITIVE |
| J01 | `SPRING_ENDPOINT` | [AppTestController.java:17](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/AppTestController.java#L17) | `appTest` | DESIGN CHOICE |
| J10 | `SPRING_ENDPOINT` | [ProductController.java:47](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L47) | `create` | DESIGN CHOICE |
| J11 | `SPRING_ENDPOINT` | [ProductController.java:67](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L67) | `delete` | DESIGN CHOICE |
| J12 | `SPRING_ENDPOINT` | [ProductController.java:57](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L57) | `getById` | DESIGN CHOICE |
| J13 | `SPRING_ENDPOINT` | [ProductController.java:85](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L85) | `getStats` | DESIGN CHOICE |
| J14 | `SPRING_ENDPOINT` | [ProductController.java:79](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L79) | `search` | DESIGN CHOICE |
| J15 | `SPRING_ENDPOINT` | [ProductController.java:62](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L62) | `update` | DESIGN CHOICE |
| J34 | `SPRING_ENDPOINT` | [AuthController.java:39](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L39) | `csrf` | DESIGN CHOICE |
| J35 | `SPRING_ENDPOINT` | [AuthController.java:45](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L45) | `login` | DESIGN CHOICE |
| J36 | `SPRING_ENDPOINT` | [AuthController.java:60](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L60) | `logout` | DESIGN CHOICE |
| J37 | `SPRING_ENDPOINT` | [AuthController.java:72](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L72) | `me` | DESIGN CHOICE |
| J42 | `COOKIE_USAGE` | [CookieBearerTokenResolver.java:24](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieBearerTokenResolver.java#L24) | `resolve` | DESIGN CHOICE |
| J43 | `COOKIE_USAGE` | [CookieBearerTokenResolver.java:28](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieBearerTokenResolver.java#L28) | `resolve` | DESIGN CHOICE |
| J44 | `COOKIE_USAGE` | [CookieCsrfHeaderFilter.java:60](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java#L60) | `csrfCookieValue` | DESIGN CHOICE |
| J45 | `COOKIE_USAGE` | [CookieCsrfHeaderFilter.java:64](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java#L64) | `csrfCookieValue` | DESIGN CHOICE |
| J17 | `PREDICTABLE_RANDOM` | [ProductSeeder.java:71](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java#L71) | `run` | DESIGN CHOICE |
| J18 | `PREDICTABLE_RANDOM` | [ProductSeeder.java:72](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java#L72) | `run` | DESIGN CHOICE |
| J09 | `SERVLET_PARAMETER` | [ProductController.java:79](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L79) | `search` | DESIGN CHOICE |
| J46 | `SERVLET_HEADER` | [CookieCsrfHeaderFilter.java:39](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java#L39) | `doFilterInternal` | DESIGN CHOICE |
| J49 | `THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION` | [SecurityConfiguration.java:60](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java#L60) | `devApiDocumentationSecurityFilterChain` | DESIGN CHOICE |
| J50 | `THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION` | [SecurityConfiguration.java:136](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java#L136) | `securityFilterChain` | DESIGN CHOICE |

## Exact frontend report membership (89)

One-based columns, exclusive endpoints. Current reports are single-line. Each
row has expected audit membership one. Exact current source/coordinates are
shown for review only, not installed policy; changed surrounding trust-boundary
code invalidates these recommendations even if the warning expression is stable.

| ID | Rule | Current file/line | Columns | Classification | Rationale |
| --- | --- | --- | --- | --- | --- |
| F01 | `detect-unsafe-regex` | [accessibility.mjs:135](../../frontend/e2e/accessibility.mjs#L135) | 36–61 | FALSE POSITIVE | R1 |
| F02 | `detect-unsafe-regex` | [accessibility.mjs:136](../../frontend/e2e/accessibility.mjs#L136) | 41–66 | FALSE POSITIVE | R1 |
| F03 | `detect-unsafe-regex` | [accessibility.mjs:222](../../frontend/e2e/accessibility.mjs#L222) | 32–61 | FALSE POSITIVE | R1 |
| F04 | `detect-unsafe-regex` | [accessibility.mjs:225](../../frontend/e2e/accessibility.mjs#L225) | 34–59 | FALSE POSITIVE | R1 |
| F05 | `detect-unsafe-regex` | [accessibility.mjs:226](../../frontend/e2e/accessibility.mjs#L226) | 31–53 | FALSE POSITIVE | R1 |
| F06 | `detect-unsafe-regex` | [accessibility.mjs:227](../../frontend/e2e/accessibility.mjs#L227) | 31–62 | FALSE POSITIVE | R1 |
| F07 | `detect-unsafe-regex` | [auth.e2e.ts:17](../../frontend/e2e/auth.e2e.ts#L17) | 25–50 | FALSE POSITIVE | R1 |
| F08 | `detect-unsafe-regex` | [auth.e2e.ts:18](../../frontend/e2e/auth.e2e.ts#L18) | 25–50 | FALSE POSITIVE | R1 |
| F09 | `detect-unsafe-regex` | [auth.e2e.ts:60](../../frontend/e2e/auth.e2e.ts#L60) | 25–50 | FALSE POSITIVE | R1 |
| F10 | `detect-unsafe-regex` | [browser-security.e2e.ts:66](../../frontend/e2e/browser-security.e2e.ts#L66) | 25–50 | FALSE POSITIVE | R1 |
| F11 | `detect-unsafe-regex` | [browser-security.e2e.ts:67](../../frontend/e2e/browser-security.e2e.ts#L67) | 25–50 | FALSE POSITIVE | R1 |
| F12 | `detect-object-injection` | [concurrency.mjs:30](../../frontend/e2e/concurrency.mjs#L30) | 53–65 | DESIGN CHOICE | D1 |
| F15 | `detect-object-injection` | [concurrency.mjs:186](../../frontend/e2e/concurrency.mjs#L186) | 11–25 | DESIGN CHOICE | D2 |
| F16 | `detect-object-injection` | [concurrency.mjs:187](../../frontend/e2e/concurrency.mjs#L187) | 17–31 | DESIGN CHOICE | D2 |
| F17 | `detect-object-injection` | [concurrency.mjs:187](../../frontend/e2e/concurrency.mjs#L187) | 38–51 | DESIGN CHOICE | D2 |
| F18 | `detect-object-injection` | [concurrency.mjs:188](../../frontend/e2e/concurrency.mjs#L188) | 71–85 | DESIGN CHOICE | D2 |
| F19 | `detect-object-injection` | [concurrency.mjs:190](../../frontend/e2e/concurrency.mjs#L190) | 28–41 | DESIGN CHOICE | D2 |
| F20 | `detect-object-injection` | [concurrency.mjs:190](../../frontend/e2e/concurrency.mjs#L190) | 46–60 | DESIGN CHOICE | D2 |
| F21 | `detect-object-injection` | [concurrency.mjs:191](../../frontend/e2e/concurrency.mjs#L191) | 58–72 | DESIGN CHOICE | D2 |
| F22 | `detect-object-injection` | [concurrency.mjs:192](../../frontend/e2e/concurrency.mjs#L192) | 57–71 | DESIGN CHOICE | D2 |
| F23 | `detect-object-injection` | [concurrency.mjs:223](../../frontend/e2e/concurrency.mjs#L223) | 17–34 | DESIGN CHOICE | D2 |
| F24 | `detect-object-injection` | [concurrency.mjs:223](../../frontend/e2e/concurrency.mjs#L223) | 41–56 | DESIGN CHOICE | D2 |
| F25 | `detect-object-injection` | [concurrency.mjs:226](../../frontend/e2e/concurrency.mjs#L226) | 28–43 | DESIGN CHOICE | D2 |
| F26 | `detect-object-injection` | [concurrency.mjs:229](../../frontend/e2e/concurrency.mjs#L229) | 57–74 | DESIGN CHOICE | D2 |
| F27 | `detect-object-injection` | [concurrency.mjs:231](../../frontend/e2e/concurrency.mjs#L231) | 41–56 | DESIGN CHOICE | D2 |
| F28 | `detect-object-injection` | [concurrency.mjs:241](../../frontend/e2e/concurrency.mjs#L241) | 52–66 | DESIGN CHOICE | D2 |
| F29 | `detect-object-injection` | [concurrency.mjs:242](../../frontend/e2e/concurrency.mjs#L242) | 26–39 | DESIGN CHOICE | D2 |
| F30 | `detect-object-injection` | [concurrency.mjs:242](../../frontend/e2e/concurrency.mjs#L242) | 44–58 | DESIGN CHOICE | D2 |
| F31 | `detect-object-injection` | [concurrency.mjs:243](../../frontend/e2e/concurrency.mjs#L243) | 56–70 | DESIGN CHOICE | D2 |
| F32 | `detect-object-injection` | [concurrency.mjs:244](../../frontend/e2e/concurrency.mjs#L244) | 55–69 | DESIGN CHOICE | D2 |
| F33 | `detect-unsafe-regex` | [dashboard.e2e.ts:62](../../frontend/e2e/dashboard.e2e.ts#L62) | 25–50 | FALSE POSITIVE | R1 |
| F34 | `detect-unsafe-regex` | [dashboard.e2e.ts:63](../../frontend/e2e/dashboard.e2e.ts#L63) | 25–50 | FALSE POSITIVE | R1 |
| F35 | `detect-object-injection` | [dashboard.e2e.ts:93](../../frontend/e2e/dashboard.e2e.ts#L93) | 82–95 | DESIGN CHOICE | D2 |
| F36 | `detect-unsafe-regex` | [delete.e2e.ts:30](../../frontend/e2e/delete.e2e.ts#L30) | 25–50 | FALSE POSITIVE | R1 |
| F37 | `detect-unsafe-regex` | [delete.e2e.ts:31](../../frontend/e2e/delete.e2e.ts#L31) | 25–50 | FALSE POSITIVE | R1 |
| F40 | `detect-object-injection` | [load-smoke.mjs:99](../../frontend/e2e/load-smoke.mjs#L99) | 5–21 | DESIGN CHOICE | D2 |
| F41 | `detect-object-injection` | [mongo-outage.mjs:76](../../frontend/e2e/mongo-outage.mjs#L76) | 18–34 | DESIGN CHOICE | D3 |
| F42 | `detect-object-injection` | [mongo-outage.mjs:76](../../frontend/e2e/mongo-outage.mjs#L76) | 52–68 | DESIGN CHOICE | D3 |
| F44 | `detect-unsafe-regex` | [product-list.e2e.ts:50](../../frontend/e2e/product-list.e2e.ts#L50) | 25–50 | FALSE POSITIVE | R1 |
| F45 | `detect-unsafe-regex` | [product-list.e2e.ts:51](../../frontend/e2e/product-list.e2e.ts#L51) | 25–50 | FALSE POSITIVE | R1 |
| F46 | `detect-unsafe-regex` | [responsive.mjs:112](../../frontend/e2e/responsive.mjs#L112) | 67–92 | FALSE POSITIVE | R1 |
| F47 | `detect-unsafe-regex` | [responsive.mjs:113](../../frontend/e2e/responsive.mjs#L113) | 67–92 | FALSE POSITIVE | R1 |
| F48 | `detect-unsafe-regex` | [responsive.mjs:195](../../frontend/e2e/responsive.mjs#L195) | 34–63 | FALSE POSITIVE | R1 |
| F49 | `detect-unsafe-regex` | [responsive.mjs:196](../../frontend/e2e/responsive.mjs#L196) | 38–63 | FALSE POSITIVE | R1 |
| F50 | `detect-unsafe-regex` | [responsive.mjs:197](../../frontend/e2e/responsive.mjs#L197) | 35–57 | FALSE POSITIVE | R1 |
| F51 | `detect-unsafe-regex` | [responsive.mjs:198](../../frontend/e2e/responsive.mjs#L198) | 35–66 | FALSE POSITIVE | R1 |
| F52 | `detect-unsafe-regex` | [responsive.mjs:240](../../frontend/e2e/responsive.mjs#L240) | 25–50 | FALSE POSITIVE | R1 |
| F53 | `detect-unsafe-regex` | [responsive.mjs:241](../../frontend/e2e/responsive.mjs#L241) | 25–50 | FALSE POSITIVE | R1 |
| F55 | `detect-non-literal-fs-filename` | [restart-idempotence.mjs:68](../../frontend/e2e/restart-idempotence.mjs#L68) | 31–68 | DESIGN CHOICE | D7 |
| F56 | `detect-non-literal-fs-filename` | [restart-idempotence.mjs:78](../../frontend/e2e/restart-idempotence.mjs#L78) | 21–45 | DESIGN CHOICE | D7 |
| F57 | `detect-non-literal-fs-filename` | [restart-idempotence.mjs:79](../../frontend/e2e/restart-idempotence.mjs#L79) | 19–39 | DESIGN CHOICE | D7 |
| F58 | `detect-unsafe-regex` | [roles.e2e.ts:43](../../frontend/e2e/roles.e2e.ts#L43) | 25–50 | FALSE POSITIVE | R1 |
| F59 | `detect-unsafe-regex` | [roles.e2e.ts:44](../../frontend/e2e/roles.e2e.ts#L44) | 25–50 | FALSE POSITIVE | R1 |
| F60 | `detect-unsafe-regex` | [routing-errors.e2e.ts:32](../../frontend/e2e/routing-errors.e2e.ts#L32) | 25–50 | FALSE POSITIVE | R1 |
| F61 | `detect-unsafe-regex` | [routing-errors.e2e.ts:33](../../frontend/e2e/routing-errors.e2e.ts#L33) | 25–50 | FALSE POSITIVE | R1 |
| F54 | `detect-object-injection` | [canonical.mjs:5](../../frontend/e2e/support/canonical.mjs#L5) | 84–94 | DESIGN CHOICE | D4 |
| F43 | `detect-non-literal-regexp` | [form-label.ts:4](../../frontend/e2e/support/form-label.ts#L4) | 10–52 | DESIGN CHOICE | D6 |
| F62 | `detect-object-injection` | [mongo-user-metadata.mjs:80](../../frontend/e2e/support/mongo-user-metadata.mjs#L80) | 61–72 | DESIGN CHOICE | D5 |
| F63 | `detect-object-injection` | [mongo-user-metadata.mjs:80](../../frontend/e2e/support/mongo-user-metadata.mjs#L80) | 77–88 | DESIGN CHOICE | D5 |
| T01 | `detect-non-literal-fs-filename` | [review-inputs.mjs:50](../../frontend/e2e/support/review-inputs.mjs#L50) | 7–25 | DESIGN CHOICE | FIXED-SCOPE-FS |
| T02 | `detect-non-literal-fs-filename` | [review-inputs.mjs:50](../../frontend/e2e/support/review-inputs.mjs#L50) | 39–54 | DESIGN CHOICE | FIXED-SCOPE-FS |
| T03 | `detect-non-literal-fs-filename` | [review-inputs.mjs:68](../../frontend/e2e/support/review-inputs.mjs#L68) | 11–29 | DESIGN CHOICE | FIXED-SCOPE-FS |
| T04 | `detect-non-literal-fs-filename` | [review-inputs.mjs:70](../../frontend/e2e/support/review-inputs.mjs#L70) | 9–29 | DESIGN CHOICE | FIXED-SCOPE-FS |
| T05 | `detect-non-literal-fs-filename` | [review-inputs.mjs:77](../../frontend/e2e/support/review-inputs.mjs#L77) | 24–83 | DESIGN CHOICE | FIXED-SCOPE-FS |
| T06 | `detect-non-literal-fs-filename` | [review-inputs.mjs:109](../../frontend/e2e/support/review-inputs.mjs#L109) | 10–30 | DESIGN CHOICE | FIXED-SCOPE-FS |
| T08 | `detect-unsafe-regex` | [review-inputs.mjs:146](../../frontend/e2e/support/review-inputs.mjs#L146) | 11–49 | FALSE POSITIVE | VERSION-BOUND |
| T09 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:12](../../frontend/e2e/support/review-inputs.test.mjs#L12) | 3–60 | DESIGN CHOICE | TEMP-FIXTURE |
| T10 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:13](../../frontend/e2e/support/review-inputs.test.mjs#L13) | 3–40 | DESIGN CHOICE | TEMP-FIXTURE |
| T11 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:42](../../frontend/e2e/support/review-inputs.test.mjs#L42) | 78–108 | DESIGN CHOICE | TEMP-FIXTURE |
| T12 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:43](../../frontend/e2e/support/review-inputs.test.mjs#L43) | 41–71 | DESIGN CHOICE | TEMP-FIXTURE |
| T13 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:67](../../frontend/e2e/support/review-inputs.test.mjs#L67) | 7–64 | DESIGN CHOICE | TEMP-FIXTURE |
| T14 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:68](../../frontend/e2e/support/review-inputs.test.mjs#L68) | 7–75 | DESIGN CHOICE | TEMP-FIXTURE |
| T15 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:78](../../frontend/e2e/support/review-inputs.test.mjs#L78) | 5–113 | DESIGN CHOICE | TEMP-FIXTURE |
| T16 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:104](../../frontend/e2e/support/review-inputs.test.mjs#L104) | 5–46 | DESIGN CHOICE | TEMP-FIXTURE |
| T25 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:112](../../frontend/e2e/support/review-inputs.test.mjs#L112) | 5–56 | DESIGN CHOICE | TEMP-FIXTURE |
| T26 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:114](../../frontend/e2e/support/review-inputs.test.mjs#L114) | 5–47 | DESIGN CHOICE | TEMP-FIXTURE |
| T27 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:127](../../frontend/e2e/support/review-inputs.test.mjs#L127) | 7–62 | DESIGN CHOICE | TEMP-FIXTURE |
| T28 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:130](../../frontend/e2e/support/review-inputs.test.mjs#L130) | 7–76 | DESIGN CHOICE | TEMP-FIXTURE |
| T29 | `detect-non-literal-fs-filename` | [review-inputs.test.mjs:139](../../frontend/e2e/support/review-inputs.test.mjs#L139) | 7–68 | DESIGN CHOICE | TEMP-FIXTURE |
| T17 | `detect-object-injection` | [review-native-frontend.mjs:122](../../frontend/e2e/support/review-native-frontend.mjs#L122) | 49–59 | DESIGN CHOICE | VALIDATED-JSON/AST |
| T18 | `detect-object-injection` | [review-native-frontend.mjs:122](../../frontend/e2e/support/review-native-frontend.mjs#L122) | 77–87 | DESIGN CHOICE | VALIDATED-JSON/AST |
| T19 | `detect-object-injection` | [review-native-frontend.mjs:127](../../frontend/e2e/support/review-native-frontend.mjs#L127) | 49–59 | DESIGN CHOICE | VALIDATED-JSON/AST |
| T20 | `detect-object-injection` | [review-native-frontend.mjs:127](../../frontend/e2e/support/review-native-frontend.mjs#L127) | 80–90 | DESIGN CHOICE | VALIDATED-JSON/AST |
| T21 | `detect-object-injection` | [review-native-frontend.mjs:159](../../frontend/e2e/support/review-native-frontend.mjs#L159) | 26–36 | DESIGN CHOICE | VALIDATED-JSON/AST |
| T22 | `detect-object-injection` | [review-native-frontend.mjs:164](../../frontend/e2e/support/review-native-frontend.mjs#L164) | 56–66 | DESIGN CHOICE | VALIDATED-JSON/AST |
| T23 | `detect-object-injection` | [review-native-frontend.mjs:235](../../frontend/e2e/support/review-native-frontend.mjs#L235) | 21–30 | DESIGN CHOICE | VALIDATED-JSON/AST |
| T24 | `detect-object-injection` | [review-native-frontend.test.mjs:266](../../frontend/e2e/support/review-native-frontend.test.mjs#L266) | 5–28 | DESIGN CHOICE | FIXED-COUNTER-TEST |
| F64 | `detect-unsafe-regex` | [safe-reporter.ts:7](../../frontend/e2e/support/safe-reporter.ts#L7) | 26–66 | FALSE POSITIVE | R2 |
| F65 | `detect-unsafe-regex` | [productPrice.ts:3](../../frontend/src/validation/productPrice.ts#L3) | 10–34 | FALSE POSITIVE | R3 |

## Resolved work and verification evidence (historical, not rerun here)

- Backend actual fixes: collection snapshots, sanitized bounded log values,
  Locale.ROOT use and constructor safety; the independent empty-CSRF-pair defect
  fixed with direct/full-chain regressions. Exact ProblemDetail contracts remain.
- Java XML reporting: simultaneous HTML disabled; 38/38 class identities now
  present with zero analyzer errors/missing classes. Findings remain visible.
- Collector G01: depth 64/65 and global 10,000/10,001 entry boundaries, incremental
  enumeration, handle cleanup on success/budget/read failures, deterministic
  ordering. G02: all four package version 128/129 boundaries and malformed/long
  rejection, unchanged accepted grammar. No source/credential scope broadened.
- Latest frontend verification: 38 focused collector cases and 234 full unit
  cases, normal lint/typechecks/build pass; unchanged bundle and existing chunk
  warning, no source maps. All 15 original collector test bodies preserved.
- Supporting backend verification: 217 focused cases, including 16 mock-only
  seeder cases. Last locally corroborated full successful build had 249 cases.
  Expected full count after those new seeder tests is 265; a current successful
  full clean verify/coverage report is still pending/user-owned. Recorded full
  verify setup failures must not be relabeled passes by this static review.
- Earlier isolated analyzer controls and Python parser tests passed; they prove
  their tested input contracts, not universal analyzer effectiveness or current
  test execution. None was executed again for this packet.

## Unresolved automated-gate prerequisites — not residual application vulnerabilities

These remain explicit limitations if a future automated reviewed pass is wanted;
manual disposition does not waive or claim completion of them:

1. Trusted fresh invocation/provenance binding, complete before/after source,
   compiled-bytecode, analyzer/parser/config/runtime input inventories and valid
   current test-evidence verification. Pure supplied-data consistency is not
   independently authenticated provenance or a reproducible CI chain.
2. Java native-to-repository source/member/AST binding and actual native filter
   membership/overlap/mutation validation before enabling any exclusion. No
   production filter file or executable accepted-finding manifest exists.
3. The strict frontend adapter still blocks the pre-existing non-security
   react-refresh/only-export-components directive in AuthContext.tsx. It was
   neither added nor accepted for automated gating here; no security diagnostics
   are suppressed. Resolve/narrowly decide that separately before gate activation.
4. Approved exact review policy and activation, including current source/control
   hashes, source-drift/unused/duplicate/overlap failures, unfiltered raw retention
   and mandatory re-review of any new reports. No automatic count-only baseline.
5. User-owned current full backend verification where required, with dedicated
   test database configuration, never a development URI fallback.

Do not build more automation simply to change a status label. These are a
separate future implementation/CI scope, not permission contained in this
manual-review packet.

## Status and the user's choice

Current truthful scoreboard entries:

| Measure | Status |
| --- | --- |
| Actual remediation / targeted verification | PASSED for the documented completed scope |
| Final residual-finding documentation review | PASSED |
| Raw Java / frontend strict gates | FAILED / FAILED (25 / 89 findings) |
| Automated reviewed gate | Not implemented/activated; no pass claimed |
| Manual acceptance of these dispositions | ACCEPTED by user on 2026-11-07; documentation only |
| H1 under its current raw-gate criterion | FAILED |
| H2/H3 in this workflow | Not started |

The user approved recording a **manual review disposition** for these 114
specific reports, keeping raw failures visible and all exclusions/reviewed gates
disabled. This approval authorizes only a QA decision record, not code changes,
automatic suppressions, a green raw gate, acceptance of future source changes or
H2 execution. Ask separately before H2; outline its localhost target/artifact/
network/image-pull requirements and respect service ownership.

If the user requires a green automated H1 gate instead, the unresolved prerequisites
above need their own bounded implementation approval. Do not call this packet an
implemented reviewed gate or silently reinterpret the user's QA criterion.

## Documentation and safety

Only this QA packet and the pre-approved QA summary were written. No source,
test, POM, README/SECURITY, manifest, filter, command wiring, existing assertion,
Git configuration or service changed. Previous tracked/untracked work preserved.
No .env/credential/token/cookie/runtime-log content, network/registry/download,
package installation, live runner, application/database request, restart, Git
mutation, test/build/scanner execution or H2/H3 action. Evidence parsing was
read-only, never fixture/application execution. QA files remain ignored; no
force-add/staging/commit is performed. No backend restart required.
