# H1 — Final exact-scope disposition proposal and verification plan

Date: 2026-11-07. **PROPOSAL ONLY — NO EXCLUSIONS APPLIED.**
The original approval covered inspection and QA documentation only. Subsequent
approvals covered supporting tests/controls, fresh raw scans, and now preparation
of inactive reviewed-gate adapters plus the four-entry documentation refresh.
Exclusion/manifest/gate activation, downloads, services and Git actions remain
outside that approval.

Reporting-correction snapshot, before collector hardening:
[XML-only rescan](h1-xmlonly-rescan-20261107.md) verifies all 38 compiled Java
class identities in the XML; the earlier zero-class metadata defect is resolved.
Java still has the same 25 findings. Frontend now has 85 warnings: all 61
candidate rows below remain present, plus 24 new tooling/test diagnostics that
are NOT added to this proposal or accepted. Counts/fingerprints below describe
the original reviewed candidates only; no automatic policy expansion occurred.

Latest status: approved [collector hardening](h1-collector-hardening.md) resolves
G01/G02 with 38 focused cases and 234 frontend cases passing. The fresh raw
frontend total is 89 (not 85): original 61 candidates plus 28 remaining tooling/
test diagnostics. No new diagnostics were added to the candidate rows below.
Java remains at the previous 25 findings; no new Java scan was needed for the
collector-only change. Raw gates and activation prerequisites remain separate.

## Decision summary

Recommend preserving both existing raw scanner commands unchanged, then adding
separate, opt-in **reviewed** gates only after explicit implementation/activation
approval. A reviewed pass means that every finding is either newly actionable
and rejected, or exactly matched to an approved, unchanged disposition. It does
not mean the raw scanners report zero findings or the app has no vulnerabilities.

| Candidate inventory | Candidate reports | FALSE POSITIVE | DESIGN CHOICE | Proposed exact scopes |
| --- | ---: | ---: | ---: | --- |
| Java, fresh approved scan | 25 | 4 | 21 | 22 exact class/member/pattern matches, four also require exact field |
| Frontend, fresh approved scan | 61 | 31 | 30 | 61 rule + file + diagnostic-span entries across 55 statement anchors |
| **Total** | **86** | **33** | **53** | No package/file-wide rule exclusions |

The Java constructor/collection/locale/log findings were fixed, not accepted.
The separately discovered empty-CSRF-pair defect was fixed and regression-tested,
not suppressed. The user's full build passed 249 tests, zero failures/errors/
skips; coverage is 83.48% lines and 74.06% branches. Source-review classifications
here concern these 86 reports only and are not general security guarantees.

The original proposal did not run analyzers. The separately approved
[fresh reconciliation](h1-raw-reconciliation-20261107.md) now confirms all 25 Java
identities/counts against these 22 scopes and 61 frontend diagnostics, including
the four explicitly refreshed relocations below. No XML filter was installed or
tested by the native filter engine. That first run's Java summary class coverage
was incomplete (total_classes=0); the later XML-only correction above verifies
38/38 identities. A trusted adapter still blocks missing/zero coverage rather
than inventing completeness.
Any later changed/new report still requires review, never automatic inclusion.

## Recommended mechanism and files — not created

### Java

- Keep the existing `static-analysis` profile raw/unfiltered.
- If approved later, add an opt-in `reviewed-findings` profile and module-local
  `spotbugs-exclude.xml` containing only the draft matches below.
- Gate it with a checked-in, reviewed source-fingerprint/match-count manifest.
  It must fail before accepting a filtered result if hashes, diagnostic identity
  multisets, expected per-entry counts, required test evidence or analysis health
  differ. Full-file source hashes are deliberately conservative: any change to
  a class with accepted members requires renewed review, even in another member.
- Keep Max effort, Low threshold, strict check failures and production-only
  analysis. Do not lower confidence, ignore analysis errors or enable blanket
  SECURITY/category/package exclusions. Do not introduce no-op finalizers or
  relax constructor validation.
- A checked filtered report alone is insufficient. Always retain raw inventory
  and an explicit accepted-vs-unreviewed reconciliation. Unknown findings fail.

### Frontend

Recommend a new opt-in `lint:security:reviewed` command using the installed
ESLint API plus an exact-match manifest. **Keep `lint:security` and its
`--max-warnings 0` behavior unchanged.** Do not add inline disable comments,
turn rules off for files, ignore QA folders or filter by rule name alone.

Each accepted diagnostic needs: original F ID, exact repo-relative path, full
rule ID, start/end line and column, current source snippet/digest, full-file
SHA-256, rationale, evidence reference and expected count of one. Two warnings
on one statement remain two entries, not one broad suppression. The reviewed
runner must reject all unmatched errors/warnings, parse failures, stale/unused
entries, altered source hashes or different counts. Capture the current
expression from source at the registered span when implementing; do not infer
AST identity from line number alone. Reconcile the enclosing statement and
file hash as well, because editing surrounding trust-boundary code matters.

