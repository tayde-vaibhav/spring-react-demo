# QA Test Report

[A1] Git hygiene - PASSED
What I ran: Read `AGENTS.md` and `SECURITY.md`; inspected Git-tracked paths and `.env` history; scanned tracked content and Git history for common credential/token patterns while suppressing matching contents and excluding `.env` files.
Result: `.env` is not tracked, and Git history contains no `.env` path. No tracked cookie jars, test/browser artifacts, or build outputs were found. High-confidence token/key signatures and long credential-assignment checks found no matches; broad heuristic matches were limited to candidate paths and were not treated as confirmed secrets. No `.env` contents were opened.

[A2] Backend verification - PASSED
What I ran: `./mvnw clean verify` from `backend/springreactdemo/`; the first sandbox attempt could not download the Maven wrapper, so I reran the approved command with network access.
Result: Maven reported `BUILD SUCCESS`; 26 tests ran with 0 failures, 0 errors, and 0 skipped. No JaCoCo report or coverage goal appeared in the build output. Test startup connected to the existing MongoDB at localhost:27017; no database writes were part of this verification run.

[A3] Frontend static checks - FAILED
What I ran: `npm ci`, `npm run`, `npm run lint`, and `npm run build` in `frontend/`; inspected installed top-level ESLint/TypeScript packages and existing `dist/` file names/sizes.
Result: `npm ci` completed (265 packages added; npm reported 9 moderate advisories). Lint failed because ESLint 6.4.0 could not find a configuration; build/typecheck stopped because `tsc` was not found. No unit-test script is configured. Existing `dist/` contains a 1,004,499-byte JS bundle and no `.map` files, but the failed build means these pre-existing artifacts do not verify the current source build or source-map emission.
Likely cause / proposed fix: The frontend scripts reference ESLint and TypeScript tooling that is not available in the installed top-level dependencies, and lint configuration is missing or not being discovered. Reconcile the package manifest/lockfile and lint configuration, then rerun A3; no fix was applied.

[A3] Frontend static checks (rerun) - PASSED
What I ran: Clean-reinstalled the already-declared dependencies; added Vitest as a development dependency, a `test` script, and two API-client unit tests; ran `npm run lint`, `npm run test`, and `npm run build`; checked generated bundle files and the local frontend URL.
Result: ESLint passed; 1 test file and 2 tests passed; TypeScript check and Vite production build passed. JS bundle is 1,004,499 bytes, CSS is 9,660 bytes, and no source maps were emitted. Vite warns that the JS chunk exceeds 500 kB. npm reported 9 moderate advisories during install (not audited here). Only dev tooling/tests, package metadata/lock, and generated `dist/` changed; application runtime source and runtime dependencies were not changed. A localhost:5173 check failed to connect after the reinstall/build; causality is unconfirmed, and the dev server was not restarted pending approval.

[A3] Frontend reachability resolution - PASSED
What I ran: Started Vite with `VITE_BACKEND_PROXY_TARGET=http://localhost:8080` on loopback; it detected port 5173 was already occupied and selected 5174. Then checked `/login` on 127.0.0.1:5173 with an elevated local request.
Result: The project frontend at 127.0.0.1:5173 returned HTTP 200; the earlier connection failure was from the restricted execution context, not evidence that the host service was down. The start attempt also left an additional Vite instance on 127.0.0.1:5174; it has not been stopped pending approval. No credential-bearing page content was inspected for this reachability check.

[A3] Extra Vite instance cleanup - PASSED
What I ran: Sent an interrupt to the tracked Vite terminal session and checked `http://127.0.0.1:5174/` locally.
Result: The terminal session was already gone, and port 5174 returned no HTTP response (connection refused). The extra instance is no longer reachable. The existing frontend on 127.0.0.1:5173 was left untouched.

[A4] Runtime health - PASSED
What I ran: `docker compose ps` (read-only), GET `http://127.0.0.1:8080/actuator/health`, and GET `http://127.0.0.1:5173/login`.
Result: MongoDB container `spring-react-demo-mongodb-1` reports `Up (healthy)`. Backend health returned HTTP 200 with status `UP`; response included only health-group names and overall status, with no component details. Frontend returned HTTP 200. No service was started or stopped.

[A5] Seed data - BLOCKED
What I ran: Checked only whether `DEV_ADMIN_PASSWORD` and the optional `DEV_ADMIN_USERNAME` were present in the exported environment; read the dev seeder source to confirm its default admin username. No authentication request or product query was made.
Result: `DEV_ADMIN_PASSWORD` is not exported in this session, so the authenticated product count could not be checked. The seeder's default admin username is `admin`; no username variable was present. No cookie jar was created and no database data was changed.
Likely cause / proposed fix: The required dev admin password is unavailable in this process environment. Export `DEV_ADMIN_PASSWORD` in the session used for the QA run (do not put it in the report), then authorize a rerun of A5; I did not search files or `.env` for it.

