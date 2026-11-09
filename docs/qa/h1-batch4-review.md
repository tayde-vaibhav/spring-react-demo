# H1 / Batch 4 — Review and proposed narrow dispositions only

Historical review phase. Subsequent approved implementation, scan results and
the newly exposed CSRF regression are recorded in
[the implementation handoff](h1-batch4-implementation.md); that handoff is the
current status. Exclusions remain unapproved/unapplied.

Date: 2026-11-07. Approved scope: review and proposals, not implementation.
No application/test/configuration code, filter file or build setting changed.
No build, analyzer, live request, database operation, dependency download,
service restart or Git mutation was performed. Existing work is preserved.

## Evidence and current status

Reviewed the P2 28-finding inventory, current affected Java source, security
chain, seeder guard, POM and security/service/validation test declarations.
Installed JDK 25.0.1 source was inspected offline: java.lang.Object still has a
deprecated finalize method, and java.lang.ref.Finalizer gates registration on
the VM's native finalization-enabled setting. This does not establish the
running application's finalization policy. No process arguments/environment
were inspected and no hostile subclass or finalizer proof of concept was run.

The later user-run clean build removed the native SpotBugs target report.
Consequently, this is a source review of the saved P2 inventory, not a fresh
scan or evidence that draft filters match bytecode. Exact match counts must be
validated against a future unfiltered report before enabling any exclusions.

| Pattern | Count | Classification | Proposed disposition now |
| --- | ---: | --- | --- |
| CT_CONSTRUCTOR_THROW | 3 | REAL, conditional low in-process hardening | Keep open; no suppression or removal of fail-fast checks. |
| EI_EXPOSE_REP2 | 4 | FALSE POSITIVE in DI/security interpretation | Four exact constructor-and-field draft exclusions already in P2; need separate approval and match verification. |
| SPRING_ENDPOINT | 11 | DESIGN CHOICE | Keep visible pending stronger automated access-matrix coverage. |
| COOKIE_USAGE | 4 | DESIGN CHOICE | Keep visible pending direct duplicate/empty/missing-cookie tests and decoder delegation checks. |
| PREDICTABLE_RANDOM | 2 | DESIGN CHOICE | One exact dev-seeder run-method exclusion candidate; never security RNG. |
| SERVLET_PARAMETER | 1 | DESIGN CHOICE | Keep visible; extend parameter rejection tests before considering an exact search-method exclusion. |
| SERVLET_HEADER | 1 | DESIGN CHOICE | Keep visible; extend direct CSRF-filter tests before considering an exact filter-method exclusion. |
| THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | 2 | DESIGN CHOICE | Two exact bean-method exclusion candidates; retain supported builder exception contracts. |
| **Total** | **28** | **REAL 3 / FALSE POSITIVE 4 / DESIGN CHOICE 21** | **8 exclusion candidates, 17 retained hotspots, 3 open constructor findings. Nothing excluded.** |

H1 remains FAILED: 28 Java findings from the last scan and 61 frontend warnings
from P3. Classifications are source-review judgments, not proof of complete
security or a passing analyzer gate. The latest full backend build is still the
user's 101-test success; no new tests were executed in this review.

## Exact scope for every retained Java finding

Method parameter lists below identify source/bytecode scopes, not approved
exclusions. Types use the imports in the linked source; proposed XML below uses
fully qualified erased types. Counts retain separate same-method findings.

