# H2 — Focused frontend-header remediation plan

Date: 2026-11-08. **APPROVED AND IMPLEMENTED; VERIFICATION COMPLETED.**
User approval included tests, documentation and Vite's possible auto-restart.
See [actual outcome](h2-header-remediation-results.md): implementation checks
PASSED; the raw H2 rerun remains FAILED on explicitly retained findings.
Original proposal below is the scope record, not pending implementation.

## Evidence and scope

The user approved planning only after the [completed limited passive check](h2-passive-results.md).
No scanner, app/browser request, test/build, download or service operation ran
for this plan. Only saved sanitized findings and relevant source/installed
dependency definitions were inspected. No `.env` or real credentials read.

Observed findings affect the Vite frontend HTML at `/` and `/login`:

| Finding | Severity | Instances | Current source evidence |
| --- | --- | ---: | --- |
| No CSP | Medium | 2 | [Vite config](../../frontend/vite.config.ts) returns plugins and dev proxy only; no response header policy |
| No anti-framing header | Medium | 2 | Same config; no frontend header helper found |
| No nosniff | Low | 2 | Same config |
| Modern Web Application | Informational | 2 | SPA coverage observation, not an exploit or a request to stop using React |

No deployed frontend hosting/nginx configuration was found in the inspected
repository paths. The existing backend headers do not automatically apply to
HTML served directly on port 5173. A dev-only fix cannot certify production.

Compatibility facts from current sources:

- Installed React plugin injects a development inline module preamble; a bare
  `script-src 'self'` would block it. Vite/React Refresh must remain enabled.
- MUI/Emotion generates runtime style elements; the app does not currently
  provide an Emotion nonce cache. Recharts/MUI also need browser style behavior
  validated, not assumed from an HTML-only scan.
- [Existing CSS](../../frontend/src/styles.css) imports Google Fonts. A new
  self-only style/font policy would alter font loading and potentially layout.
- [API client](../../frontend/src/api/client.ts) defaults to same-origin `/api`,
  and the existing dev proxy target remains environment-configured. No URL,
  credential, CORS, cookie or CSRF change is required for these header findings.
- Installed Vite defines response headers and CSP-nonce HTML support; static
  `html.cspNonce` alone does not establish secure per-response nonce generation
  or populate Emotion's cache. No fixed/shared nonce is proposed.

These are source-level compatibility facts, not browser verification of a new
policy. No CSP candidate below has been applied or tested yet.

## Recommended bounded implementation

### 1. Development serving policy only

Add the following response headers to development Vite HTML, preserving the
current proxy object, target lookup, React plugin, host/port and CORS behavior:

- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- An enforced CSP with `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'` and same-origin default/script access.

Proposed dev CSP candidate, subject to exact-byte/bootstrap/browser tests:

```text
default-src 'self'; script-src 'self' 'sha256-<reviewed-React-Refresh-preamble-hash>'; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws://localhost:5173; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'
```

The hash marker above is explanatory, not a literal configuration value. Authorize
only the reviewed exact bytes of the installed React Refresh bootstrap, verify
them against transformed HTML, and fail on drift. Do not hash arbitrary HTML
scripts automatically, allow arbitrary inline scripts, add unsafe-eval, disable
HMR or introduce a fixed nonce just to clear a warning. If this cannot be done
with a small verified helper, stop and propose the alternative before expanding
into nonce middleware, application bootstrap or dependency changes.

**Explicit development tradeoff needing approval:** inline styles remain allowed
for the current Emotion/runtime styling. This is not equivalent to a strict
nonce-based production CSP and may produce a new CSP-strength warning. Do not
hide or auto-accept that warning. No inline JavaScript permission is proposed.

The only external CSP hosts are the two already referenced Google Fonts serving
origins. They preserve existing intended font behavior, not permission for QA
network access. Automated browser checks must abort all non-local requests
before dispatch, so they use existing fallback fonts. No font fetch/download,
new asset, CSS/typography redesign or arbitrary external origin is in scope.
If the user wants all fonts self-hosted, request a separate font/asset decision.

Use only the exact localhost HMR origin required by the approved QA URL. Do not
add wildcard `ws:`, wildcard origins, new backend connect destinations or other
hosts. If additional supported dev origins/ports need testing, ask first. No
production HSTS/upgrade-insecure-requests, COOP/COEP or new Referrer-Policy change
is bundled into this minimal fix.