[A5] Seed data (rerun) - BLOCKED
What I ran: Rechecked only whether `DEV_ADMIN_PASSWORD` and optional `DEV_ADMIN_USERNAME` were exported; did not read files or make API requests.
Result: `DEV_ADMIN_PASSWORD` remains unavailable in this process environment, so authentication and the 500-product count check could not run. No temporary cookie jar or database changes.
Likely cause / proposed fix: The credential still is not exported to the agent process. Export it in the session running the QA agent and then ask for another A5 retry; I did not search for it.

[B1] Auth flow - PASSED
What I ran: GET CSRF, POST admin login, GET `/auth/me`, POST logout, and GET `/auth/me` afterward against localhost:8080 using an ephemeral cookie jar. Cookie output was sanitized; the jar was removed by the exit trap.
Result: CSRF/login returned 200; `/auth/me` returned 200 with ADMIN role; logout returned 204 and the subsequent `/auth/me` returned 401. ACCESS_TOKEN cookie was HttpOnly, SameSite=Lax, Path=/, Max-Age=900; decoded JWT lifetime was 900 seconds. Logout set Max-Age=0. Secure was absent, as expected under dev. A follow-up check confirmed no B1 temp directory remained. No product data changed.

[A5] Seed data (retry) - PASSED
What I ran: Checked that `DEV_ADMIN_PASSWORD` was exported without printing its value, fetched a CSRF token, logged in as the seeded admin using the cookie jar in a temporary `/tmp` directory, and requested the first product page with `size=1`.
Result: CSRF and login requests succeeded; the authenticated response reported `totalElements=500`. The cookie jar and its temporary directory were removed by the command's exit cleanup. No product data was changed.

[B2] CRUD as ADMIN - FAILED
What I ran: Authenticated as the dev admin; created one `qa-` product, read it, updated its description, deleted it, fetched it again, and checked the product count. The temporary product was removed.
Result: Create/read/update/delete returned 201/200/200/204; the deleted product returned 404 with a sanitized ProblemDetail. Product count returned to 500. The update API did not accept or return a version: `ProductResponse` has no version field and `PUT` performs a read-then-save, so the required version-aware update was not verifiable. No test data remains.
Likely cause / proposed fix: Version is present on the Mongo document but omitted from the API DTO/update contract. Expose a version token and require it on updates, enforce optimistic locking, and add stale-version tests before rerunning B2; no code changes were applied.

[B2] CRUD as ADMIN (rerun) - FAILED
What I ran: Repeated an admin CRUD cycle with a new `qa-` product and supplied `version: 0` on PUT; checked the response shape, post-delete ProblemDetail, and final collection count.
Result: Create/read/update/delete returned 201/200/200/204; create and update responses had no version field. PUT succeeded despite the supplied version, so version concurrency is not enforced through this API contract. Post-delete returned sanitized 404; count returned to 500 and the temporary record was removed.
Likely cause / proposed fix: The request DTO does not declare a version, and the response omits it; the version property in the submitted JSON was not enforced. Add an explicit version-aware update contract and optimistic-locking tests before another B2 run; no code changes were applied.

[B2] CRUD as ADMIN (version-contract rerun attempt) - FAILED
What I ran: Started the approved localhost B2 check using an ephemeral `/tmp` curl cookie jar. The harness failed parsing the initial CSRF response before login or product operations.
Result: No product record was created or changed, and no credentials, tokens, or cookie values were recorded. The temporary cookie-jar directory was removed. The collection count was not queried in this attempt.
Likely cause / proposed fix: The harness split the curl response on the wrong newline representation. Correct the parsing and rerun B2; no application code changes are needed for this harness error.

[B2] CRUD as ADMIN (version-contract rerun) - PASSED
What I ran: Authenticated as admin using a temporary `/tmp` curl cookie jar; created, read, updated, and deleted one `qa-` product using its returned version; fetched the deleted item and checked the collection count. Removed the cookie jar and its temporary directory.
Result: Create/read/update/delete returned 201/200/200/204. Create and read returned a version; PUT with that version succeeded and returned the incremented version. The deleted item returned a sanitized 404 ProblemDetail. Product count was 500 before and after cleanup; final count was 500. No credentials, tokens, or cookie values were recorded.

[B3] Validation probes - FAILED (harness attempt)
What I ran: Started the approved B3 check against localhost with an ephemeral `/tmp` curl cookie jar. The harness failed parsing the initial CSRF response before login or product probes.
Result: No product data was changed, and validation cases did not run. The temporary cookie-jar directory was removed. No credentials, tokens, or cookie values were recorded.
Likely cause / proposed fix: The harness split the curl status and content-type trailer incorrectly. Fix the response parser and rerun B3; no application changes are needed for this harness error.

