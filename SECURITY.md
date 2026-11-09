# Backend security

## Authentication and cookies

- Authentication uses short-lived, stateless HS256 JWTs with a default
  lifetime of 900 seconds. `JWT_SECRET` must be supplied through the
  environment and contain at least 32 UTF-8 bytes outside the `test` profile.
- Login returns the username and roles in JSON and sets the JWT only in the
  `ACCESS_TOKEN` cookie. The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure`
  in every profile except `dev`.
- The frontend must not put tokens in `localStorage` or expose the access JWT
  to JavaScript. Send browser requests with credentials enabled.
- Because cookies are sent automatically, unsafe requests require the
  double-submit CSRF token: first GET `/api/v1/auth/csrf`, retain its
  `XSRF-TOKEN` cookie, and send the returned token in `X-XSRF-TOKEN`. The CSRF
  cookie is intentionally readable by JavaScript; the JWT cookie is not.
- The custom `CookieCsrfHeaderFilter` requires exactly one nonblank CSRF cookie
  and a matching nonblank header on unsafe requests, comparing values without
  trimming or normalization. Empty or Java `String.isBlank()` whitespace-only
  values return the same 403 ProblemDetail as missing/mismatched CSRF material.
  Duplicate CSRF cookies are rejected; safe-method behavior is unchanged.
- Spring Security's resource-server configuration exempts requests recognized
  by its bearer authentication converter from Spring's `CsrfFilter`. Because
  this application resolves bearer JWTs from a cookie, the custom filter is
  responsible for enforcing the cookie/header contract on those requests.
  Do not remove it on the assumption that the framework filter checks again.
  Login ignores stale access cookies and still follows the CSRF bootstrap flow.
- POST `/api/v1/auth/logout` clears the browser's JWT cookie. A stateless JWT
  cannot be individually revoked after it has been copied; a stolen token can
  remain valid until its short expiry. Deleted users or changed roles likewise
  take effect in tokens only after expiry; keep production lifetimes at 15–30
  minutes.
- The token includes issuer `spring-react-demo`, which is validated when
  decoding. Login and CSRF endpoints ignore any stale access-token cookie so
  users can recover by obtaining a fresh CSRF token and logging in again.

## Authorization and credentials

- `USER` and `ADMIN` can read products and access authenticated product stats;
  only `ADMIN` can create, update, or delete products.
- User passwords are stored as BCrypt hashes in the `users` collection. The
  dev-only seeder reads `DEV_ADMIN_PASSWORD` and `DEV_USER_PASSWORD`; never put
  real values in source control.
- CORS uses exact origins from the comma-separated `CORS_ALLOWED_ORIGINS`
  environment variable; wildcard origins are rejected. Development defaults
  to both `http://localhost:5173` and `http://127.0.0.1:5173`; the test profile
  also configures those two exact origins. In `dev`, an exported
  `CORS_ALLOWED_ORIGINS` replaces the entire default list rather than adding
  to it, so an old single-origin export can reject the other origin despite
  the YAML defaults. Use `http://localhost:5173` for the repository's QA
  browser runs. No wildcard or broader origin policy is needed.
- Login attempts are limited to five per client IP per configurable window
  (15 minutes by default) in a bounded in-memory limiter. Configure the window
  with `LOGIN_RATE_LIMIT_WINDOW`; it must be positive. The limiter is
  process-local and resets on restart; deploy a shared limiter for
  multi-instance production deployments.
- MongoDB search filters are validated, sort fields are allowlisted, page
  offsets and sizes are bounded, and text search uses the declared text index.
- Product responses expose a server-managed version. PUT requests must include
  the version they read; stale versions and concurrent Mongo writes return
  HTTP 409 ProblemDetail rather than silently overwriting changes. The client
  must use the new version returned after each successful update.
- Only the Actuator health endpoint is exposed, with health details hidden.
  Spring Security's default security headers remain enabled, including
  content-type options, frame protection, and HTTPS-only HSTS; framing is set
  to `DENY`.