The 55 statement anchors are **not** 55 line-wide suppressions. Exact spans and
file fingerprints prevent newly added expressions on an accepted line from
silently inheriting approval. Proposed filtering is still an effective exclusion
and requires separate approval; calling it a reviewed gate does not bypass
that requirement. Any future scanner warnings in the new review tooling itself
need fixes/review; never auto-expand this manifest.

### Shared guardrails

- Pin/check analyzer/parser/config inputs and manifest schema, not only counts.
  Record their reviewed versions and hashes after approved tooling edits.
- Any changed source or configuration triggers review; no automatic baseline
  regeneration. Fingerprints enforce drift checks, not protection against a
  trusted contributor deliberately editing both code and approval data.
- Scope matching must be one-to-one with the unfiltered inventory. Zero matches,
  duplicate entries, overlapping Java matches, missing fields or excess matches
  are failures. The Java RNG/cookie scopes explicitly allow two known reports.
- Never use shell `|| true` to treat analyzer failure as success. Distinguish a
  healthy raw scan reporting known findings from timeout, parse, classpath or
  tool failure. Preserve raw exit status in the audit summary.
- If approved, track reusable manifests, fixtures and tooling under source
  control; do not rely on ignored QA reports for CI enforcement. These reports
  remain supplemental audit documentation, not an automatically loaded baseline.
- No credentials, JWT/cookie values, runtime bodies, logs or database contents
  belong in fingerprints/manifests/fixtures. Use synthetic in-memory markers
  only. Do not read environment secrets or execute the existing live runners.

## Java inventory and exact match proposal

The following scopes are source-verified candidates. Exact native diagnostic
identity/multiplicity was compared in the fresh reconciliation; filter-engine
matching and acceptance-gate completeness remain unverified. Full erased
parameter and return types are in the XML.