[B3] Validation probes - FAILED (parser retry)
What I ran: Retried B3 with a right-split parser for curl's status/content-type trailer. Parsing still failed on the initial CSRF response before login or product probes.
Result: No product data changed; validation cases did not run. The temporary cookie-jar directory was removed. No credentials, tokens, or cookie values were recorded.
Likely cause / proposed fix: The response body and curl metadata are still being mixed in the harness output. Save the response body to a private temporary file with curl `--output`, then parse only the separate `--write-out` metadata before retrying; no application change is needed.

[B3] Validation probes (strict JSON rerun) - PASSED
What I ran: Authenticated as admin with an ephemeral `/tmp` curl cookie jar; tested blank name, negative price/stock, oversized name/category/description, unknown server-controlled fields on POST, wrong type, and malformed JSON. Used a `qa-` fixture for the blank-name PUT probe and removed it afterward.
Result: All nine probes returned HTTP 400 ProblemDetail with sanitized bodies and no stack trace or internal class names. The QA fixture was deleted (204), collection count returned to 500, and the temporary cookie jar/directory were removed. No credentials, tokens, or cookie values were recorded.

[B4] Search, pagination, filters, and sorting - PASSED
What I ran: Authenticated read-only GET checks for baseline totals, page-size and offset limits, category/price filters, text search, invalid price range, invalid sort, and repeatable sort ordering. Removed the temporary curl cookie jar/directory.
Result: Baseline and final totals were 500; page size was capped at 100; offset, minPrice > maxPrice, and non-allowlisted sort were rejected with 400 ProblemDetail. Category/price filters, text search, and stable repeated ordering passed. No product data was changed.

[B5] Product stats - PASSED
What I ran: Authenticated GET `/api/v1/products/stats` and an authenticated one-item product-list query; removed the temporary curl cookie jar/directory.
Result: Stats returned 9 categories whose counts sum to 500, all category counts are positive, and all average prices fall within the seeded 5–2000 range. Product list total was also 500. No product data was changed.

[B3] Validation probes (rerun) - FAILED
What I ran: Authenticated as admin with an ephemeral `/tmp` curl cookie jar; tested blank name, negative price/stock, oversized name/category/description, unknown server-controlled fields, wrong type, and malformed JSON. Used a `qa-` fixture for the blank-name PUT case and removed it afterward.
Result: Eight invalid-input probes returned sanitized 400 ProblemDetails. The request containing unknown `id` and `roles` fields was accepted with 201, so the expected unknown-field rejection failed. The unexpected product and validation fixture were both deleted (204); collection count returned to 500. Cookie jar and temp directory were removed; no credentials or token/cookie values were recorded.
Likely cause / proposed fix: Unknown JSON properties are currently ignored during deserialization. Enable strict unknown-property rejection for API request DTOs (or product write DTOs specifically) and add a regression test asserting POST/PUT with an unknown field returns 400 before rerunning B3. No application fix was applied.

[B6] Optimistic locking - PASSED
What I ran: Authenticated as admin with a temporary `/tmp` curl cookie jar; created one `qa-` product, submitted two PUT requests using the same original version, deleted the fixture, and checked the collection count.
Result: The first PUT returned 200 and incremented the version; the stale PUT returned a sanitized 409 ProblemDetail. Product count was 500 before and after cleanup. The temporary cookie jar/directory were removed; no credentials, tokens, or cookie values were recorded.

[B7] Error handling - FAILED
What I ran: Authenticated invalid-request checks for an unknown API route, PATCH to a product path, POST with unsupported `text/plain` media type, and an oversized invalid product payload. Checked response sanitization and product counts; removed the temporary cookie jar/directory.
Result: Unknown route and PATCH returned 403; unsupported media type returned 500; oversized payload returned sanitized 400. Product count remained 500 and no records were created.
Likely cause / proposed fix: The security/method handling appears to reject these paths before they reach the expected 404/405 handlers, and the unsupported-media exception may be falling through to the generic 500 handler. Inspect request authorization/matcher ordering and add explicit sanitized mappings for `HttpRequestMethodNotSupportedException` and `HttpMediaTypeNotSupportedException`, with regression tests. No code changes were applied.

[B7] Error handling (diagnostic rerun) - BLOCKED
What I ran: Read-only inspection of the main security matcher and API exception advice, then attempted to repeat the authenticated invalid-request probes. Login was throttled with HTTP 429 before any B7 probes ran; removed the temporary cookie jar/directory.
Result: Source inspection confirms `.anyRequest().denyAll()` explains the 403 responses for unknown routes and unsupported methods; this is a default-deny policy and can remain. The exception advice has no dedicated `HttpMediaTypeNotSupportedException` handler, consistent with the earlier unsupported-media 500. No product data changed.
Likely cause / proposed fix: Add an explicit sanitized 415 ProblemDetail handler for unsupported media types and a regression test. Keep the 403 behavior (or adjust B7 expectations to the deny-by-default policy) rather than broadly allowing unmatched paths. A repeat runtime check requires the login rate-limit window to reset; it was not awaited.

