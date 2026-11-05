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
