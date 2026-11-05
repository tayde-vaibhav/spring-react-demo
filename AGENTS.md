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
local development, Vite proxies `/api/*` requests to the backend at
`http://localhost:8080`; the current example endpoint is `GET /app-test`.

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

## Technology stack (detected versions)

- Java: project release target `25`; installed runtime `25.0.1`.
- Spring Boot: `4.1.2`.
- Backend build tool: Maven Wrapper, Maven `3.10.0`.
- Backend dependencies: `spring-boot-starter-webmvc`,
  `spring-boot-starter-data-mongodb`, and `spring-boot-starter-actuator`; test
  dependency `spring-boot-starter-webmvc-test` (versions managed by Spring
  Boot).
- Local database container: MongoDB `7.0.45` (Docker Compose), selected for
  compatibility with Linux kernel `7.0.0` in the development environment.
- React and React DOM: `19.3.1` each.
- Frontend language: JavaScript/JSX (not TypeScript).
- Bundler/dev server: Vite `8.3.5`, with `@vitejs/plugin-react` `6.2.1`.
- Frontend package manager: npm `9.2.0` (lockfile version 3), on Node.js
  `22.22.1` in the inspected environment.
- Frontend development tools: ESLint `10.14.0`, `@eslint/js` `9.39.5`,
  `eslint-plugin-react-hooks` `7.1.1`, `eslint-plugin-react-refresh` `0.5.7`,
  and `globals` `17.14.0`.

## Build, test, and run

### Backend

From `backend/springreactdemo/`:

```bash
./mvnw test
./mvnw spring-boot:run
```

The backend listens on port `8080` by default. Package it with
`./mvnw package`.

### Frontend

From `frontend/`:

```bash
npm ci
npm run lint
npm run build
npm run dev
```

The Vite development server prints its local URL when started. The frontend
uses `/api` by default and Vite proxies it to the backend. Set
`VITE_API_BASE_URL` when the frontend must use a different API base URL.

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