[B7] Error handling (rerun after QA limiter configuration) - FAILED
What I ran: Authenticated invalid-request checks for an unknown API route, PATCH to a product path, unsupported `text/plain` media type, and an oversized invalid product payload. Checked ProblemDetail sanitization and product counts; removed the temporary cookie jar/directory.
Result: Unknown route and PATCH returned sanitized 403 Access denied ProblemDetails; unsupported media returned a sanitized 500 Internal server error ProblemDetail; oversized payload returned sanitized 400. Product count remained 500, and no product records were created.
Likely cause / proposed fix: The 403s are expected under the security chain's default-deny rule and do not warrant broadening access. Unsupported media still lacks a specific exception mapping; add a sanitized `HttpMediaTypeNotSupportedException` handler returning 415 and a regression test, then rerun B7. No application code was changed.

[B7] Error handling (post-fix rerun) - PASSED
What I ran: Authenticated invalid-request checks for an unknown API route, PATCH to a product path, unsupported `text/plain` media type, and an oversized invalid product payload. Checked ProblemDetail status/sanitization and product counts; removed the temporary cookie jar/directory.
Result: Unknown route and PATCH returned sanitized 403 Access denied ProblemDetails under the default-deny security rule; unsupported media returned sanitized 415 ProblemDetail; oversized payload returned sanitized 400. Product count remained 500 and no records were created. The unsupported-media handler fix is covered by the backend integration test.

[C1] Access-control matrix - PASSED
What I ran: Exercised list, get-by-id, stats, create/update/delete, `/api/v1/auth/me`, unknown API path, `/actuator/env`, Swagger UI, OpenAPI docs, and `/app-test` as anonymous, USER, and ADMIN. Used one `qa-` product for authorized CRUD and removed it; removed all temporary cookie jars.
Result: Anonymous: reads/auth endpoints and denied paths returned 401; dev Swagger UI redirected (302) and OpenAPI returned 200. USER: reads/stats/me returned 200; writes and denied paths returned 403; docs remained public in dev. ADMIN: reads/stats/me returned 200; CRUD returned 201/200/204; denied paths returned 403; docs remained public in dev. Product count was 500 before and after cleanup. Results match `SECURITY.md` role, actuator, and dev-docs claims.

[C2] CSRF checks - BLOCKED (harness)
What I ran: Authenticated as admin, bootstrapped CSRF, and checked the product count before starting the C2 request cases. The harness stopped while constructing the missing-token request before issuing it; removed the temporary cookie jar/directory.
Result: No CSRF mutation probes ran and no product data changed. Product count remained 500. The harness attempted to concatenate a null header value; no application defect was observed.
Proposed fix: Represent an omitted CSRF header by not adding the header argument, then rerun C2. No code changes are needed.

[C2] CSRF checks (corrected harness rerun) - FAILED
What I ran: Authenticated as admin; submitted product POST requests with missing, incorrect, and correct CSRF headers, then DELETE requests against the valid-token fixture. Cleaned up any remaining products with the `qa-c2-` prefix and verified the collection count.
Result: POST with missing and incorrect CSRF headers both returned 201, as did the valid-token POST. DELETE without a CSRF header returned 204; subsequent DELETE attempts returned 404 because that fixture had already been removed. Two other `qa-c2-` records remained after the run; both were deleted (204 each), restoring the product count from 502 to 500. No credentials or token/cookie values were recorded.
Likely cause / proposed fix: The runtime CSRF filter is not enforcing the required cookie/header token match on state-changing product requests, despite the configured `CookieCsrfTokenRepository`. Review the active filter chain and token request handling, add integration coverage for missing/wrong headers on POST and DELETE plus valid-token acceptance, and change the configuration/handler so only the matching submitted header is accepted. No security code was changed.

[C2] CSRF enforcement remediation - TESTS PASSED; runtime rerun pending
What I ran: Added a cookie/header equality guard for unsafe methods using constant-time comparison and the existing sanitized 403 handler; restored use of the configured CSRF cookie repository (including its cookie flags); added integration coverage for missing/wrong POST and DELETE headers and a matching-header DELETE. Ran the focused regression and `./mvnw verify`.
Result: The focused CSRF test passed. Full backend verification passed: 35 tests, 0 failures/errors. The QA dev backend has not yet been restarted, so C2 still needs its localhost runtime rerun against the updated code. No dev product data was changed by these tests.

[C2] CSRF checks (runtime rerun after restart) - PASSED
What I ran: Against `localhost:8080`, bootstrapped the CSRF cookie, logged in as admin, attempted product POST and DELETE with missing, incorrect, and matching `X-XSRF-TOKEN` headers, then removed any `qa-c2-` fixtures and checked the product total. The temporary cookie jar/directory were removed.
Result: Login returned 200; missing/wrong POST and DELETE each returned 403; matching-token POST returned 201 and matching-token DELETE returned 204. Cleanup succeeded and the product count was 500 before and after. No credentials, tokens, or cookie values were recorded.

