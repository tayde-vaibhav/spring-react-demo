# Project Guide

## Agent instructions

- Before making code changes, read [`.codex/project-rules.md`](.codex/project-rules.md).
- Before running the repository's gated QA checklist, also read
  [`.codex/qa-protocol.md`](.codex/qa-protocol.md).
- Preserve unrelated working-tree changes. Check Git status before and after
  edits, and never stage, commit, push, rebase, amend, or change remotes unless
  the user explicitly asks.
- When an approved behavior change is suitable for documentation, identify the
  documentation update and obtain approval if it was not included in the
  approved scope.

## Overview

This repository contains a Spring Boot REST backend and a React single-page
frontend, with MongoDB persistence configured for development and tests. During
local development, Vite proxies `/api/*` requests to the configured backend
(normally `http://localhost:8080`) without rewriting paths. The frontend is an
authenticated product workspace with login, product management, and a category
dashboard, backed by `/api/v1/auth/*` and `/api/v1/products*`. The legacy
`GET /app-test` controller is not used by the frontend and remains blocked by
default-deny security rules.

## Project structure

- `backend/springreactdemo/` — Maven/Spring Boot application.
- `backend/springreactdemo/src/main/java/com/vaibhav/springreactdemo/` — Java
  application and API source.
- `backend/springreactdemo/src/main/resources/` — Spring configuration.
- `backend/springreactdemo/src/test/` — backend tests.
- `docker-compose.yml` — local MongoDB service and persistent named volume.
- `.env.example` — placeholders for local MongoDB credentials and connection
  URI; copy it to the ignored `.env` file for local use.
- `frontend/` — React application, Vite configuration, npm manifest and lock.
- `frontend/src/` — React source and styles.
- `frontend/public/` — static assets.
- `docs/` — project notes and prompts.

## Technology stack (repository versions)

Versions below come from the tracked Maven configuration, npm lockfile, and
Compose image, not a fresh inspection of installed runtimes. Frontend versions
are lockfile resolutions, not the manifest's semver ranges.

- Java: project release target `25`.
- Spring Boot: `4.1.2`.
- Backend build tool: Maven Wrapper, Maven `3.10.0`.
- Backend dependencies: `spring-boot-starter-webmvc`,
  `spring-boot-starter-data-mongodb`, `spring-boot-starter-actuator`,
  `spring-boot-starter-validation`, `spring-boot-starter-security`, and
  `spring-boot-starter-oauth2-resource-server`; test dependencies
  `spring-boot-starter-webmvc-test` and `spring-boot-starter-security-test`.
  Starter versions are managed by Spring Boot.
- OpenAPI: `springdoc-openapi-starter-webmvc-ui` `3.2.0`; development seed data:
  Datafaker `2.7.0`.
- Backend quality tooling: JaCoCo `0.8.16`; opt-in SpotBugs Maven plugin
  `4.10.5.0` with FindSecBugs `1.14.0`.
- Local database container: MongoDB `7.0.45` (Docker Compose).
- React and React DOM: `19.3.1` each.
- Frontend application language: TypeScript/TSX, TypeScript `6.0.3`;
  standalone QA helpers also use JavaScript/MJS.
- UI: MUI Material/icons `9.5.0`, Emotion React `11.14.0` and styled `11.14.1`.
- Routing/data/charts: React Router `8.5.1`, TanStack Query `5.105.3`, and
  Recharts `3.10.1`.
- Bundler/dev server: Vite `8.3.5`, with `@vitejs/plugin-react` `6.2.1`.
- Frontend package manager: npm, lockfile version `3`. Local Node.js/npm
  runtime versions are not established by this repository snapshot.
- Frontend development tools: ESLint `10.14.0`, `@eslint/js` `9.39.5`,
  `eslint-plugin-react-hooks` `7.1.1`, `eslint-plugin-react-refresh` `0.5.7`,
  `eslint-plugin-security` `4.2.1`, `typescript-eslint` `8.72.1`, and
  `globals` `17.14.0`.
- Frontend tests: Vitest `5.1.0`, Playwright `1.65.0`, and
  `@axe-core/playwright` `4.14.0`.

## Build, test, and run

### Backend

Follow [the backend environment setup](README.md#mongodb-development-setup)
and [security requirements](SECURITY.md#local-setup) before launching. Export
the required development credentials and `MONGODB_URI`; never read or print
real local secret files as part of agent QA. The `dev` profile seeds missing
products and users, so starting it can write data and requires QA approval.

From `backend/springreactdemo/`, after preparing that environment:

```bash
SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

For tests/package builds that run tests, export a dedicated `MONGODB_TEST_URI`
first. The automated `test` profile has no fallback to `MONGODB_URI` and must
never be used to run the application outside tests. From the backend module:

```bash
./mvnw test
./mvnw clean verify
```

The backend listens on port `8080` by default. Package it with
`./mvnw package`. Full `verify` also produces JaCoCo reports under
`target/site/jacoco/`; see [test and coverage details](README.md#backend-tests-and-coverage).

### Frontend

Follow [the frontend setup](README.md#setup): copy `frontend/.env.example` to
the ignored `frontend/.env` only if no local file exists, preserving existing
settings. Set `VITE_BACKEND_PROXY_TARGET=http://localhost:8080` for the dev
proxy and keep `VITE_API_BASE_URL=/api` for browser requests. Never put secrets
in `VITE_*` variables; they can be exposed to the browser.

From `frontend/`, after preparing that environment:

```bash
npm ci
npm run lint
npm run test
npm run typecheck:e2e
npm run build
npm run dev
```

Use `http://localhost:5173` for QA browser runs. The development proxy does
not rewrite `/api` paths and is not part of production builds. Configure
`VITE_API_BASE_URL` at build time when a different browser API base is needed;
the production serving layer must route it appropriately. E2E/accessibility
checks and any install/download/service operations require the applicable QA
approval; the commands above are instructions, not standing authorization.

For standalone nonce-server/proxy QA, use [the separate Node server launch
instructions](README.md#standalone-frontend-html-server-nonce-csp-candidate)
instead of `npm run dev` or the existing Vite tasks. Stop Vite manually before
handing over port 5173. `npm start` serves an existing production build with
per-response nonce processing; it has no HMR and requires a restart after build
changes. It does not start the backend or MongoDB, and starting/stopping it still
requires the applicable QA approval.

## Coding conventions

- Keep backend responsibilities layered: Controller -> Service -> Repository.
- Use DTOs for API requests and responses; do not expose persistence entities
  directly from endpoints.
- Use constructor injection for Spring dependencies.
- Bound both page size and page offset for paginated endpoints, and allowlist
  client-selectable sort fields.
- Design search behavior around appropriate indexes; avoid unindexed collection
  scans on API search paths.
- Validate numeric precision and scale, and constrain nested/map input sizes,
  depth, and key formats before persistence.
- Test repository query limits and filters, request validation, and RFC 9457
  error response contracts in addition to service behavior.
- Keep React components focused, use functional components and hooks, and
  provide accessible markup and appropriate loading/error states.
- Keep configuration and credentials out of source code. Use environment
  variables or ignored local configuration for secrets.
- Make small, focused changes and never commit secrets or `.env` files.
