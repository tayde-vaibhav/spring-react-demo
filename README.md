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

After the backend is running, install and start the frontend in a second
terminal:

```bash
cd frontend
npm ci
npm run dev
```

The frontend requests `GET /api/app-test`. Vite proxies that request to the
backend's `GET http://localhost:8080/app-test` endpoint during development.
For another backend URL, set `VITE_API_BASE_URL` before starting the frontend.

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
findings for review; tests are not analysis targets. Rendered XML and HTML
reports are `target/spotbugs/spotbugs.xml` and
`target/spotbugs/spotbugs.html`; the native machine-readable findings are in
`target/spotbugsXml.xml` (all relative to the backend module and ignored).
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

Copy `.env.example` to `.env` and replace `MONGODB_ROOT_PASSWORD` with a strong,
URL-safe local password. The `MONGODB_URI` value is composed from the variables
above it in the file; keep the URI credentials in sync if you customize that
line. `.env` is ignored by Git.

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

In another terminal, confirm the Actuator MongoDB health indicator reports
`UP`:

```bash
curl --fail http://localhost:8080/actuator/health
```

To stop MongoDB without deleting its named data volume, run
`docker compose down`. Use `docker compose down -v` only when intentionally
deleting the local MongoDB data.