[C3] Token abuse and stale-cookie checks - PASSED
What I ran: Against `localhost:8080`, tested a tampered signature and an `alg=none` token, then attempted login with a tampered stale access cookie. Also ran the backend security integration class, which covers a valid signed JWT without a roles claim and a validly signed expired JWT. The temporary cookie jar/directory were removed.
Result: Tampered signature and `alg=none` returned 401; stale-cookie login returned 200. Integration tests confirmed role-less token returns 403 and expired token returns 401. All 18 security integration tests passed. No product data changed and no credentials, token values, or cookie values were recorded.

[C4] Login throttling and generic failures - PASSED
What I ran: Submitted failed logins for a nonexistent username and a known username with an incorrect password, compared normalized ProblemDetail fields, then continued failed attempts until throttled or the bounded probe limit. Stopped immediately at the first 429 and removed the temporary cookie jar/directory.
Result: Both initial failures returned 401 with matching sanitized error fields; a later repeated failure returned 429 (on probe 6). The limiter window was not awaited or reset. No product data changed and no credentials or response bodies were recorded.

[C5] Injection probes - BLOCKED
What I ran: Bootstrapped CSRF and attempted the required admin login before sending the JSON-body and product-query injection probes. Removed the temporary cookie jar/directory.
Result: Admin login returned 429, so no C5 injection probes were sent. No product data changed and no credentials, tokens, or cookie values were recorded.
Likely cause / proposed next step: The C4 login limiter window is still active. Wait for the configured QA window to expire, with approval, then rerun C5. No application changes were made.

[C5] Injection probes (after approved limiter wait) - PASSED
What I ran: Logged in as admin and sent operator-shaped JSON to login, bracketed operator syntax and JSON-like category values, injected sort/filter syntax, and a regex-heavy text query. Removed the temporary cookie jar/directory.
Result: Login JSON injection, category operator, sort injection, and filter injection returned 400; JSON-like category input and regex-heavy query returned 200 without errors. Source inspection confirms q is bound through `TextCriteria.matching`, not interpreted as a regular expression. No product mutations were attempted; no credentials, tokens, or cookie values were recorded.

[C6] Mass-assignment checks - BLOCKED
What I ran: Logged in and read the product baseline, then attempted to create the required `qa-c6-` fixture before the POST/PUT mass-assignment cases. Removed the temporary cookie jar/directory.
Result: Login succeeded but fixture creation returned 403 and no product id, so no mass-assignment payloads or PUT request were sent. No product write was confirmed.
Likely cause / proposed next step: The 403 may be a role authorization or CSRF rejection. Confirm the authenticated role and request token/cookie match without exposing credentials, then retry C6. No application changes were made.

[C6] Mass-assignment checks (diagnostic rerun) - BLOCKED
What I ran: Reauthenticated against `localhost:8080`, checked `/auth/me`, confirmed the reported role was ADMIN, and confirmed the CSRF response token matched the CSRF cookie. Retried the initial `qa-c6-` fixture creation; removed the temporary cookie jar/directory.
Result: Login and `/auth/me` returned 200; the role check and CSRF cookie/header comparison passed. Product creation still returned 403 with no fixture id, so no mass-assignment payload was submitted and no product write was confirmed. No credentials, tokens, or cookie values were recorded.
Likely cause / proposed next step: Since ADMIN role and token/cookie equality are confirmed, the 403 appears to come from another security or request-processing layer. Inspect the sanitized failure response and active security chain, then rerun C6; obtain separate approval before changing application code. No application changes were made.

[C6] Mass-assignment checks (approved diagnostic retry) - BLOCKED
What I ran: Inspected the product authorization and CSRF filter rules, then bootstrapped CSRF on `localhost:8080` and attempted admin authentication using only exported environment variables. Removed the temporary cookie jar/directory.
Result: CSRF bootstrap returned 200 and the token matched its cookie. Admin login returned 400 because the required admin credential variables were not available in this shell; the request stopped before any product endpoint was called. No fixture or product mutation was created. No credentials, tokens, or cookie values were recorded.
Likely cause / proposed next step: The current process does not have the required admin login variables exported. Export the approved admin username/password variables in the execution environment, then retry C6. No application code changes were made.

[C6] Mass-assignment checks (credential availability retry) - BLOCKED
What I ran: Checked whether the approved admin username and password environment variables are present, without reading or printing their values.
Result: The admin password variable is present, but the admin username variable is missing. Per the QA credential rule, no username was guessed or searched for and no localhost API request was made. No product data changed.
Likely cause / proposed next step: Export `DEV_ADMIN_USERNAME` for this QA process, then retry C6. No application code changes were made.

