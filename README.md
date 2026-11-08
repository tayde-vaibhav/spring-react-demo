# spring-react-demo
## Structure
- backend/ — Spring Boot API
- frontend/ — React application
- docs/ — project notes and decisions
## Setup

For the backend's MongoDB, environment-variable, and `dev` profile setup, use
the [MongoDB development setup](#mongodb-development-setup) below. The backend
requires those settings; running `spring-boot:run` without them will not
complete startup.

After the backend is running, prepare the frontend in a second terminal.
Create the ignored local environment file from
[the frontend example](frontend/.env.example) only if it does not already
exist; preserve any existing local settings:

```bash
cd frontend
cp -n .env.example .env
```

In that frontend-local file, configure `VITE_BACKEND_PROXY_TARGET` as
`http://localhost:8080` and leave `VITE_API_BASE_URL=/api` for local development.
The proxy target is required by the development Vite configuration. Then, from
`frontend/`, install and start the app:

```bash
npm ci
npm run dev
```

Open `http://localhost:5173` to use the authenticated product workspace: login,
products, and the category dashboard. The typed API client calls
`/api/v1/auth/*` and `/api/v1/products*`; Vite forwards `/api` requests to
`VITE_BACKEND_PROXY_TARGET` without rewriting their paths.

`VITE_BACKEND_PROXY_TARGET` selects the backend for the **development proxy**.
`VITE_API_BASE_URL` selects the **browser's API base** (default `/api`), and is
embedded at build time for production builds. Production hosting must route
that base to the API, or use an explicitly permitted API origin with compatible
cookie/CORS settings; Vite's dev proxy is not included in built assets. Never
put passwords, JWT secrets, or tokens in `VITE_*` variables.

The legacy `GET /app-test` controller is not used by this frontend and is
blocked by the backend's default-deny security rules; it is not a public
connectivity check. Use the health check documented below instead.

## Frontend development security headers

`npm run dev` adds a development-only CSP, `X-Frame-Options: DENY` and
`X-Content-Type-Options: nosniff` through [the Vite config](frontend/vite.config.ts)
and [header helper](frontend/security-headers.ts). The existing environment-based
API proxy is unchanged. React Refresh's exact reviewed inline bootstrap is
authorized by a SHA-256 hash; an installed-template change fails startup until
reviewed. Arbitrary inline scripts and unsafe-eval are not enabled.

Emotion/MUI/chart inline styling remains a documented dev-only exception. The
existing exact Google Fonts style/font origins remain permitted, while automated
QA browser traffic is restricted to localhost and uses fallback fonts. HMR is
allowed at `ws://localhost:5173`. See [the security limitations](SECURITY.md#frontend-development-headers--not-a-production-deployment-policy).

Changing the Vite config can automatically restart the frontend. Reload once it
is ready; if it exits, run `npm run dev` again from `frontend/`. No backend or
Mongo restart is needed for these changes. Tests using mocked API data need no
passwords and do not create products:

```bash
cd frontend
npm run test -- security-headers.test.ts
npm run test:e2e -- e2e/security-headers.e2e.ts
```

The browser smoke requires the existing local frontend and cached Chromium; it
does not start services or download a browser. It tests real header/CSP behavior,
rendering, chart navigation and state-preserving Fast Refresh with intercepted
test-only API/module responses, without editing app source or contacting outside
hosts. Screenshots, traces, videos and stored authentication state stay disabled.

Production builds and Vite preview do not install this dev policy. Static build
files cannot set HTTP headers: the eventual HTTPS/static/reverse-proxy host
needs a separately approved and verified production policy. Dev style/HMR
exceptions and a successful localhost check are not production hardening.
Informational SPA detection and any residual CSP warnings remain visible in QA.

## Standalone frontend HTML server (nonce CSP candidate)

The separate [Node HTML server](frontend/server/start.mjs) serves the production
build and proxies only `/api` to a configured backend origin. It does not start
Spring Boot or MongoDB. This is an implementation candidate: offline checks do
not certify browser compatibility, real proxy/authentication behavior or HTTPS
deployment. Those require the separately approved next verification phase.

Use only one frontend server on port 5173. For nonce-server/proxy QA, stop Vite
with **Ctrl+C in the terminal running it** before starting this server. The
existing VS Code Vite tasks and `npm run dev` start the development server, not
this standalone server; do not launch them during these checks.

If no current production build exists, first build it from the repository root
(a build is not required on every launch):

```bash
cd frontend
VITE_API_BASE_URL=/api npm run build
```

After the approved port handover, run the following in a dedicated terminal
from the repository root, using the existing build:

```bash
cd frontend
FRONTEND_API_PROXY_TARGET=http://localhost:8080 \
FRONTEND_HOST=localhost \
FRONTEND_PORT=5173 \
npm start
```

Wait for `Frontend HTML server ready`, then open `http://localhost:5173`.
This is a foreground command: keep that terminal open and press **Ctrl+C in
that same terminal** to stop only this frontend server. Run the same launch
command after stopping it when a restart is needed. It supplies the nonsecret
server settings for that invocation; no backend/Mongo restart is required.
If port 5173 is occupied, identify its owner and stop the intended frontend
manually rather than killing an unknown process or silently using another port.

Use `http://localhost:5173` for local QA with the existing backend `dev` profile.
Do not run these service commands as part of an unapproved agent check. The
server does not automatically read a local environment file; export the
server-only variables listed in [the frontend example](frontend/.env.example).
`FRONTEND_API_PROXY_TARGET` is required and must be an HTTP(S) origin without
credentials, query, fragment or extra path. `FRONTEND_HOST` defaults to localhost
and `FRONTEND_PORT` to 5173; do not expose a public listener without deployment
approval. Unlike the Vite variable, this target stays in the server process.

Each HTML response receives a fresh 192-bit random nonce shared by its CSP and
one bootstrap meta element. An explicit Emotion cache applies it to generated
style elements, including global styles. HTML is `no-store`, has no validator,
and is regenerated even for conditional requests; static assets are indexed
into a bounded startup snapshot and cached for one hour. Rebuild and restart
this server after build changes rather than expecting HMR.

The candidate enforces nonced style elements, `style-src-attr 'none'`, same-origin
scripts/API requests, and the existing exact font hosts. It has no inline-script,
unsafe-eval, wildcard or HMR allowance. Plain `vite preview`/static file hosting
does not replace the nonce marker: the production bootstrap intentionally fails
closed there. `npm run dev` keeps its existing dev-only policy and nonce-free
Emotion behavior; source edits can still trigger normal Vite HMR/reload.

The HTTP server must sit behind a separately configured HTTPS boundary in
production; preserve Secure cookies and configure backend CORS with the exact
public UI origin. Do not rewrite cookie flags to make HTTP production work.
The proxy strips client-supplied forwarding metadata, and the current backend
limiter sees the proxy peer IP, potentially grouping clients into one bucket.
Trusted client-IP attribution/shared limiting needs separate backend/deployment
design before public use. See [the security boundaries](SECURITY.md#standalone-html-server-candidate).

Offline regressions use owned temporary build fixtures, mock requests and a
mocked HTTP transport; they never listen on a port or contact the backend:

```bash
cd frontend
npm run test -- server src/style-cache.test.ts
```

## Backend tests and coverage

Before running backend tests, export `MONGODB_TEST_URI` for a dedicated test
database, never the development database. The `test` profile requires this
variable with no fallback to `MONGODB_URI`; use that profile only for automated
tests. Do not put credentials in commands or commit them to this repository.

From `backend/springreactdemo/`, run:

```bash
./mvnw clean verify
```

JaCoCo `0.8.16` collects coverage in Maven's test JVMs and generates HTML and
XML reports during `verify`. Java 25 is supported (see the
[JaCoCo release notes](https://www.jacoco.org/jacoco/trunk/doc/changes.html)).
Report paths, relative to the backend module:

- HTML: `target/site/jacoco/index.html` (open locally after a successful build).
- XML: `target/site/jacoco/jacoco.xml`.
- Execution data: `target/jacoco.exec`.

The first run may download the plugin and its dependencies from Maven Central.
All reports stay under the Git-ignored `target/` directory. The agent writes
to a file, not a network listener; it does not attach to the running backend,
so no backend restart is required. No minimum coverage gate or report
exclusions are configured initially. Coverage shows executed lines/branches,
not assertion quality, and does not include browser activity against the
separately running application.

## Collection ownership and regression checks

Product tags/specifications, user roles and API collection components take
defensive snapshots on input and exposure. Nested specification maps/lists
are copied, not merely wrapped. Returned containers are unmodifiable; callers
must use a new request or the entity setter to replace data rather than mutate
a getter's return value. Spring collaborators are still constructor-injected,
not copied.

Optional null collections, null specification values, numeric types and existing
Jakarta validation rules are preserved. Null tag elements and ordinary invalid
specifications still produce field-level validation errors. To avoid unbounded
copying, cyclic programmatic specifications and trees exceeding 64 nesting levels
or 100,000 visited nodes are rejected. Those limits exceed the supported specs
validation envelope; extreme JSON inputs rejected during construction receive
400 ProblemDetail rather than an internal error. Unsupported non-JSON leaf
objects are still the validator's responsibility, not deep-cloned objects.

The following focused command runs all collection regression tests plus the
existing isolated service/validation/rate-limiter/CORS unit tests, without a
Spring application context or database connection (from the backend module):

```bash
./mvnw -o -Dtest=CollectionSnapshotsTest,CollectionOwnershipTest,CollectionContractTest,ProductRequestValidationTest,ProductServiceTest,LoginRateLimiterTest,SecurityConfigurationTest test
```

Offline mode requires dependencies already in the Maven cache. The tests cover
input/output mutation isolation, nested/null values, cycle/resource bounds,
JSON create/update contracts, 400 field errors, unknown-field rejection, 409
conflicts, and an offline Mongo converter round-trip for Decimal128, timestamps,
version and roles. They do not verify live Mongo writes, auditing execution or
authenticated HTTP flows. Existing tests are unchanged. For the full suite,
export the isolated `MONGODB_TEST_URI` and use `./mvnw clean verify` as above;
the focused command is not a substitute for that build.

## Stable errors and safe error logging

ProblemDetail statuses, titles, details, field names and existing `urn:problem:`
type URIs are unchanged. Type generation uses `Locale.ROOT` so the canonical
English identifiers remain stable under different JVM default locales.

Unexpected-error logging retains only the request path and original exception
type (both previously present in logs). Each value is bounded to 512 UTF-16
code units, including `...` when truncated; CR/LF, other ISO controls, Unicode
format controls and line/paragraph separators are replaced with `_`. No URL
decoding is performed, and the API's response instance path is not modified.
Raw exception messages, causes, suppressed exceptions and stack traces are no
longer attached because they may contain request data or secrets. This reduces
server-side diagnostics; HTTP behavior is unchanged. No body, query string,
authorization header, credential, token or cookie logging is added.

Offline focused checks from the backend module:

```bash
./mvnw -o -Dtest=ApiExceptionHandlerContractTest,LogSanitizerTest test
```

These checks assert exact error contracts under root, English and Turkish
locales and verify bounded, single-line log rendering using in-memory appenders.
Synthetic private markers must not reach logs; no real secrets are used or
recorded. The tests do not establish that a live HTTP parser accepts control
characters in URLs and do not replace the full backend verification build.

## Isolated security regression checks

From the backend module, with dependencies already cached:

```bash
./mvnw -o -Dtest=SecurityComponentConstructionTest,CookieSecurityContractTest,SecurityAccessMatrixTest,LoginRateLimiterTest,SecurityConfigurationTest,ApiExceptionHandlerContractTest,LogSanitizerTest,ProductServiceTest,ProductRequestValidationTest test
```

These checks cover constructor boundaries, cookie resolution, CSRF handling,
an anonymous/USER/ADMIN/roleless access matrix, real JWT decoding, logout flags,
search parameters, and stable error/log contracts. The security matrix creates
isolated test/dev Spring MVC contexts with real security beans, mocked
persistence and ephemeral in-memory signing/CSRF material. It does not load
application YAML, create a Mongo client, contact running apps or use real login
credentials. It does not replace full Boot/Mongo verification with the dedicated
`MONGODB_TEST_URI`, or approved live API/browser QA.

Unsafe cookie-authenticated requests require a matching nonblank CSRF cookie
and header. Empty and whitespace-only pairs are rejected with 403 before any
product-service call. See [the security contract](SECURITY.md#authentication-and-cookies)
for why the custom filter is necessary alongside resource-server authentication.

`AuthService` and `LoginRateLimiter` are final to prevent hostile subclass
finalizers when constructor validation fails. Current isolated-context tests
verify constructor injection with advisor auto-proxying enabled and no proxy
required for these beans. Future advice requiring subclass proxies must first
revisit that design; do not remove fail-fast checks or finality just to add an
aspect. No restart is needed for offline tests; an already-running backend needs
a user-owned restart before live verification of changed application code.

## Security static analysis

These checks inspect code/bytecode without starting either app or changing
database records. They do not replace dependency scanning, runtime security
tests or manual review. Findings are candidates for review, not automatically
confirmed vulnerabilities. No blanket suppression/baseline is configured.

### Java

The opt-in Maven profile pins SpotBugs Maven plugin `4.10.5.0` (SpotBugs
`4.10.5`) and FindSecBugs `1.14.0`; Java remains at release 25. See the
[SpotBugs plugin documentation](https://spotbugs.github.io/spotbugs-maven-plugin/)
and [FindSecBugs](https://find-sec-bugs.github.io/).
From `backend/springreactdemo/`, scan compiled application classes without
running tests:

```bash
./mvnw -Pstatic-analysis -DskipTests compile spotbugs:check
```

For a clean build, all existing tests, coverage and analysis together, first
export the dedicated `MONGODB_TEST_URI` described above, then run:

```bash
./mvnw -Pstatic-analysis clean verify
```

Analysis uses maximum effort and the low-confidence threshold to retain
findings for review; tests are not analysis targets. Read the native
machine-readable findings and per-class statistics in `target/spotbugsXml.xml`
(relative to the backend module and ignored). The profile deliberately enables
XML without simultaneous HTML output: with the pinned plugin/core combination,
enabling both left the XML class statistics empty. Presentation files under
`target/spotbugs/` are not a substitute for the native report. HTML output is not
refreshed by this profile; an HTML file left by an earlier run may be stale.
The `check` goal fails on reported bugs; tool/analysis errors also fail. Ordinary
`./mvnw clean verify` does not activate this profile. Initial plugin downloads
require network access. No backend restart is needed.

### Frontend

From `frontend/`, after installing the lockfile's development dependencies:

```bash
npm run lint
npm run lint:security
npm run test
npm run typecheck:e2e
npm run build
```

Normal lint retains the existing React/TypeScript checks and now also checks
standalone `.mjs` QA runners using Node globals and recommended JavaScript
rules. Accessibility/responsive runners additionally declare the read-only
DOM globals used inside their Playwright browser callbacks; `no-undef` stays
enabled. The separate security configuration adds the recommended rules from
`eslint-plugin-security` `4.2.1` to JS/JSX/MJS/TS/TSX files. Its command fails
on warnings as well as errors; it does not automatically fix source files.
The plugin runs with the existing ESLint 10 setup; no downgrade is required.
See its [flat-config usage and limitations](https://github.com/eslint-community/eslint-plugin-security).

The security rules are heuristics, primarily for Node.js: dynamic object
access, filesystem paths or subprocess use may be legitimate and need
individual trust-boundary review. They do not establish complete React XSS,
authorization or backend coverage. Review findings before approving fixes or
narrow, documented suppressions. The commands above do not execute standalone
load/outage/restart QA runners or browser E2E tests.

Offline regression tests cover literal escaping in the product-form E2E label
helper (including optional required markers), bounded safe-reporter identifiers,
and prototype-safe `Map` counters shared by the concurrency/load runners. Counter
serialization retains their existing JSON report shape; runner assertions,
cleanup and workload settings are unchanged. These unit tests do not substitute
for approved live E5/G1/G2 reruns.

The product form's price rule is extracted into a tested helper without changing
its grammar: positive decimal amounts, 1–12 whole digits, and at most two decimal
places. Tests cover precision boundaries, whitespace/line-terminator rejection
and long/adversarial inputs. The security scanner still reports heuristic
warnings on this bounded regex and on controlled QA code. No security rule,
warning threshold or suppression was changed to clear those reports.

## Frontend accessibility checks

The login page has a main landmark; dashboard chart titles use sequential
headings, while metric values are ordinary text. Decorative brand marks are
hidden from assistive technology. Text colors retain contrast against their
backgrounds. The delete dialog initially focuses **Keep product** after its
transition, retains MUI's focus trap, and restores focus to its trigger on
Escape or cancellation.

With the backend and frontend already running, export `DEV_ADMIN_PASSWORD`
in the test process (never put its value in commands or recordings), then run
from `frontend/`:

```bash
npm run test:a11y
```

The username defaults to `admin`; `DEV_ADMIN_USERNAME` is optional. The
version-controlled [F1 runner](frontend/e2e/accessibility.mjs) uses Playwright
Chromium and `@axe-core/playwright` to scan login, dashboard, products, the
create form, and the delete dialog, and checks keyboard order, focus trapping,
Escape, and cancellation. It permits browser traffic only to
`http://localhost:5173`, blocks product writes, and verifies the product count
stays 500. Passwords/cookies remain in memory, recordings are disabled, and
output contains only sanitized diagnostics. This standalone command is not
included in the default unit-test or Playwright E2E commands.

The runner needs the npm dev dependencies and Playwright's Chromium headless
shell installed. Any missing package/browser download requires separate QA
approval; the test does not install tools or start services. Automated checks
do not establish complete WCAG conformance: axe `incomplete` results need
manual review, and screen-reader/responsive audits are separate work.

## Frontend responsive smoke checks

At widths of 380px and below, header navigation wraps onto a second row so
the brand, create action and account menu remain visible. Navigation controls
are not hidden or shrunk to mask page overflow. Wide product tables scroll
inside their own container rather than widening the page.

With both apps already running and `DEV_ADMIN_PASSWORD` exported in the test
process, run from `frontend/`:

```bash
npm run test:responsive
```

The [F2 runner](frontend/e2e/responsive.mjs) checks login, dashboard, products,
the delete dialog, and create/edit forms at 320px, 380px, 381px, 390px and
1440px widths. The 380/381px cases cover both sides of the header breakpoint.
It reuses one login (`admin` by default; `DEV_ADMIN_USERNAME` is optional),
checks document/control bounds and intended local table scrolling, and
verifies the product count stays 500 without submitting product writes.
It uses only the existing Chromium, localhost traffic, in-memory credentials
and sanitized diagnostics, with recordings disabled. It never installs tools
or starts services and is separate from the default unit/E2E commands.
This is viewport geometry/interaction smoke, not physical-device emulation,
touch testing, pixel-level visual review, or Safari/Firefox coverage.

## Product API update contract

Product responses include a server-managed `version`. Send that value with all
product fields when updating a product using `PUT /api/v1/products/{id}`; do
not send it on create. The server rejects a missing or invalid version with
400, and rejects a stale version with 409 ProblemDetail. On success, use the
new version returned in the response for the next update. This prevents an
older edit from silently overwriting a newer one.

Product create and update requests reject unknown JSON fields with a 400
ProblemDetail. Send only fields defined by the request contract; server-managed
fields such as `id` and `roles` cannot be supplied by clients.

Example update body:

```json
{
  "name": "Trail Backpack",
  "description": "Updated description",
  "category": "Outdoor",
  "price": 79.95,
  "stock": 25,
  "tags": ["hiking", "travel"],
  "specs": { "capacityLitres": 28 },
  "active": true,
  "version": 3
}
```

## MongoDB development setup

The Compose configuration pins MongoDB `7.0.45`. MongoDB 8.x versions in the
current affected range do not start on Linux kernel `7.0.0`; MongoDB's
compatibility matrix lists the 7.0 series as supported on that kernel.

Copy [the root environment example](.env.example) to the ignored local `.env`
file only if it does not already exist. Preserve existing settings and replace
every secret placeholder before starting the backend:

- Set `MONGODB_ROOT_PASSWORD` to a strong, URL-safe local password. The
  `MONGODB_URI` value is composed from the variables above it in the example;
  keep credentials in sync if you customize the URI. Keep `MONGODB_TEST_URI`
  pointed at a separate test database, never the development database.
- Generate a unique `JWT_SECRET` privately, for example with
  `openssl rand -base64 48`, and store it only in your local secret environment.
  The signing key must contain at least 32 UTF-8 bytes. Do not paste the value
  into commands, reports, screenshots, or source control.
- Set `DEV_ADMIN_PASSWORD` and `DEV_USER_PASSWORD` to distinct strong local
  passwords, each at least 12 characters long. The `dev` seeder creates the
  lowercase usernames `admin` and `user` only if they do not already exist.
  Changing these variables does not rotate passwords for existing users; the
  seeder skips them. Optional QA username overrides do not rename seeded users.

See [the security setup](SECURITY.md#local-setup) for the cookie and credential
requirements. Keep local environment-file values compatible with Bash sourcing
(quote values where needed), export them only to the required processes, and
never commit either module's local `.env` file.

From the repository root, start MongoDB and wait for its healthcheck:

```bash
docker compose up -d --wait
```

Start the backend from the repository root (Bash):

```bash
set -a
. ./.env
set +a
SPRING_PROFILES_ACTIVE=dev ./backend/springreactdemo/mvnw -f backend/springreactdemo/pom.xml spring-boot:run
```

For QA checklist sections A–C, you can temporarily use a two-minute login
rate-limit window. Stop the backend, then start it with the override:

```bash
LOGIN_RATE_LIMIT_WINDOW=2m SPRING_PROFILES_ACTIVE=dev ./backend/springreactdemo/mvnw -f backend/springreactdemo/pom.xml spring-boot:run
```

After QA, stop and restart the backend without `LOGIN_RATE_LIMIT_WINDOW=2m`;
the default is 15 minutes. The setting is read at startup. Do not add the
temporary override to a persistent shell profile or commit it to configuration.

In another terminal, check the aggregate Actuator health status:

```bash
curl --fail http://localhost:8080/actuator/health
```

Expect aggregate `status: "UP"` when the application and its enabled health
indicators, including MongoDB, are healthy. The public response hides component
names and details (it may include health-group names), so this command does not
display a named MongoDB indicator or connection details. Keep those details
hidden; do not expose additional Actuator endpoints for this check.

To stop MongoDB without deleting its named data volume, run
`docker compose down`. Use `docker compose down -v` only when intentionally
deleting the local MongoDB data.
