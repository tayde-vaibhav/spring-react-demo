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
  to `http://localhost:5173`.
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
outside tests. It requires a dedicated `MONGODB_TEST_URI` with no fallback to
the development `MONGODB_URI`.

For QA checklist sections A–C, the login limiter may temporarily use a
two-minute window by setting `LOGIN_RATE_LIMIT_WINDOW=2m` when starting the
backend. After QA, restart without that override (or restore the setting to
`15m`) to return to the default window. The runtime value is read at startup.