[C6] Mass-assignment checks (retry after user export) - BLOCKED
What I ran: Checked the execution environment for the required admin credential variables before making any localhost request.
Result: `DEV_ADMIN_USERNAME` is still unavailable to the QA runner, so the retry stopped immediately. No login attempt, product request, or product mutation occurred. No credential values were read or recorded.
Likely cause / proposed next step: The export was made in a terminal environment not inherited by this QA execution process. Make the variable available to the process running the QA tools (without sharing its value in chat), then retry C6. No application code changes were made.

[C6] Mass-assignment checks (environment recheck) - BLOCKED
What I ran: Rechecked only whether `DEV_ADMIN_USERNAME` and `DEV_ADMIN_PASSWORD` are exported into the QA runner environment.
Result: The password variable is present, but the username variable remains unavailable. No API request or product mutation was attempted; no secret values were read or recorded.
Likely cause / proposed next step: The username export still is not inherited by the QA process. Make it available in the environment that launches this runner, then request another C6 retry. No application code changes were made.

[C6] Mass-assignment checks (environment recheck 2) - BLOCKED
What I ran: Rechecked presence only for the approved admin username and password environment variables in the QA execution process.
Result: `DEV_ADMIN_USERNAME` remains unavailable while `DEV_ADMIN_PASSWORD` is present. No API calls or product writes were attempted; no credential values were read or logged.
Likely cause / proposed next step: The QA command runner is not inheriting the username export. Restart/relaunch the QA host with the variable exported in its parent environment, or use an approved mechanism that injects it into this process; then retry C6. No application code changes were made.

[C6] Mass-assignment checks (using documented dev username defaults) - FAILED
What I ran: Confirmed `admin` and `user` are the dev usernames from `DevUserSeeder` and `application-dev.yml` (without reading `.env`). Authenticated as `admin`, attempted POST with extra server-managed fields, created a normal `qa-c6-` fixture, attempted PUT with extra fields, read the fixture, deleted it, and checked the collection total.
Result: Admin login and reads succeeded; baseline was 500. POST containing extra fields was rejected with 400. Normal fixture creation returned 201. PUT containing extra fields returned 403; a subsequent GET showed its name, id, and version unchanged. The createdAt comparison differed between create and read responses, so preservation was not conclusively verified at raw string precision. Cleanup DELETE returned 204 and total returned to 500. No credentials, tokens, or cookie values were recorded.
Likely cause / proposed fix: The unexpected PUT 403 needs its sanitized ProblemDetail and active filter/authorization path inspected; it may be CSRF validation or role authorization. Retry with response diagnostics and a single synchronized CSRF cookie/header. Normalize createdAt comparisons to MongoDB's persisted millisecond precision. No application code changes were made.

[C6] Mass-assignment checks (fresh CSRF diagnostic rerun) - BLOCKED
What I ran: Repeated the C6 checks as documented dev user `admin`, refreshed CSRF before each unsafe request, verified each response token matched the single CSRF cookie, captured only the sanitized PUT ProblemDetail fields, checked persisted fields at millisecond timestamp precision, and cleaned up the fixture.
Result: Login returned 200 with ADMIN role; baseline was 500. POST with extra fields returned 400; normal fixture creation returned 201. PUT with extra fields still returned 403 `Access denied` despite the ADMIN role and matching CSRF token/cookie. Follow-up GET showed name, id, version, and createdAt unchanged. Cleanup returned 204 and total returned to 500. No credentials, tokens, or cookie values were recorded.
Likely cause / proposed next step: The 403 is not explained by CSRF equality or the reported role. Run a focused version-aware PUT without extra fields against a qa fixture to determine whether all admin PUTs are denied or only this payload path; inspect the active filter-chain behavior before any code change. No application code changes were made.

[C6] Focused ordinary admin PUT diagnostic - FAILED
What I ran: Authenticated with the documented `admin` username, confirmed `/auth/me` reported ADMIN, created a normal `qa-c6-` fixture, refreshed CSRF before a version-aware PUT without extra fields, read the product, then deleted the fixture and checked the total.
Result: Baseline was 500 and create returned 201. Ordinary version-aware PUT returned 403 `Access denied`; GET confirmed the name and version were unchanged and createdAt was preserved at millisecond precision. Cleanup returned 204 and total returned to 500. No credentials, tokens, or cookie values were recorded.
Likely cause / proposed next step: Admin PUT is denied even without mass-assignment fields, while admin POST works. Inspect filter-chain matching and runtime authorization/CSRF behavior; do not change application code until approved. No application code changes were made.

