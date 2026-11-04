# spring-react-demo
## Structure
- backend/ — Spring Boot API
- frontend/ — React application
- docs/ — project notes and decisions
## Setup

Start the backend first:

```bash
cd backend/springreactdemo
./mvnw spring-boot:run
```

Then start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend requests `GET /api/app-test`. Vite proxies that request to the
backend's `GET http://localhost:8080/app-test` endpoint during development.
For another backend URL, set `VITE_API_BASE_URL` before starting the frontend.

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

In another terminal, confirm the Actuator MongoDB health indicator reports
`UP`:

```bash
curl --fail http://localhost:8080/actuator/health
```

To stop MongoDB without deleting its named data volume, run
`docker compose down`. Use `docker compose down -v` only when intentionally
deleting the local MongoDB data.