| Original IDs | Pattern | Exact member / optional field | Expected reports | Classification |
| --- | --- | --- | ---: | --- |
| J08 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.product.ProductController.<init>`; field `productService` | 1 | FALSE POSITIVE |
| J16 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.product.ProductSeeder.<init>`; field `mongoTemplate` | 1 | FALSE POSITIVE |
| J19 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.product.ProductService.<init>`; field `mongoTemplate` | 1 | FALSE POSITIVE |
| J39 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.security.AuthService.<init>`; field `rateLimiter` | 1 | FALSE POSITIVE |
| J01 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.AppTestController.appTest` | 1 | DESIGN CHOICE |
| J10 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.create` | 1 | DESIGN CHOICE |
| J11 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.delete` | 1 | DESIGN CHOICE |
| J12 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.getById` | 1 | DESIGN CHOICE |
| J13 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.getStats` | 1 | DESIGN CHOICE |
| J14 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.search` | 1 | DESIGN CHOICE |
| J15 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.update` | 1 | DESIGN CHOICE |
| J34 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.csrf` | 1 | DESIGN CHOICE |
| J35 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.login` | 1 | DESIGN CHOICE |
| J36 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.logout` | 1 | DESIGN CHOICE |
| J37 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.me` | 1 | DESIGN CHOICE |
| J42/J43 | `COOKIE_USAGE` | `com.vaibhav.springreactdemo.security.CookieBearerTokenResolver.resolve` | 2 | DESIGN CHOICE |
| J44/J45 | `COOKIE_USAGE` | `com.vaibhav.springreactdemo.security.CookieCsrfHeaderFilter.csrfCookieValue` | 2 | DESIGN CHOICE |
| J17/J18 | `PREDICTABLE_RANDOM` | `com.vaibhav.springreactdemo.product.ProductSeeder.run` | 2 | DESIGN CHOICE |
| J09 | `SERVLET_PARAMETER` | `com.vaibhav.springreactdemo.product.ProductController.search` | 1 | DESIGN CHOICE |
| J46 | `SERVLET_HEADER` | `com.vaibhav.springreactdemo.security.CookieCsrfHeaderFilter.doFilterInternal` | 1 | DESIGN CHOICE |
| J49 | `THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION` | `com.vaibhav.springreactdemo.security.SecurityConfiguration.devApiDocumentationSecurityFilterChain` | 1 | DESIGN CHOICE |
| J50 | `THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION` | `com.vaibhav.springreactdemo.security.SecurityConfiguration.securityFilterChain` | 1 | DESIGN CHOICE |

Evidence: [the current P4 handoff](h1-batch4-implementation.md), including all
249 full-suite cases and the 201-case focused run; [P2 rationale](h1-batch2-findings.md).
The access matrix covers anonymous/USER/ADMIN/roleless requests, default-deny
legacy/unknown/Actuator/docs routes and authenticated stats. Exact cookie/JWT/
CSRF behavior is exercised directly and through the real chain. Existing
full-suite tests cover real login behavior with isolated mocks/test fixtures.
Do not substitute matrix invalid-login reachability for successful-login tests.

Two deterministic-RNG findings remain conditional candidates. Sixteen isolated
seeder cases now cover dev-only profile/default/configurable counts, empty/
nonempty/bounded batches and complete reproducibility; the supporting focused
backend run passed 217 tests. See [supporting evidence](h1-supporting-verification.md).
This mock evidence does not establish actual database auditing or authorization.
Keep entries disabled until remaining gate prerequisites and activation approval.

### Draft XML — documentation only

No file is installed or referenced by Maven. All class/member names are exact;
there are no regex class selectors or package matches. Method scopes necessarily
cover future code within that same method: the separate source-hash guard is
required, not optional, to prevent silent reuse after such a change.

```xml
<FindBugsFilter>
  <!-- J08 (1 expected): DI: intentional shared Spring collaborator; no externally exposed DTO state. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="&lt;init&gt;" params="com.vaibhav.springreactdemo.product.ProductService" returns="void"/>
    <Field name="productService"/>
  </Match>
  <!-- J16 (1 expected): DI: shared template in dev-only fixture seeder. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductSeeder"/>
    <Method name="&lt;init&gt;" params="com.vaibhav.springreactdemo.product.ProductRepository,org.springframework.data.mongodb.core.MongoTemplate,int" returns="void"/>
    <Field name="mongoTemplate"/>
  </Match>
  <!-- J19 (1 expected): DI: shared Spring persistence collaborator, not caller-owned collection. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductService"/>
    <Method name="&lt;init&gt;" params="com.vaibhav.springreactdemo.product.ProductRepository,org.springframework.data.mongodb.core.MongoTemplate,com.vaibhav.springreactdemo.product.ProductMapper" returns="void"/>
    <Field name="mongoTemplate"/>
  </Match>
  <!-- J39 (1 expected): DI: retain shared process-local limiter identity; constructor injection unchanged. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.security.AuthService"/>
    <Method name="&lt;init&gt;" params="org.springframework.security.authentication.AuthenticationManager,org.springframework.security.oauth2.jwt.JwtEncoder,com.vaibhav.springreactdemo.security.LoginRateLimiter,long" returns="void"/>
    <Field name="rateLimiter"/>
  </Match>
  <!-- J01 (1 expected): Endpoint discovery only; legacy route remains default-denied for every authenticated role and anonymous. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.AppTestController"/>
    <Method name="appTest" params="" returns="java.lang.String"/>
  </Match>
  <!-- J10 (1 expected): ADMIN write plus validation/CSRF. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="create" params="com.vaibhav.springreactdemo.product.dto.ProductRequest" returns="org.springframework.http.ResponseEntity"/>
  </Match>
  <!-- J11 (1 expected): ADMIN delete plus CSRF. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="delete" params="java.lang.String" returns="org.springframework.http.ResponseEntity"/>
  </Match>
  <!-- J12 (1 expected): USER/ADMIN read. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="getById" params="java.lang.String" returns="com.vaibhav.springreactdemo.product.dto.ProductResponse"/>
  </Match>
  <!-- J13 (1 expected): Authentication-only stats, including roleless JWT, as current matcher order requires. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="getStats" params="" returns="java.util.List"/>
  </Match>
  <!-- J14 (1 expected): USER/ADMIN read; typed bounded allowlisted search. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="search" params="java.lang.String,java.math.BigDecimal,java.math.BigDecimal,java.lang.String,org.springframework.data.domain.Pageable,jakarta.servlet.http.HttpServletRequest" returns="com.vaibhav.springreactdemo.product.dto.ProductPageResponse"/>
  </Match>
  <!-- J15 (1 expected): ADMIN write with validated version and CSRF. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="update" params="java.lang.String,com.vaibhav.springreactdemo.product.dto.ProductUpdateRequest" returns="com.vaibhav.springreactdemo.product.dto.ProductResponse"/>
  </Match>
  <!-- J34 (1 expected): Public CSRF bootstrap; no access JWT exposed. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.security.AuthController"/>
    <Method name="csrf" params="org.springframework.security.web.csrf.CsrfToken" returns="com.vaibhav.springreactdemo.security.CsrfTokenResponse"/>
  </Match>
  <!-- J35 (1 expected): Public login with DTO validation, CSRF, BCrypt, rate limiting and HttpOnly cookie. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.security.AuthController"/>
    <Method name="login" params="com.vaibhav.springreactdemo.security.LoginRequest,jakarta.servlet.http.HttpServletRequest" returns="org.springframework.http.ResponseEntity"/>
  </Match>
  <!-- J36 (1 expected): Authenticated, CSRF-protected logout clears access cookie; no revocation claim. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.security.AuthController"/>
    <Method name="logout" params="" returns="org.springframework.http.ResponseEntity"/>
  </Match>
  <!-- J37 (1 expected): Authenticated DTO response, roleless JWT supported, no token in JSON. -->
  <Match>
    <Bug pattern="SPRING_ENDPOINT"/>
    <Class name="com.vaibhav.springreactdemo.security.AuthController"/>
    <Method name="me" params="org.springframework.security.oauth2.jwt.Jwt" returns="com.vaibhav.springreactdemo.security.AuthUserResponse"/>
  </Match>
  <!-- J42/J43 (2 expected): Cookie reads required by chosen auth design; duplicate rejection, recovery paths, JWT decoder validation tested. -->
  <Match>
    <Bug pattern="COOKIE_USAGE"/>
    <Class name="com.vaibhav.springreactdemo.security.CookieBearerTokenResolver"/>
    <Method name="resolve" params="jakarta.servlet.http.HttpServletRequest" returns="java.lang.String"/>
  </Match>
  <!-- J44/J45 (2 expected): Cookie read supports double-submit; duplicates/missing/blank rejected, post-fix full-chain regression passes. -->
  <Match>
    <Bug pattern="COOKIE_USAGE"/>
    <Class name="com.vaibhav.springreactdemo.security.CookieCsrfHeaderFilter"/>
    <Method name="csrfCookieValue" params="jakarta.servlet.http.HttpServletRequest" returns="java.lang.String"/>
  </Match>
  <!-- J17/J18 (2 expected): Fixed-seed dev fixture data only; never token/password/key generation. Sixteen isolated seeder cases supply profile/batch/determinism evidence; activation remains separate. -->
  <Match>
    <Bug pattern="PREDICTABLE_RANDOM"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductSeeder"/>
    <Method name="run" params="java.lang.String[]" returns="void"/>
  </Match>
  <!-- J09 (1 expected): Reads names to reject unknown/repeated parameters; typed criteria, sort and pagination bounds remain. -->
  <Match>
    <Bug pattern="SERVLET_PARAMETER"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="search" params="java.lang.String,java.math.BigDecimal,java.math.BigDecimal,java.lang.String,org.springframework.data.domain.Pageable,jakarta.servlet.http.HttpServletRequest" returns="com.vaibhav.springreactdemo.product.dto.ProductPageResponse"/>
  </Match>
  <!-- J46 (1 expected): Header is untrusted validation input; null/blank/duplicate/mismatch denied before service; comparison retained. -->
  <Match>
    <Bug pattern="SERVLET_HEADER"/>
    <Class name="com.vaibhav.springreactdemo.security.CookieCsrfHeaderFilter"/>
    <Method name="doFilterInternal" params="jakarta.servlet.http.HttpServletRequest,jakarta.servlet.http.HttpServletResponse,jakarta.servlet.FilterChain" returns="void"/>
  </Match>
  <!-- J49 (1 expected): Supported checked Spring builder contract on dev-only ordered documentation chain. -->
  <Match>
    <Bug pattern="THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION"/>
    <Class name="com.vaibhav.springreactdemo.security.SecurityConfiguration"/>
    <Method name="devApiDocumentationSecurityFilterChain" params="org.springframework.security.config.annotation.web.builders.HttpSecurity" returns="org.springframework.security.web.SecurityFilterChain"/>
  </Match>
  <!-- J50 (1 expected): Supported checked builder contract; do not replace fail-fast security configuration with partial chain. -->
  <Match>
    <Bug pattern="THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION"/>
    <Class name="com.vaibhav.springreactdemo.security.SecurityConfiguration"/>
    <Method name="securityFilterChain" params="org.springframework.security.config.annotation.web.builders.HttpSecurity,org.springframework.security.web.csrf.CookieCsrfTokenRepository,org.springframework.security.oauth2.server.resource.web.BearerTokenResolver,org.springframework.security.web.AuthenticationEntryPoint,org.springframework.security.web.access.AccessDeniedHandler,org.springframework.core.convert.converter.Converter,org.springframework.web.cors.CorsConfigurationSource" returns="org.springframework.security.web.SecurityFilterChain"/>
  </Match>
