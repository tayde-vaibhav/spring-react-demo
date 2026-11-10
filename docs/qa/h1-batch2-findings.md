# H1 Batch 2 — final focused verification and Java classification

Batch 2 implementation/focused tests: **PASSED**. Strict Java analysis: **FAILED**
for 28 unsuppressed findings. Full clean verify for this revision subsequently
passed in the user's terminal: 101 tests, zero failures/errors/skips, successful
packaging/JaCoCo reporting. Local reports corroborate this manual run; the agent
did not execute it. No suppression/exclusion is applied.

## Changes and compatibility evidence

The production diff was shown before verification. Only ApiExceptionHandler and
the new package-private LogSanitizer change production code in Batch 2:
- Locale.ROOT controls type-suffix lowercasing; existing English canonical URIs,
  titles, status codes, details, instances and JSON field names are preserved.
- The already-logged path and original exception type are bounded to 512 UTF-16
  units per value (including a truncation suffix). CR/LF, ISO controls, Unicode
  format/line/paragraph controls and isolated surrogates are replaced with _.
  Normal Unicode/supplementary characters remain intact; no URL decoding occurs.
- Raw Throwable attachment is removed. Its messages/causes/suppressed exceptions
  could bypass string sanitization and carry sensitive data. Stack traces are
  consequently no longer logged by this handler. This is an explicit diagnostic
  trade-off, not a change to HTTP/client behavior.
- No request body, query string, header, credential, token, cookie, correlation ID
  or other new request field is collected for logging. Sanitization is not a
  secret-discovery algorithm for arbitrary data; credentials must never be placed
  in URL paths. The regression tests prove the selected sensitive sources are
  absent, not that every possible log message across the application is safe.

Changed/created files:
- [ApiExceptionHandler](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/api/ApiExceptionHandler.java)
- [LogSanitizer](../../backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/api/LogSanitizer.java)
- [ApiExceptionHandlerContractTest](../../backend/springreactdemo/src/test/java/com/vaibhav/springreactdemo/api/ApiExceptionHandlerContractTest.java)
- [LogSanitizerTest](../../backend/springreactdemo/src/test/java/com/vaibhav/springreactdemo/api/LogSanitizerTest.java)
- [README](../../README.md), this ignored report and the existing ignored QA report/plan.

## Commands and outcomes

Final focused run, after the shown test-only reflection cleanup:

```bash
./mvnw -o -B -Dtest=ApiExceptionHandlerContractTest,LogSanitizerTest,CollectionSnapshotsTest,CollectionOwnershipTest,CollectionContractTest,ProductRequestValidationTest,ProductServiceTest,LoginRateLimiterTest,SecurityConfigurationTest test
```

79/79 tests passed in nine suites, zero failures/errors/skips: 38 new Batch-2
cases and 41 unchanged focused cases. A prior 79-case run also passed; the final
run includes the replacement of a reflection-only dummy method with the real
ProductController create signature. No assertion or old test was removed.

Thirty-three contract cases assert literal type URIs, titles, statuses, details,
instance and exact serialized field sets under root, English and Turkish locales.
They cover all requested 400/401/403/404/409/429 cases, including validation/body/
parameter alternatives and both 404 forms; 415 is also checked. The log suite
separately asserts the unchanged 500 contract under Turkish locale.

Five log tests cover CR/LF plus other controls, one actual rendered log line,
truncation/exact boundary, Unicode safety, private source/cause/suppressed marker
non-leakage and the absence of new logs for handled client errors. Markers are
generated in memory, never real secrets, and no raw log text is printed or saved.
Logger/default-locale changes are isolated and restored in finally/teardown.

```bash
./mvnw -o -B -Pstatic-analysis -DskipTests compile spotbugs:check
```

Compilation and analysis completed. The gate exited 1 for **28 findings**, zero
analysis errors and zero missing classes. Previous post-P1 count=30; removed
CRLF_INJECTION_LOGS and DM_CONVERT_CASE, zero new findings. Overall 52 -> 30 -> 28.
Maximum effort/Low threshold are unchanged; no filters, annotations or suppressions
were added. Native XML: [spotbugsXml.xml](../../backend/springreactdemo/target/spotbugsXml.xml).
A later clean build will replace/remove target artifacts; this sanitized inventory
remains here for traceability.

## Remaining findings grouped by pattern

REAL below means a real code/hardening pattern with stated preconditions, not an
assertion of a remote exploit. FALSE POSITIVE concerns the warning's security
interpretation in this DI context; the bean references do exist intentionally.
DESIGN CHOICE means a deliberate supported mechanism/hotspot, not zero residual risk.