| Original ID(s) | Exact class/member and source | Count | Evidence and proposed action |
| --- | --- | ---: | --- |
| J38 | [AuthService constructor](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java#L28): (AuthenticationManager, JwtEncoder, LoginRateLimiter, long) | 1 | Throws for invalid expiry in a non-final class. Keep range checks and open conditional finding. |
| J47 | [LoginRateLimiter constructor](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/LoginRateLimiter.java#L26): (Duration) | 1 | Delegates to throwing constructor; keep dev-window validation. |
| J48 | [LoginRateLimiter constructor](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/LoginRateLimiter.java#L31): (Duration, Clock) | 1 | Null and positive-duration checks can throw after Object construction; keep checks. |
| J08 | [ProductController constructor](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L41): (ProductService), field productService | 1 | Intentional injected collaborator, not retained request representation; exact EI_EXPOSE_REP2 draft in P2. |
| J16 | [ProductSeeder constructor](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java#L52): (ProductRepository, MongoTemplate, int), field mongoTemplate | 1 | Shared Spring MongoTemplate, dev-only seeder; exact EI_EXPOSE_REP2 draft in P2. |
| J19 | [ProductService constructor](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductService.java#L39): (ProductRepository, MongoTemplate, ProductMapper), field mongoTemplate | 1 | Shared injected template, not externally exposed DTO state; exact EI_EXPOSE_REP2 draft in P2. |
| J39 | [AuthService constructor](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthService.java#L28): (AuthenticationManager, JwtEncoder, LoginRateLimiter, long), field rateLimiter | 1 | Shared limiter must retain process-wide state; exact EI_EXPOSE_REP2 draft in P2. |
| J01 | [AppTestController.appTest()](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/AppTestController.java#L16) | 1 | Main chain default-deny blocks this legacy endpoint; no app-test request in the main security integration suite. Retain hotspot pending regression. |
| J10 | [ProductController.create(ProductRequest)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L46) | 1 | ADMIN request matcher, Jakarta validation and DTO; existing USER-denial/ADMIN-success tests. Retain until matrix completed. |
| J11 | [ProductController.delete(String)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L66) | 1 | ADMIN matcher and CSRF tests; add explicit USER and anonymous denial with valid/missing CSRF separated. |
| J12 | [ProductController.getById(String)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L56) | 1 | USER/ADMIN GET matcher; add complete role/anonymous matrix. |
| J13 | [ProductController.getStats()](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L84) | 1 | Authentication matcher takes precedence over product GET roles matcher; preserve documented authenticated access, do not silently tighten it. |
| J14 | [ProductController.search(String, BigDecimal, BigDecimal, String, Pageable, HttpServletRequest)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L72) | 1 | USER/ADMIN matcher, DTO output, typed/allowlisted bounded filters. Keep access tests and hotspot. |
| J15 | [ProductController.update(String, ProductUpdateRequest)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L61) | 1 | ADMIN matcher, CSRF, validated version; preserve stale-version 409 and add explicit USER-denial coverage. |
| J34 | [AuthController.csrf(CsrfToken)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L38) | 1 | Intentionally public CSRF bootstrap, not an access JWT; stale cookie ignored. Keep hotspot pending matrix. |
| J35 | [AuthController.login(LoginRequest, HttpServletRequest)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L43) | 1 | Public but CSRF-protected login, validated DTO, BCrypt authentication and bounded IP limiter; JWT cookie not response JSON. Retain contract. |
| J36 | [AuthController.logout()](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L59) | 1 | Authenticated and CSRF-protected; clears cookie only. No logout request in main security integration suite; add expiry/flags test without printing cookie values. |
| J37 | [AuthController.me(Jwt)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/AuthController.java#L71) | 1 | Authentication required; missing roles becomes empty list; preserve public response DTO without token. |
| J42/J43 | [CookieBearerTokenResolver.resolve(HttpServletRequest)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieBearerTokenResolver.java#L13) | 2 | Exact ACCESS_TOKEN cookie name; duplicate nonempty values rejected; token is passed to JWT decoder, not trusted directly. No named duplicate-cookie test in main suite; add direct isolated tests, including empty-first duplicate edge. |
| J44/J45 | [CookieCsrfHeaderFilter.csrfCookieValue(HttpServletRequest)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java#L49) | 2 | Missing/duplicate matching cookies return null; value must match header and pass Spring CSRF validation. Add isolated duplicate/empty tests. |
| J17/J18 | [ProductSeeder.run(String[])](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductSeeder.java#L61) | 2 | Two fixed-seed Random allocations for reproducible dev products, guarded by dev profile and nonempty collection check. Candidate below; no SecureRandom substitution. |
| J09 | [ProductController.search(String, BigDecimal, BigDecimal, String, Pageable, HttpServletRequest)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/product/ProductController.java#L72) | 1 | getParameterMap is inspected, unknown/repeated non-sort names rejected; service binds typed criteria and allowlists sort. Add repeated/unknown-name regression; do not remove validation. |
| J46 | [CookieCsrfHeaderFilter.doFilterInternal(HttpServletRequest, HttpServletResponse, FilterChain)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/CookieCsrfHeaderFilter.java#L31) | 1 | Untrusted header deliberately compared using MessageDigest.isEqual, unsafe methods only. Existing POST/DELETE CSRF tests; add PUT and duplicate/missing cookie tests. |
| J49 | [SecurityConfiguration.devApiDocumentationSecurityFilterChain(HttpSecurity)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java#L59) | 1 | Dev-only ordered docs matcher; builder exceptions are legitimate startup failure. Exact candidate below. |
| J50 | [SecurityConfiguration.securityFilterChain(HttpSecurity, CookieCsrfTokenRepository, BearerTokenResolver, AuthenticationEntryPoint, AccessDeniedHandler, Converter, CorsConfigurationSource)](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/security/SecurityConfiguration.java#L129) | 1 | Main fail-closed request chain; supported builder signature throws Exception. Exact candidate below. |

## Constructor findings — proposed fix options, NOT APPLIED

The hostile-subclass attack requires executable code inside the same JVM, a
subclass with a finalizer, failed superclass construction after Object has been
constructed, and finalization actually enabled. HTTP input alone is not shown
to satisfy these preconditions. The classes' configuration failures are real,
but no attacker-controlled subclass/finalizer exists in the inspected repo.

No explicit subclasses, custom aspects, or transactional/async/cache annotations
were found for these beans in current source. This is not proof that class-based
Spring proxies cannot be configured by dependencies or future features.

Recommended implementation proposal, requiring separate approval:

1. Add isolated constructor-boundary tests for AuthService expiry 59/60/86400/86401
   and limiter null/zero/negative/positive inputs, retaining every existing test.
2. Verify Spring context/proxy needs. Only if confirmed compatible, make the two
   concrete classes final and assert non-subclassability with tests; check the
   unfiltered analyzer and full application context afterward. Do not make beans
   final unconditionally or remove throwing validation to silence the warning.
3. If finality is incompatible, retain findings and propose a separate validated
   factory/constructor design. Do not introduce deprecated finalize overrides,
   silently disable VM finalization, change validation contracts, or suppress
   CT_CONSTRUCTOR_THROW in this batch.

## Eight exclusion candidates — proposals only

The four exact EI_EXPOSE_REP2 constructor/field entries remain as drafted in
[the P2 report](h1-batch2-findings.md). The three additional Match entries below
are candidates for two RNG findings plus two framework-signature findings.
They are NOT an installed filter file, not referenced by Maven, not yet tested
against native findings. No whole-class, package, category, or SECURITY exclusion.

```xml
<FindBugsFilter>
  <!-- Dev-profile reproducible product fixtures only; never token/password randomness.
       Expected matches: J17 and J18, the two Random allocations in run(String[]). -->
  <Match>
    <Bug pattern="PREDICTABLE_RANDOM"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductSeeder"/>
    <Method name="run" params="java.lang.String[]" returns="void"/>
  </Match>
  <!-- Dev-only docs chain uses the Spring HttpSecurity builder's checked contract.
       Expected match: J49 only. Authorization/CSRF rules are not excluded. -->
  <Match>
    <Bug pattern="THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION"/>
    <Class name="com.vaibhav.springreactdemo.security.SecurityConfiguration"/>
    <Method name="devApiDocumentationSecurityFilterChain"
            params="org.springframework.security.config.annotation.web.builders.HttpSecurity"
            returns="org.springframework.security.web.SecurityFilterChain"/>
  </Match>
  <!-- Main fail-closed chain uses the supported checked builder contract.
       Expected match: J50 only; no blanket SecurityConfiguration exemption. -->
  <Match>
    <Bug pattern="THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION"/>
    <Class name="com.vaibhav.springreactdemo.security.SecurityConfiguration"/>
    <Method name="securityFilterChain"
            params="org.springframework.security.config.annotation.web.builders.HttpSecurity,org.springframework.security.web.csrf.CookieCsrfTokenRepository,org.springframework.security.oauth2.server.resource.web.BearerTokenResolver,org.springframework.security.web.AuthenticationEntryPoint,org.springframework.security.web.access.AccessDeniedHandler,org.springframework.core.convert.converter.Converter,org.springframework.web.cors.CorsConfigurationSource"
            returns="org.springframework.security.web.SecurityFilterChain"/>
  </Match>
</FindBugsFilter>
```

Before enabling any subset, retain a fresh unfiltered inventory; validate each
entry's exact membership/count with the installed analyzer; reject broader or
zero matches. Add positive scanner fixtures outside production source proving
that unsafe collection aliases and security-sensitive predictable randomness
in other methods still report. Max effort, Low threshold and strict failure
behavior remain unchanged. A method-scoped RNG candidate would also hide future
RNG use in that exact method, so keep it fixture-only and review changes there.

No draft exclusions are proposed now for the 17 endpoint/cookie/input hotspots.
Strengthen regression evidence first rather than relying solely on earlier
manual QA claims. The full endpoint matrix should use mocked repositories and
synthetic in-memory signing/CSRF values, never real credentials or the dev DB;
no values in output/artifacts. Keep any test profile connection on its dedicated
MONGODB_TEST_URI, never MONGODB_URI.

## Approval requested / documentation

Recommended next approval is implementation of the focused regression additions
above and proxy-safe constructor hardening, **without exclusions**, with a shown
diff before focused verification and an unfiltered Java rescan. Full clean verify
remains user-owned unless separately authorized with a dedicated test URI.
Adding each exclusion is a separate decision after exact-match verification.

Only this ignored proposal note, the ignored remediation-plan status and the
pre-approved QA report were updated. No README/SECURITY.md production behavior
claim needs changing for a review-only task. If a later approved fix changes
behavior, documentation scope must be approved with that implementation.
QA docs remain Git-ignored and will not be included by normal staging.
No restart is required for this review.