</FindBugsFilter>
```

Never add CT_CONSTRUCTOR_THROW, CRLF_INJECTION_LOGS, DM_CONVERT_CASE, broad entity/
DTO EI_EXPOSE_REP/EI_EXPOSE_REP2, or any unlisted finding to this filter. Four
EI_EXPOSE_REP2 entries are limited to injected collaborators and exact fields.

## Frontend rationale groups

Rule codes: UR = security/detect-unsafe-regex; OI =
security/detect-object-injection; DR = security/detect-non-literal-regexp;
FS = security/detect-non-literal-fs-filename. All columns below are one-based;
end column is ESLint's exclusive endpoint. Current spans are single-line.

| Rationale | Reports | Classification | Trust boundary / acceptance conditions |
| --- | ---: | --- | --- |
| R1 | 29 | FALSE POSITIVE for the reported application-input exploit | Static anchored form-label locators over controlled local DOM, not request regex execution. Preserve required-marker/whitespace behavior, timeout and uniqueness assertions. Acceptance does not claim arbitrary long DOM/input immunity. |
| R2 | 1 | FALSE POSITIVE | Bounded reporter-id grammar; existing boundary/long-input/no-raw-title tests pass. Never expose raw title/error text. |
| R3 | 1 | FALSE POSITIVE | Anchored bounded price grammar; valid/precision/line-terminator/adversarial-input tests pass. Keep positivity, 12 whole digits and two decimal places unchanged. |
| D1 | 1 | DESIGN CHOICE | Product writable projection uses the constant eight-field allowlist and Object.fromEntries; not caller-supplied property/operator names. Preserve complete equality/ownership assertions. |
| D2 | 20 | DESIGN CHOICE | Array indexes arise from bounded create/read loops, generated worker indexes or checked exactly-one-winner indexes. Preserve bounds, paired-array correspondence, winner/cleanup assertions and complete comparisons. |
| D3 | 2 | DESIGN CHOICE | Reads only the two explicitly allowlisted dev-password variable names to compare in memory for leak detection. Never log values or broaden credential scope; test with generated markers, not real secrets. |
| D4 | 1 | DESIGN CHOICE | Canonicalizer reads Object.keys and constructs own properties with Object.fromEntries; no prototype assignment. Four isolated helper cases now include own-key __proto__/constructor regressions; never import the live G4 runner to test it. |
| D5 | 2 | DESIGN CHOICE | Metadata key set is exact/own-property checked; only fixed numeric keys are read, integers/nonnegative enforced. Preserve validation and sanitize failures; do not invoke Docker or container credentials for static checks. |
| D6 | 1 | DESIGN CHOICE | Dynamic label text is escaped before regex construction; literal punctuation and required-marker cases pass. Keep escaping and bounded suffix semantics. |
| D7 | 3 | DESIGN CHOICE | Read-only baseline/log/stat calls use fixed module-relative URL constants, not HTTP/CLI/environment-selected paths. No arbitrary path override; no log or checkpoint contents are read by this proposal. |

[P3 regression evidence and limits](h1-batch3-findings.md) remain applicable.
The canonicalizer's four offline cases now pass without importing live runners.
Add isolated boundary tests for paired arrays/metadata/credential-name
allowlists where acceptance depends on them; retain existing runtime assertions.

### Every frontend candidate — original IDs preserved

F13/F14/F38/F39 were fixed with Map counters and are absent. F43 moved to the
escaped label helper; F65 moved to the unchanged price helper. Do not recreate
exceptions for those four removed counter warnings. Same-line diagnostics keep
separate columns and expected membership of one per row.

| ID | Exact file / diagnostic span | Rule | Rationale |
| --- | --- | --- | --- |
| F01 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs#L135) :135:36–61 | UR | R1 |
| F02 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs#L136) :136:41–66 | UR | R1 |
| F03 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs#L222) :222:32–61 | UR | R1 |
| F04 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs#L225) :225:34–59 | UR | R1 |
| F05 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs#L226) :226:31–53 | UR | R1 |
| F06 | [e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs#L227) :227:31–62 | UR | R1 |
| F07 | [e2e/auth.e2e.ts](../../frontend/e2e/auth.e2e.ts#L17) :17:25–50 | UR | R1 |
| F08 | [e2e/auth.e2e.ts](../../frontend/e2e/auth.e2e.ts#L18) :18:25–50 | UR | R1 |
| F09 | [e2e/auth.e2e.ts](../../frontend/e2e/auth.e2e.ts#L60) :60:25–50 | UR | R1 |
| F10 | [e2e/browser-security.e2e.ts](../../frontend/e2e/browser-security.e2e.ts#L66) :66:25–50 | UR | R1 |
| F11 | [e2e/browser-security.e2e.ts](../../frontend/e2e/browser-security.e2e.ts#L67) :67:25–50 | UR | R1 |
| F12 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L30) :30:53–65 | OI | D1 |
| F15 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L186) :186:11–25 | OI | D2 |
| F16 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L187) :187:17–31 | OI | D2 |
| F17 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L187) :187:38–51 | OI | D2 |
| F18 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L188) :188:71–85 | OI | D2 |
| F19 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L190) :190:28–41 | OI | D2 |
| F20 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L190) :190:46–60 | OI | D2 |
| F21 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L191) :191:58–72 | OI | D2 |
| F22 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L192) :192:57–71 | OI | D2 |
| F23 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L223) :223:17–34 | OI | D2 |
| F24 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L223) :223:41–56 | OI | D2 |
| F25 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L226) :226:28–43 | OI | D2 |
| F26 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L229) :229:57–74 | OI | D2 |
| F27 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L231) :231:41–56 | OI | D2 |
| F28 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L241) :241:52–66 | OI | D2 |
| F29 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L242) :242:26–39 | OI | D2 |
| F30 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L242) :242:44–58 | OI | D2 |
| F31 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L243) :243:56–70 | OI | D2 |
| F32 | [e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs#L244) :244:55–69 | OI | D2 |
| F33 | [e2e/dashboard.e2e.ts](../../frontend/e2e/dashboard.e2e.ts#L62) :62:25–50 | UR | R1 |
| F34 | [e2e/dashboard.e2e.ts](../../frontend/e2e/dashboard.e2e.ts#L63) :63:25–50 | UR | R1 |
| F35 | [e2e/dashboard.e2e.ts](../../frontend/e2e/dashboard.e2e.ts#L93) :93:82–95 | OI | D2 |
| F36 | [e2e/delete.e2e.ts](../../frontend/e2e/delete.e2e.ts#L30) :30:25–50 | UR | R1 |
| F37 | [e2e/delete.e2e.ts](../../frontend/e2e/delete.e2e.ts#L31) :31:25–50 | UR | R1 |
| F40 | [e2e/load-smoke.mjs](../../frontend/e2e/load-smoke.mjs#L99) :99:5–21 | OI | D2 |
| F41 | [e2e/mongo-outage.mjs](../../frontend/e2e/mongo-outage.mjs#L76) :76:18–34 | OI | D3 |
| F42 | [e2e/mongo-outage.mjs](../../frontend/e2e/mongo-outage.mjs#L76) :76:52–68 | OI | D3 |
| F43 | [e2e/support/form-label.ts](../../frontend/e2e/support/form-label.ts#L4) :4:10–52 | DR | D6 |
| F44 | [e2e/product-list.e2e.ts](../../frontend/e2e/product-list.e2e.ts#L50) :50:25–50 | UR | R1 |
| F45 | [e2e/product-list.e2e.ts](../../frontend/e2e/product-list.e2e.ts#L51) :51:25–50 | UR | R1 |
| F46 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L112) :112:67–92 | UR | R1 |
| F47 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L113) :113:67–92 | UR | R1 |
| F48 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L195) :195:34–63 | UR | R1 |
| F49 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L196) :196:38–63 | UR | R1 |
| F50 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L197) :197:35–57 | UR | R1 |
| F51 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L198) :198:35–66 | UR | R1 |
| F52 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L240) :240:25–50 | UR | R1 |
| F53 | [e2e/responsive.mjs](../../frontend/e2e/responsive.mjs#L241) :241:25–50 | UR | R1 |
| F54 | [e2e/support/canonical.mjs](../../frontend/e2e/support/canonical.mjs#L5) :5:84–94 | OI | D4 |
| F55 | [e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs#L68) :68:31–68 | FS | D7 |
| F56 | [e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs#L78) :78:21–45 | FS | D7 |
| F57 | [e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs#L79) :79:19–39 | FS | D7 |
| F58 | [e2e/roles.e2e.ts](../../frontend/e2e/roles.e2e.ts#L43) :43:25–50 | UR | R1 |
| F59 | [e2e/roles.e2e.ts](../../frontend/e2e/roles.e2e.ts#L44) :44:25–50 | UR | R1 |
| F60 | [e2e/routing-errors.e2e.ts](../../frontend/e2e/routing-errors.e2e.ts#L32) :32:25–50 | UR | R1 |
| F61 | [e2e/routing-errors.e2e.ts](../../frontend/e2e/routing-errors.e2e.ts#L33) :33:25–50 | UR | R1 |
| F62 | [e2e/support/mongo-user-metadata.mjs](../../frontend/e2e/support/mongo-user-metadata.mjs#L80) :80:61–72 | OI | D5 |
| F63 | [e2e/support/mongo-user-metadata.mjs](../../frontend/e2e/support/mongo-user-metadata.mjs#L80) :80:77–88 | OI | D5 |
| F64 | [e2e/support/safe-reporter.ts](../../frontend/e2e/support/safe-reporter.ts#L7) :7:26–66 | UR | R2 |
| F65 | [src/validation/productPrice.ts](../../frontend/src/validation/productPrice.ts#L3) :3:10–34 | UR | R3 |

## Captured source fingerprints — proposal provenance, not an active manifest

SHA-256 below covers the exact current bytes of the 27 source files referenced
by the proposed matches, including existing approved uncommitted edits.
No secret/environment/log/configuration content was inspected to obtain them.
These are provenance anchors, not permission to accept future edits. Record
control-file/parser/plugin/lock inputs separately after approved implementation;
do not treat this table as a complete executable manifest or bypass human review.

| Source file | SHA-256 |
| --- | --- |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/AppTestController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/AppTestController.java) | `a0924d9fb03a570f8f703a79ec5492d1a8df06146775eb08e272ebd25ecea3b9` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java) | `6311c1fd91ae17c595de798c017c643ee52ede08d495889071d937fcbe18402e` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java) | `34da6ac2099eb1454e55dd257013b3507284c4528b66342345ad43266d993c95` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductService.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductService.java) | `2edd6c0d33e1e0014f8d3ceed25cb0d1025a895b89f176849f4f097492abbf08` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java) | `100bfaadbc50fb30975b1bcd05beef4e5a38d42b938ebd82412c38bc99f164e2` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java) | `b0493d474deeb75357119e39e63995bb0d1e8dc6442d7394eba80913bea55d01` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieBearerTokenResolver.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieBearerTokenResolver.java) | `37c42f9451ae32e3f83447cea90d6e76a5d21d60be3c3208d516449e9767f674` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java) | `836a74651fc721ae421c829cca14c7b5b2dbc5f9b4f2fc9beaf89e3b50d63447` |
| [backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java) | `96eacef9b2a4634576f8750df3396c317d7369084fe6883cc681868e0798a354` |
| [frontend/e2e/accessibility.mjs](../../frontend/e2e/accessibility.mjs) | `61bf1aa25ce04c13f52c5887a5ba6d53b0e4430fbcaf0bd82ea8fb6c3f29cc62` |
| [frontend/e2e/auth.e2e.ts](../../frontend/e2e/auth.e2e.ts) | `df963abf49047564b8386e9fbb4f8f11d1cf425759e48126169c3795af35b297` |
| [frontend/e2e/browser-security.e2e.ts](../../frontend/e2e/browser-security.e2e.ts) | `e251892a94ddd0454f89580504190046efe27b3f29db751e04ba8b8ca2bf5631` |
| [frontend/e2e/concurrency.mjs](../../frontend/e2e/concurrency.mjs) | `d0893fb7da1a287106bbf7b6b4c6e8d31e22be96451ea4353f74cb99bd649480` |
| [frontend/e2e/dashboard.e2e.ts](../../frontend/e2e/dashboard.e2e.ts) | `f28909bfb35ff65ded7f6d0481b47389a38b7455991044d2c6f873d693cdd320` |
| [frontend/e2e/delete.e2e.ts](../../frontend/e2e/delete.e2e.ts) | `1eee1d5011986c850973a6a23ba3bef47e97bb9cfe4c62fe6a61fb8aad3f1272` |
| [frontend/e2e/load-smoke.mjs](../../frontend/e2e/load-smoke.mjs) | `1508a60046f62d16dc373e658e5583d24271ee0eaebefb43a889bac503c335b5` |
| [frontend/e2e/mongo-outage.mjs](../../frontend/e2e/mongo-outage.mjs) | `41bc611815e03d8bbe29e4a8c1930abfbae01ad29b5db6e11d1e5b97db77b56e` |
| [frontend/e2e/product-list.e2e.ts](../../frontend/e2e/product-list.e2e.ts) | `5ff12115b4853ac2d70f5d0f19d123a7a63055918a12d011a7537f93bfde545f` |
| [frontend/e2e/responsive.mjs](../../frontend/e2e/responsive.mjs) | `32a2a3237415bb58e37170ac1c47b708391c465b01942636ba1230d145701c4f` |
| [frontend/e2e/restart-idempotence.mjs](../../frontend/e2e/restart-idempotence.mjs) | `adba372f6dd5080dce14e1bc2bbd9c6bbf4f17e728871d25e8dd58f9b0ffb163` |
| [frontend/e2e/roles.e2e.ts](../../frontend/e2e/roles.e2e.ts) | `fe12d923b5e368992b2d83ec8f1a0303606d12453a393039a28a3aa04563bb5b` |
| [frontend/e2e/routing-errors.e2e.ts](../../frontend/e2e/routing-errors.e2e.ts) | `5aa72d8865e3809e999f31d74dace282429a2d8478b9ec0c98d5b29a6114fc37` |
| [frontend/e2e/support/form-label.ts](../../frontend/e2e/support/form-label.ts) | `e08b187d49fff7279f7d2a12ac7ce40ea18d9b69a14394798945f9a03b24898f` |
| [frontend/e2e/support/canonical.mjs](../../frontend/e2e/support/canonical.mjs) | `9201f005122fc6bdd7e8decaaf02ce8ad1d9ffb96a1e83d4076fa7f7ab505015` |
| [frontend/e2e/support/mongo-user-metadata.mjs](../../frontend/e2e/support/mongo-user-metadata.mjs) | `d9b694171887eb0fcca168d45c5826f3dd2fd469cec26a2db43e72e2e27161ff` |
| [frontend/e2e/support/safe-reporter.ts](../../frontend/e2e/support/safe-reporter.ts) | `311aa4158c918bc2b7e9022922d922a9d96ae18f4c6d097edc70622518e86783` |
| [frontend/src/validation/productPrice.ts](../../frontend/src/validation/productPrice.ts) | `40978905b0d9d894c427ebc645daaba5b7153d44888ab37367b148e52f0cc2eb` |

## Proposed verification sequence — separately approved implementation only

1. **Evidence and guard tests first; no active exclusions.** Add isolated seeder
   profile/empty/nonempty/batch/determinism tests and canonicalizer own-key tests.
   If extracting pure QA helpers is needed, show the diff and preserve runner
   behavior/assertions; refresh proposed hashes only after explicit review.
   Never import G1/G2/G3/G4 top-level modules into offline tests: they perform
   traffic/service-related work. Add match-validator tests for zero/extra/
   duplicate/overlapping/unused entries, drifted hashes, malformed reports and
   analysis errors. No new package or browser download is part of this plan.
2. **Fresh raw inventories.** After separate run approval, retain new unfiltered
   Java XML and frontend JSON and reconcile all 25/61 members, not just totals.
   If the inventories differ, stop/review instead of accepting new reports.
   Java raw command remains:
   `./mvnw -o -B -Pstatic-analysis -DskipTests compile spotbugs:check`.
   Frontend raw command remains `npm run lint:security` (JSON output optional).
   Known-finding exit 1 is recorded as raw FAILED, never relabeled raw PASSED.
3. **Negative/positive controls without executing fixture code.**
   Analyze intentionally unsafe fixture sources in a separate temporary
   build/analysis directory, never application output. Java fixture controls
   should include a new mutable alias outside the four DI fields, predictable
   security RNG outside the seeder run method, a new endpoint/cookie/header/
   parameter hotspot outside accepted members, and a throwing-constructor
   pattern. Validate actual installed-detector expectations before gating;
   unsupported/undetected controls must be reported, not claimed as proof.
   Never enable application test-bytecode analysis globally just for fixtures.
4. **ESLint positive controls with the installed rules/API.** Lint snippets only:
   a nested-quantifier regex such as /(a+)+$/, a dynamic target[key] write, an
   unescaped new RegExp(pattern), and fs.readFileSync(untrustedPath) using the
   node:fs import. Expect the respective four security rule IDs. Do not run
   snippets or access filesystem/network through them. Repeat at unaccepted
   spans in reviewed file paths: they must remain unreviewed and fail the gate.
5. **Mutation controls inside accepted scopes.** Mutate an accepted statement/
   member or adjacent trust-boundary code in memory/temporary fixtures without
   updating approval data. The source-fingerprint guard must fail even if the
   native filter would hide the same pattern in that method. This is guard
   evidence, not a claim the filtered scanner itself detected that mutation.
   Also mutate an unreviewed method/field/location: it must remain visible.
6. **Apply nothing until activation approval.** Present reconciled inventories,
   actual per-entry native match counts, guard results and functional test diff.
   After explicit activation approval only, create the exact XML/manifest and
   opt-in reviewed wiring. Expected reviewed unresolved count is zero **only if**
   every reviewed match and prerequisite passes; raw totals may still be 25/61.
   Report raw findings, accepted reports and unresolved findings separately.
7. **Functional regression after approved implementation.** Run focused backend
   tests (currently 201), frontend lint/unit/typecheck/build (currently 51 unit
   cases), then user-owned full backend clean verify with the dedicated exported
   MONGODB_TEST_URI, no development fallback. Current baseline is 249 passing
   backend tests; new supporting tests will increase it. No lowered coverage
   threshold, removed assertion or new test/coverage exclusion.
8. **Runtime/Git stay separate.** No backend/Mongo/frontend restart, live API or
   browser runner, data write, H2/ZAP action, container image pull, install,
   commit/push/PR or Git config change is authorized by this proposal.
   Offline work needs no backend restart. Any later live run needs per-item
   approval, existing services, qa-owned cleanup and inventory verification.

## Approval boundary and current preparation status

The original proposal was documentation only. Supporting evidence/positive
controls and the inactive pure guard were subsequently implemented and verified;
see [the supporting handoff](h1-supporting-verification.md). Fresh raw scans then
reconciled the 25 Java reports and all 61 frontend diagnostics. Their original
evidence, including previous coordinates/hash, is preserved in the
[raw reconciliation](h1-raw-reconciliation-20261107.md).

The user has explicitly approved refreshing F54–F57 above and the affected
runner/helper source provenance, plus preparing inactive native-report adapters
and fixed-scope input discovery. This is a one-time reviewed documentation
refresh, not automatic baseline generation or approval of future changes.
All 27 hashes describe only candidate source provenance, not an active manifest.

H1 remains FAILED on current raw gates (25 Java + 85 frontend); only 61 frontend
diagnostics are candidates in this document, and the 24 new tooling warnings
remain outside those entries. The last full backend
build passed 249 cases; supporting tests subsequently passed 217 focused cases
and 173 frontend cases, with expected full backend count 265 still user-owned.
No newer full-build/coverage result or active exclusion is implied. The native
Java summary's zero class count was independently understood and corrected
through the approved XML-only reporting workflow; other provenance, source/
bytecode and evidence prerequisites remain before any activation.

No real accepted-finding manifest, native filter or gate activation is authorized
in this preparation. Native adapters/input collectors must be tested on synthetic
data and preserve diagnostics on failure. Show their diff before verification.
Any executable scanner/acceptance wiring, actual exclusions and reviewed policy
activation need separate explicit approval, after remaining completeness and
evidence prerequisites are demonstrated. QA docs remain ignored; ordinary staging
does not include them. No Git or service action is performed.