- Swagger UI (`/swagger-ui.html`, `/swagger-ui/**`) and OpenAPI documents
  (`/v3/api-docs/**`) are publicly viewable only with the `dev` profile. They
  are disabled and remain blocked in all other profiles.

## Local setup

Copy `.env.example` to `.env`, replace every placeholder with unique local
values (generate a JWT secret with `openssl rand -base64 48` and use strong
dev-user passwords), then export the variables before launching the backend.
The `.env` file is ignored by Git and must never be committed.

The `test` Spring profile is for automated tests only and must never be used
outside tests. Full Boot tests use owned, non-reusable Mongo Testcontainers
through test-scoped service connections; no external `MONGODB_TEST_URI` is
supported and there is no fallback to development `MONGODB_URI`. A test-only
initializer masks external URI/database properties and requires owned-container
wiring before normal client initialization; a settings guard checks the
container endpoint after standard Boot customization. Unit tests with mocked
persistence remain Docker-free.

Integration tests require local Docker and may acquire the pinned Mongo and
cleanup/startup-check images, create ephemeral ports and use the Docker socket
for cleanup. They do not own the development Compose service or its volume.
Do not use remote Docker discovery/host overrides, custom Mongo-client/settings
beans, disabled cleanup or reusable containers with this setup without a new
isolation review. Live tests write only qa-owned fixtures in the isolated
container and clean them up. Missing Docker must fail, never skip integration
tests or select an external database. See [backend test prerequisites](README.md#backend-tests-and-coverage).
The I2 focused Maven build and 21 Docker-free guard checks passed on 2026-11-09.
The full no-database-environment build then failed with 25 context errors in
289 tests: the test guard's injected provider excludes its own bean and trips
the order assertion. No guard was disabled or bypassed. The approved test-only
remediation uses a bean-factory provider lookup and adds three Spring-wiring
regressions while retaining order/endpoint rejection. The corrected focused
build and all 24 Docker-free checks passed, including the three new wiring
regressions. The full rerun still failed with 25 context errors in 292 tests:
the guard ties at lowest precedence with Boot's unordered Mongo metrics
customizers and is not last. No order/endpoint check was relaxed. Test-only
late guard registration and four additional regressions were implemented
under approval. The corrected focused build now passes all 28 checks with zero
failures/errors/skips. The latest working-tree full build subsequently passed
296 tests with no failures/errors/skips and no database environment variables.
Registration moves only the owned
guard definition before instantiation; native metrics customizers and the
final-order/owned-endpoint checks remain intact. The added metrics-chain tests
assert that both native listeners remain installed and a later customizer is
still rejected; both assertions passed in the latest focused run. The earlier
24-check pass predates this registration change.
Live owned-container ping/endpoint isolation and product persistence/auditing/
optimistic-locking/cleanup regressions passed. Cleanup confirmed no remaining
test containers and unchanged development Mongo state. Actual unavailable-Docker
verification subsequently passed in an isolated offline run: host Docker
sockets/networking and database/credential variables were inaccessible, Maven
failed with the exact Docker-required message, and both scoped integration
tests reported expected context-startup errors with no skips. A temporary
writable artifact-cache copy resolved the harness's read-only file-lock issue;
the original cache and isolation guards were unchanged. No downloads, Docker
commands or development-service changes were needed. User-committed fresh-clone
proof is now the only remaining I2 acceptance check; the working-tree result
and negative check alone do not complete I2.

For QA checklist sections A–C, the login limiter may temporarily use a
two-minute window by setting `LOGIN_RATE_LIMIT_WINDOW=2m` when starting the
backend. After QA, restart without that override (or restore the setting to
`15m`) to return to the default window. The runtime value is read at startup.

## Frontend development headers — not a production deployment policy

Vite's development server supplies `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, and an enforced Content-Security-Policy.
The policy limits scripts to the same origin plus the exact reviewed React
Refresh bootstrap hash; template drift fails startup until reviewed. Inline
script attributes, objects and frames are blocked, framing is denied, and
base/form destinations are restricted to the same origin. No unsafe-eval,
arbitrary inline JavaScript, wildcard origins or shared nonce is allowed.

Development style elements/attributes remain allowed for Emotion/MUI/Recharts;
this is an explicit dev-only CSP limitation, not a strict nonce-based style
policy. The existing Google Fonts CSS/font origins are the only external style/
font exceptions. HMR permits only `ws://localhost:5173`; API access remains
same-origin through the configured dev proxy. QA browser checks block external
traffic, including fonts, and use fallback fonts. No real credentials or data
are needed for the mocked header/UI/HMR smoke tests.

These headers apply only to the development serving command, not production
builds or Vite preview. Built static files do not carry HTTP response headers.
The eventual HTTPS serving layer must define and test its own CSP, framing,
nosniff and other deployment headers; do not copy dev style/HMR exceptions into
production. Production hosting, API/font origins and nonce/hash handling for
runtime styles remain separate decisions. CSP-strength findings may remain
for dev inline styles; informational SPA detection is retained, not suppressed.

Vite may automatically restart when its configuration changes; reload the
frontend after it is ready. If it exits, restart it manually using the documented
frontend command. Backend/Mongo do not need a restart for frontend header changes.

## Standalone HTML server candidate

The separate Node server is an opt-in serving path, not a change to Vite dev or
backend authentication. Production bootstrap requires exactly one well-formed
server-provided style nonce. It is never stored in browser storage. A nonce is
not a login token; authorization still belongs to Spring Security.

HTML responses use a fresh 192-bit cryptographic nonce for CSP and the Emotion
cache. They are no-store without ETag/Last-Modified; conditional HTML requests
receive a new document, not a mismatched 304. Do not let an upstream HTML cache
reuse documents/nonces or rewrite the CSP independently. Same-document React
navigation retains its cache; separate documents receive independent nonces.

The enforced candidate has no unsafe-inline/eval, wildcard or dev WebSocket
allowance. Style elements require the nonce or an explicitly allowed stylesheet
origin; style attributes have a separate none directive. Existing exact Google
Fonts origins remain permitted; no font downloads or broader hosts were added.
React/MUI/chart CSSOM compatibility must still be tested in browsers; offline
checks do not justify declaring the prior H2 CSP warnings resolved at runtime.
The production build fails closed under plain static hosting/Vite preview,
which do not perform nonce substitution. The existing Vite development policy
and its accepted dev-only residual warnings remain unchanged.

Only validated startup build assets are served, not request-selected files.
Index/asset sizes, aggregate bytes, entry count and directory depth are bounded;
symlinks, special files, hidden asset names, source maps and unexpected asset
types are rejected. Deployment inputs must remain trusted and immutable during
startup; these checks do not defend against every hostile concurrent filesystem
mutation. No source, local environment, management or Swagger path is served by
the SPA fallback. Unknown HTML navigation gets a nonce-protected React 404.

The proxy target is a required server-only HTTP(S) origin, never a request/header
value. Only `/api` is forwarded. Request bodies are capped at 64 KiB, responses
at 4 MiB, in-flight API requests at 16 and upstream operations at ten seconds.
Hop-by-hop and spoofable client forwarding headers are stripped. Origin, cookie
and CSRF inputs are forwarded unchanged for backend validation; Set-Cookie
entries/statuses/ProblemDetail bodies are not rewritten. The proxy does not
follow redirects or enable CORS. Gateway errors are sanitized and logs do not
include request paths/bodies, header values, tokens or configuration secrets.

The backend currently keys throttling on its socket peer, so clients behind
this proxy can share a limiter bucket. Do not blindly trust forwarded IP
headers to fix that: a trusted ingress/client-IP/shared-limiter design needs
separate approval. Production also needs an HTTPS ingress with appropriate HSTS,
exact public-origin configuration and header/cache verification. The local HTTP
candidate is not an approved public production deployment. No cookie security
flag should be weakened to work around missing TLS.