| Pattern | Count | Classification | Evidence and proposed disposition |
| --- | --- | --- | --- |
| CT_CONSTRUCTOR_THROW | 3 | REAL (conditional, low) | AuthService:32; LoginRateLimiter:28,35. Non-final classes throw during construction. This is a real partially-initialized/subclass-finalizer pattern, not a demonstrated remote exploit; hostile in-process subclassing and an applicable finalization policy are preconditions. Keep fail-fast checks; separately review safe finality/proxy-compatible prevention rather than suppressing it. |
| EI_EXPOSE_REP2 | 4 | FALSE POSITIVE (DI, security interpretation) | ProductController.productService, ProductSeeder.mongoTemplate, ProductService.mongoTemplate and AuthService.rateLimiter intentionally retain injected Spring collaborators. They are not externally exposed mutable request/response representation. Narrow constructor+field exclusions are proposed below, not applied; no constructor injection is removed. |
| SPRING_ENDPOINT | 11 | DESIGN CHOICE | Controller discovery hotspots. Product writes require ADMIN; reads USER/ADMIN; stats/me/logout authenticated; login/CSRF public with applicable CSRF rules; default deny protects unmatched paths and app-test. Preserve the request-level security chain and existing tests; do not broadly exclude all controllers. |
| COOKIE_USAGE | 4 | DESIGN CHOICE | CookieBearerTokenResolver:24,28 and CookieCsrfHeaderFilter:57,61 read cookies required by the chosen auth/CSRF contracts. Duplicate access cookies are rejected, JWT decoding validates tokens and unsafe requests require matching CSRF material. These are input hotspots, not proof of insecure cookie issuance. |
| PREDICTABLE_RANDOM | 2 | DESIGN CHOICE | ProductSeeder:71,72 uses a fixed seed for reproducible dev products only, not security tokens or passwords. Preserve the dev profile and deterministic fixture behavior. |
| SERVLET_PARAMETER | 1 | DESIGN CHOICE | ProductController:79 reads parameter names to reject unknown/repeated parameters before typed, bounded search. Preserve allowlists, validation and repository binding. |
| SERVLET_HEADER | 1 | DESIGN CHOICE | CookieCsrfHeaderFilter:39 reads the untrusted CSRF header specifically to validate it against the cookie. Preserve safe-method rules, constant-time comparison, duplicate/missing checks and regression tests. |
| THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | 2 | DESIGN CHOICE | SecurityConfiguration:60,136 exposes Spring Security builder exceptions at bean creation. Preserve fail-fast framework configuration; no error response or authorization change is justified by this broad-signature warning. |

Totals: **REAL=3**, **FALSE POSITIVE=4**, **DESIGN CHOICE=21**; total=28.
These classifications are source-review judgments. Neither full runtime tests
nor hostile-subclass exploit tests were performed in Batch 2.

## Narrow false-positive proposal — NOT APPLIED

If separately approved, the following is a draft for backend-module
`spotbugs-exclude.xml`. It is NOT created, installed or referenced by the POM.
Each match combines the one bug pattern, exact class, exact constructor signature
and exact injected field; no DTO, entity, package or whole-category exclusion.
Validate that exactly these four findings match before enabling it and keep the
unfiltered inventory. The other 24 reports must remain visible.

```xml
<FindBugsFilter>
  <!-- Spring-managed ProductService reference, not externally exposed request state. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductController"/>
    <Method name="&lt;init&gt;" params="com.vaibhav.springreactdemo.product.ProductService" returns="void"/>
    <Field name="productService"/>
  </Match>
  <!-- Shared MongoTemplate is intentionally injected into the dev seeder. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductSeeder"/>
    <Method name="&lt;init&gt;" params="com.vaibhav.springreactdemo.product.ProductRepository,org.springframework.data.mongodb.core.MongoTemplate,int" returns="void"/>
    <Field name="mongoTemplate"/>
  </Match>
  <!-- Shared MongoTemplate is intentionally injected, not a caller-owned DTO map. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.product.ProductService"/>
    <Method name="&lt;init&gt;" params="com.vaibhav.springreactdemo.product.ProductRepository,org.springframework.data.mongodb.core.MongoTemplate,com.vaibhav.springreactdemo.product.ProductMapper" returns="void"/>
    <Field name="mongoTemplate"/>
  </Match>
  <!-- The process-local shared limiter must remain the injected singleton. -->
  <Match>
    <Bug pattern="EI_EXPOSE_REP2"/>
    <Class name="com.vaibhav.springreactdemo.security.AuthService"/>
    <Method name="&lt;init&gt;" params="org.springframework.security.authentication.AuthenticationManager,org.springframework.security.oauth2.jwt.JwtEncoder,com.vaibhav.springreactdemo.security.LoginRateLimiter,long" returns="void"/>
    <Field name="rateLimiter"/>
  </Match>
</FindBugsFilter>
```

There is no proposed CRLF or locale suppression: both findings are gone in the
unfiltered scan. No constructor/finalizer exclusion is proposed for the three
REAL/conditional entries. No filter is justified merely to obtain a green gate.

## Handoff

The user completed full `./mvnw clean verify` and supplied sanitized output:
101 tests in 12 suites, zero failures/errors/skips; build success in 28.318 seconds,
finished 2026-11-07 13:54:55 +05:30. The agent independently read aggregate local
Surefire/JaCoCo fields and confirmed the packaged JAR exists. Line coverage is
542/671 (80.77%); branch coverage is 185/262 (70.61%). JaCoCo report modification
time is 2026-11-07T08:24:55.871Z. No analyzer was rerun after this clean build;
the 28-finding inventory above is the previous completed scan, not a clean gate.

No backend restart is needed for these offline tests. A user-owned restart is
needed before later live verification of the changed logging behavior. No live
API tests, DB writes, service changes, external network requests, new dependencies
or Git mutations occurred. All previous uncommitted work is preserved. Further
fixes, XML exclusions, runtime reruns, Batch 3/4 and H2 require separate approval.