[C6] Read-only investigation of the apparent PUT denial - ROOT CAUSE FOUND
What I ran: Inspected the active filter-chain matchers, CSRF filter, JWT role conversion, controller/service, and existing admin PUT integration tests; did not access `.env` or send runtime requests.
Result: Security configuration allows `PUT /api/v1/products/**` for ADMIN, and the integration test covers successful admin PUT. The prior QA harness invoked `curl --data-binary` without `-X PUT`; curl therefore sent POST to `/api/v1/products/{id}`, which falls through to the default-deny rule and returns 403. This explains the observed status as a harness method error, not an application authorization defect. No application code or product data changed during this read-only investigation.
Proposed fix: Rerun C6 using an explicit `-X PUT` and the version-aware request body, with the same qa-prefix cleanup/count verification. No application code changes are needed.

[C6] Mass-assignment checks (corrected HTTP method) - PASSED
What I ran: Authenticated as documented dev user `admin`; sent POST with injected id/version/createdAt/roles; created a normal `qa-c6-` fixture; sent an explicit `-X PUT` with the current version plus injected id/createdAt/roles; read the fixture; deleted it and checked the total.
Result: Admin login and `/auth/me` succeeded; baseline was 500. POST with extra fields returned 400. Normal create returned 201. Correct PUT with extra fields returned 400; GET confirmed name, id, version, and createdAt (at persisted millisecond precision) remained unchanged. Cleanup returned 204 and final total was 500. The prior 403s came from the harness omitting `-X PUT`, which made curl send POST to the item URL. No credentials, tokens, or cookie values were recorded; no application code changed.

[C7] CORS origin/method/header checks - FAILED
What I ran: Sent read-only preflight requests to `localhost:8080` for origins `http://localhost:5173`, `http://127.0.0.1:5173`, and `http://evil.example`; also tested disallowed PATCH and `x-not-allowed` header requests. Recorded only statuses and CORS headers.
Result: `http://localhost:5173` preflight for PUT returned 200 with that exact ACAO origin, credentials enabled, and only configured methods/headers. The `127.0.0.1` origin returned 403, though the checklist expects it allowed. `evil.example`, PATCH, and `x-not-allowed` were all rejected with 403. No wildcard origin was observed and no data changed.
Likely cause / proposed fix: The active runtime CORS configuration does not include `http://127.0.0.1:5173` (possibly due an environment override). Add that exact origin to the dev CORS allowlist, without using `*`, restart the backend, and rerun C7. No application code changes were made.

[C7] CORS configuration follow-up diagnosis - CAUSE NARROWED
What I ran: Read `application-dev.yml`, `application-test.yml`, the `@Value` binding in `SecurityConfiguration`, and the Vite/API base URL configuration; repeated read-only preflights to `localhost:8080` for localhost, loopback, and an untrusted origin.
Result: Both Spring YAML profiles correctly specify both exact frontend origins at `app.security.cors.allowed-origins`. Runtime still allows only `http://localhost:5173` (200 with explicit ACAO and credentials), while `http://127.0.0.1:5173` and `evil.example` receive 403. Vite's API client defaults to relative `/api`; an absolute `VITE_API_BASE_URL` would cause browser CORS checks, while the dev proxy uses `VITE_BACKEND_PROXY_TARGET`. `.env` was not opened and no values were read.
Likely cause / proposed fix: The runtime effective property differs from the YAML: likely `CORS_ALLOWED_ORIGINS` or `APP_SECURITY_CORS_ALLOWED_ORIGINS` environment override, command-line override, active-profile/config import mismatch, or a different/stale application instance. Confirm the active backend profile and whether the effective allowlist contains both exact origins; do not use a wildcard. No application code or data changed.

[C7] Runtime source verification and corrected restart attempt - BLOCKED
What I ran: Inspected host listener/process metadata using a strict allowlist of non-secret fields, checked only relevant environment/config-source keys, confirmed the Spring profile, stopped the single verified backend/Maven process as part of the requested restart, and launched once with an exact two-origin command-line allowlist. Checked the debug session and port once after launch.
Result: The sole backend listener was the project Spring Boot main class under Maven, profile `dev`; no duplicate listener/container was found. Its inherited `CORS_ALLOWED_ORIGINS` was `http://localhost:5173`, overriding the correct YAML default. No JVM/CLI CORS/profile override or external Spring config location/import was found in process metadata. The debug launch did not remain active and port 8080 is now unreachable; the launch environment lacks `JWT_SECRET`. No secret values or `.env` contents were exposed or modified. No code/config files were changed; only this QA report was updated.
Likely cause / proposed next step: Start the backend from an environment that already has its required secret variables, overriding only `CORS_ALLOWED_ORIGINS` with the two exact origins. Do not share secret values. Once the user confirms the backend is up, rerun the three CORS checks. No automatic relaunch was attempted after the failed start.