### 2. Keep production/preview requirements separate

Do not copy dev hash/inline-style/HMR exceptions into a production policy. Do
not imply Vite response headers are emitted by static build assets or a real
deployment. No nginx/container/static-host configuration is created in this
phase because the hosting choice is not established. Vite preview is not the
production server, and preview behavior is not silently changed.

Production follow-up needs its own approved host/API/font-origin decisions,
nonce/hash design including Emotion and chart styling, HTTPS verification and
runtime/browser assessment. Document it as pending rather than fulfilled by
the port-5173 rerun.

### 3. Files and documentation proposed for approval

- Modify [frontend/vite.config.ts](../../frontend/vite.config.ts) for the dev
  response headers without discarding the current proxy configuration.
- Add a focused frontend configuration/header helper and Vitest regression
  test (proposed names `frontend/security-headers.ts` and
  `frontend/security-headers.test.ts`). No dependency or lockfile change.
- Add a focused Playwright header/CSP smoke file under the existing E2E folder,
  keeping existing tests/assertions intact. Use mocked API responses for UI
  compatibility, not real credentials or product writes.
- Extend [README](../../README.md) and [SECURITY](../../SECURITY.md) with a short
  dev-versus-production header section, exact tradeoffs, runtime restart steps
  and remaining deployment requirements. Preserve all unrelated existing edits.
- Append actual verification/findings to the pre-approved QA report. All
  findings, including informational ones, remain visible.

No backend changes, API/security-contract changes, auth-token storage changes,
new packages, deployment configuration, scanner exclusions or Git operations.

## Verification and restart sequence after implementation approval

1. Show the exact diff/header values before verification. Offline unit tests
   check headers, dev-only application, proxy preservation, reviewed bootstrap
   hash correctness/drift rejection and absence of unsafe JavaScript/wildcards.
2. Run existing frontend lint/unit/typecheck/build commands using cached tools;
   no npm install, audit, browser download, Maven build or security-gate waiver.
   Report build warnings, output/source-map behavior and any failures honestly.
3. Vite may auto-restart when its config changes. Warn the user immediately
   before saving those changes, because even a dev config edit can interrupt
   their running server. Backend and Mongo need no restart. The user may prefer
   to stop/restart Vite manually; confirm ownership/timing before implementation.
4. Check actual response headers on `/` and `/login`; focused browser smoke
   checks rendering, MUI styles, same-origin mocked API flow, chart rendering,
   navigation and blocked unauthorized inline scripts. Abort all third-party
   requests/WebSockets, keep trace/screenshots/video/storage state disabled,
   save only safe metadata. Mock API calls to avoid real login/limiter/DB writes.
   Verify HMR connection and Fast Refresh behavior explicitly; a passing HTML
   header check alone does not prove HMR works. If a live HMR fixture/server or
   further app edits are needed beyond the approved test file, ask first.
5. Rerun only the same approved eight-GET import-only H2 runner after frontend
   readiness is confirmed. Preserve the pinned image, no-network scanner,
   replay prohibition, complete coverage checks and sanitized output.

Request separate approval before any service start/stop, package/download,
work expected to exceed five minutes in one operation, changed scan scope,
production code expansion or authenticated/write-based E2E rerun.

## Honest acceptance criteria

The three missing-header rule IDs should no longer be emitted if the policy
works, but browser functionality and all new findings matter too. Inline-style
permission may be reported as a residual CSP warning. Do not predeclare H2
PASSED or add blanket exceptions to avoid that result.

Modern Web Application is informational and expected for a React SPA. The
current QA runner returns exit 2 for **any** alert, including information-only
results. Do not remove that rule, hide it or change exit/status semantics as
part of the header fix. If informational-only results should be non-failing
observations, obtain an explicit separate criterion decision and retain their
counts and raw execution result. Planning approval is not that decision.

## Decision requested

Approve the bounded dev-header implementation, new tests and README/SECURITY
documentation above, including the explicitly dev-only inline-style exception
and existing exact font hosts? Confirm the timing/ownership of Vite's possible
auto-restart before the first configuration edit. H2 rerun remains conditional
on verified readiness and the same approved localhost-only scope; no raw-gate
acceptance criterion or production policy is changed by this approval.
