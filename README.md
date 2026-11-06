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