[C7] CORS checks (after user restarted with corrected runtime allowlist) - PASSED
What I ran: Sent read-only OPTIONS preflights to `localhost:8080` for `http://localhost:5173`, `http://127.0.0.1:5173`, and `http://evil.example`, requesting GET with the configured content-type and CSRF headers. Captured status and CORS response headers only.
Result: `localhost` returned 200 with exact ACAO and credentials=true; `127.0.0.1` returned 200 with exact ACAO and credentials=true; `evil.example` returned 403 with no ACAO/credentials headers. No wildcard origin was returned and no data changed. No secrets or `.env` contents were accessed.

[C8] Headers and leakage - PASSED
What I ran: Checked localhost health, actuator/env, anonymous auth, unknown API, and dev-only docs responses; made one admin login using only the exported password variable and documented default username, then checked authenticated `/auth/me`, product list, and actuator/env. Inspected only the relevant checked-in management/docs settings; no credential, token, cookie, or response body was printed during the authenticated checks.
Result: Security headers included `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and no-cache directives on anonymous and authenticated responses. No `Server` or `X-Powered-By` header was present. Health returned only `{"groups":["liveness","readiness"],"status":"UP"}`; authenticated `/actuator/env` returned 403. Docs were available in the active dev profile as configured; global docs defaults are disabled and only health is configured for Actuator exposure. Sampled auth failure returned a sanitized ProblemDetail without stack trace/class details. No product data or files other than this QA report changed.

[C9] Log hygiene - BLOCKED
What I ran: Searched the workspace for backend `.log` files and checked for a running Java/Maven process using only process IDs and executable names. Did not inspect `.env`, print process arguments, or access credentials, tokens, cookies, or request bodies.
Result: No backend log files were present in the workspace, and no backend Java/Maven process was visible to this QA runner, so there were no accessible test-period logs to scan. No secrets or cookie values were exposed, and no application or data state changed.
Likely cause / proposed next step: The backend runs in a separate terminal/environment whose output is not available to this runner. Provide an accessible log file path or make the relevant terminal log available (without sharing unredacted secrets); then retry C9. This report does not claim that inaccessible logs were clean.

[C9] Log hygiene (retry after backend restart) - BLOCKED
What I ran: Rechecked backend-scoped `.log` files and Java process stdout/stderr targets after the user restarted the backend. Reported only whether log paths/targets were accessible; did not inspect process arguments or print any log content.
Result: No backend `.log` file was found and no Java process/output target was visible in this QA runner, despite the backend being restarted in the user's VS Code terminal. Thus no test-period logs could be scanned; this does not establish that the logs are clean. No application or data state changed.
Likely cause / proposed next step: The VS Code terminal/process is outside this runner's visible filesystem/process namespace. Provide an accessible, appropriately redacted log file or share the VS Code terminal output through an approved mechanism; then retry C9. Do not paste credentials, JWTs, or cookie values.

[C9] Log hygiene (one-shot traffic and scan) - INCOMPLETE
What I ran: Ran the six requested localhost requests in a 60-second one-shot process and scanned `logs/backend-qa.log` without printing matching lines or secret values. The process read both password variables from the environment; no product write was accepted and the product total remained 500.
Result: Statuses were wrong login 401, ADMIN login 200, tampered cookie 401, no-CSRF product POST 403, validation product POST 403, and operator-login payload 403. The tampered-cookie response cleared the script's shared cookie jar, so the last two requests did not verify the intended authenticated validation/injection paths. Log matches: canary 0 (lines none); admin password 0 (none); user password 0 (none); JWT-like 0 (none); Cookie/Set-Cookie values 0 (none); request-body markers 0 (none); logged stack markers 0 (none); client response stack traces 0 (none). The temporary QA runner script was removed. No product data changed.
Likely cause / proposed fix: The QA harness merged the tampered-cookie response's clearing cookie into the valid ADMIN cookie jar. Use an immutable copy of the valid ADMIN cookies for later requests, then rerun C9 with a fresh log capture. No production code change is indicated.

[C9] Log hygiene (corrected one-shot rerun) - PASSED
What I ran: Used a non-interactive run with a 60-second timeout to generate the six requested localhost requests, preserving a separate valid ADMIN cookie snapshot after the tampered-cookie probe. Scanned only log bytes appended during this run; compared the canary and environment password values in memory and did not print any matching text.
Result: Statuses were wrong login 401, ADMIN login 200, tampered cookie 401, no-CSRF product POST 403, validation product POST 400, and operator-login payload 400. Product total remained 500 before and after; cleanup was not needed. Log matches: canary 0 (lines none); admin password 0 (none); user password 0 (none); JWT-like strings 0 (none); Cookie/Set-Cookie values 0 (none); request-body markers 0 (none); backend stack markers 0 (none); client response stack traces 0 (none). No matching lines or secret values were exposed.

[A5] Seed data (recheck after Mongo test-profile isolation) - PASSED
What I ran: Authenticated as the dev `user` account using only its exported password variable, then requested the first page of products from `localhost:8080`. No writes were sent.
Result: Login returned 200; product list returned 200 with `totalElements=500`. No product data changed.
