# Phase 4A — Standalone nonce HTML server and offline verification

Date: 2026-11-08. User approved implementation, documentation and offline checks;
a diff summary was shown before verification. **Implementation/functional checks
PASSED. Unfiltered frontend security gate FAILED; runtime verification NOT RUN.**

Subsequent manual decision: the user accepted the 19 exact Phase 4A dispositions
on 2026-11-08. See the recorded decision below; the native gate remains FAILED.

## Implemented scope

- Four [server modules](../../frontend/server/): startup-only bounded build indexing,
  per-document CSP/nonce rendering, native fixed-target API proxy and explicit
  opt-in startup through npm start. No new HTTP framework.
- [Emotion cache helper](../../frontend/src/style-cache.ts), production metadata
  validation, [bootstrap integration](../../frontend/src/main.tsx) and one HTML
  marker. The cache is outside React rendering and covers the whole app.
- Four mock/fixture server test files and one cache unit file: 98 new cases.
  No old test/assertion was removed or weakened.
- [Manifest](../../frontend/package.json) and lock root declare the already
  resolved @emotion/cache 11.14.0 directly; no package graph/version/integrity
  change, install or registry request.
- [Frontend example](../../frontend/.env.example) documents three server-only
  inputs; [README](../../README.md#standalone-frontend-html-server-nonce-csp-candidate)
  and [SECURITY](../../SECURITY.md#standalone-html-server-candidate) explain
  startup, limitations, HTTPS/cache/limiter requirements and preview behavior.

Vite configuration/dev policy and backend source/configuration were untouched
by this phase; their pre-existing edits remain preserved. No serving process
was started and nothing was switched on port 5173.

## Security behavior and bounds

HTML receives a fresh random 24-byte/192-bit nonce, shared by the CSP and the
single meta value consumed by Emotion. The candidate enforces nonced style
elements and style-src-attr none; script/API sources stay same-origin, exact
existing font hosts remain, and no unsafe-inline/eval, wildcard or HMR allowance
is added. Production metadata missing, duplicate, malformed or unreplaced fails
closed. Development intentionally keeps nonce-free styling.

HTML has no-store, no ETag/Last-Modified and no conditional 304 branch. Separate
documents receive independent policies; same-document React navigation retains
its cache. Deployment/CDN must preserve header/body coherence and not reuse HTML.
Assets are a bounded in-memory startup snapshot, with one-hour cache control;
rebuild/restart after changing the build. Plain Vite preview/static serving does
not substitute the marker and cannot run this production bootstrap.

Request paths cannot select filesystem reads or the backend host. Only indexed
asset types and explicitly recognized SPA routes are served; unknown HTML
navigation receives the React 404 at HTTP 404. Hidden/source/map/management/docs
paths do not become SPA responses. Build limits: 256 KiB HTML, 8 MiB per asset,
64 MiB aggregate, 1024 entries and depth eight; incremental directory enumeration,
symlink/special-file/type rejection and descriptor checks are retained. These
controls assume trusted, immutable deployment input, not a hostile concurrently
mutating filesystem.

Proxy origin is required from FRONTEND_API_PROXY_TARGET, rejecting credentials,
paths, query and fragments. Only /api is proxied; methods are bounded, path/query
remain origin-form and request Host/forwarding metadata cannot redirect traffic.
Cookies/CSRF/Origin and separate Set-Cookie entries are preserved for backend
validation; hop-by-hop/connection-nominated headers are stripped, redirects are
not followed, and backend ProblemDetail statuses/bodies are preserved. Limits:
64 KiB body, 4 MiB response, 16 in-flight API operations, ten-second upstream
deadline, plus native server header/body timeouts. Errors/logs never echo
underlying exceptions, request bodies, credentials, header values or config values.

Production still needs HTTPS, exact public-origin/backend configuration and a
trusted client-IP/shared limiter design. The unchanged backend currently sees
the proxy's peer IP and can group clients in one login bucket. Spoofable client
forwarding headers are not trusted to work around this. This candidate is not
approved for public production deployment.

## Verification actually executed

| Check | Final result |
| --- | --- |
| npm run lint | PASSED, no rule disable |
| npm run test -- --reporter=dot | PASSED: 342 cases / 15 files, 0 failed; retains all 244 previous cases plus 98 new |
| npm run typecheck:e2e | PASSED |
| npm run build | PASSED, including application/test TypeScript checks |
| node --check frontend/server/start.mjs | PASSED; parses only, does not start the server |
| Generated build indexing/rendering | PASSED: two assets, marker substituted, independent rendered policies, no dev client and zero source maps |
| Editor diagnostics / whitespace / docs links | Clear / PASSED / no missing README or SECURITY local target |
| Manifest vs lock root | Exact dependency declaration agreement; existing cache resolution retained |
| Unfiltered security lint | FAILED, exit 1: 108 warnings / 0 errors / 0 fatal, across 62 files |

The production JS asset is 1,005,340 bytes, up 360 bytes from the prior
1,004,980-byte artifact. Build reports gzip 304.51 kB and retains the existing
greater-than-500-kB chunk warning; no threshold/chunking/source-map setting changed.
This is artifact measurement, not a browser-performance result.

All tests use synthetic in-memory material, mocked HTTP modules/transports and
owned qa-prefixed temporary build directories removed afterwards. They never
listen on a port, call a backend, read real credentials or write application data.
No live product count was queried; none is asserted from mock tests.

Initial verification disclosed a no-control-regex lint failure and a new
table-driven test's spread-argument typing error. Fixed the path character check
without suppression and wrapped each invalid-metadata case as explicit data;
every case remains. Five new proxy tests initially compared Buffer object
identity even though the mock response copies buffers; corrected to full
byte-for-byte equality. Final full suite above passes. Initial JSON summary
extraction was unavailable; final direct dot-reporter results establish counts.
No existing test was weakened to pass these checks.

## Fresh security comparison and proposed dispositions

[Native frontend JSON](phase4a-security-20261108.json), SHA-256:
93c1ed0aef7ef457634331fc0d2717f9e455ec1c70567fd7b9b0c952e4fbc827.

Compared with [Phase 1 JSON](h1-phase1-frontend-20261108.json): all 89 previous
diagnostics remain at their exact identities; zero removals. Nineteen additions
are listed below; none is automatically accepted by the earlier manual decision.
Only the pre-existing non-security react-refresh directive remains suppressed;
no security suppression/filter/rule/threshold was added or changed.

| Rule | Previous | Fresh | Added |
| --- | ---: | ---: | ---: |
| security/detect-unsafe-regex | 32 | 32 | 0 |
| security/detect-object-injection | 34 | 35 | 1 |
| security/detect-non-literal-fs-filename | 22 | 40 | 18 |
| security/detect-non-literal-regexp | 1 | 1 | 0 |
| Total | 89 | 108 | 19 |

Source-review recommendation for all 19 is DESIGN CHOICE, not a blanket false
positive or security guarantee. No newly confirmed REAL defect is established
by these reports. A01-A06 read only trusted startup build paths/descriptors;
request handling later uses the asset Map, never browser-selected file paths.
A07-A18 operate only in mkdtemp-created, registered test roots with finally/afterEach
cleanup, including synthetic symlinks. A19 reads an index supplied by map from
the same fixed 50-element response array; it is not an object-key write. Keep the
resource, symlink, schema and transport assertions; do not replace legitimate
operations solely to evade the detector. Unflagged operations are not assumed
safe just because a heuristic misses them.

One-based columns below have exclusive endpoints and refer only to this exact
observed source/report snapshot. This is a review inventory, not an executable
manifest, new approved fingerprint or active exclusion.

The table preserves the proposal as presented before approval. Its 19 specific
rows are now manually accepted under the recorded decision below, not activated
as exclusions or extended to future findings.

| ID | Source / line | Columns | Rule | Proposed classification |
| --- | --- | --- | --- | --- |
| A01 | [frontend/server/assets.mjs:12](../../frontend/server/assets.mjs) | 7-25 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A02 | [frontend/server/assets.mjs:12](../../frontend/server/assets.mjs) | 39-54 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A03 | [frontend/server/assets.mjs:16](../../frontend/server/assets.mjs) | 21-36 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A04 | [frontend/server/assets.mjs:18](../../frontend/server/assets.mjs) | 16-73 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A05 | [frontend/server/assets.mjs:22](../../frontend/server/assets.mjs) | 20-36 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A06 | [frontend/server/assets.mjs:34](../../frontend/server/assets.mjs) | 22-42 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A07 | [frontend/server/assets.test.mjs:13](../../frontend/server/assets.test.mjs) | 3-39 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A08 | [frontend/server/assets.test.mjs:14](../../frontend/server/assets.test.mjs) | 3-106 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A09 | [frontend/server/assets.test.mjs:15](../../frontend/server/assets.test.mjs) | 3-75 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A10 | [frontend/server/assets.test.mjs:22](../../frontend/server/assets.test.mjs) | 5-71 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A11 | [frontend/server/assets.test.mjs:30](../../frontend/server/assets.test.mjs) | 5-72 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A12 | [frontend/server/assets.test.mjs:36](../../frontend/server/assets.test.mjs) | 5-85 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A13 | [frontend/server/assets.test.mjs:42](../../frontend/server/assets.test.mjs) | 5-78 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A14 | [frontend/server/assets.test.mjs:48](../../frontend/server/assets.test.mjs) | 5-66 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A15 | [frontend/server/assets.test.mjs:54](../../frontend/server/assets.test.mjs) | 5-79 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A16 | [frontend/server/assets.test.mjs:60](../../frontend/server/assets.test.mjs) | 5-92 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A17 | [frontend/server/assets.test.mjs:67](../../frontend/server/assets.test.mjs) | 68-85 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A18 | [frontend/server/assets.test.mjs:73](../../frontend/server/assets.test.mjs) | 36-86 | security/detect-non-literal-fs-filename | DESIGN CHOICE (proposed, not accepted) |
| A19 | [frontend/server/policy.test.mjs:32](../../frontend/server/policy.test.mjs) | 63-72 | security/detect-object-injection | DESIGN CHOICE (proposed, not accepted) |

Observed warning-bearing source hashes, for comparison only:

| Source | SHA-256 |
| --- | --- |
| [frontend/server/assets.mjs](../../frontend/server/assets.mjs) | e30a2929d174682aa038c8a1f2b8c3845a1c52e11b36cc1b7ab3802fcf24b599 |
| [frontend/server/assets.test.mjs](../../frontend/server/assets.test.mjs) | 4d79bfda448539dfce118d2275fe3fbf675ddb636ea7579f79ca3df8eb35f603 |
| [frontend/server/policy.test.mjs](../../frontend/server/policy.test.mjs) | b8c464ba429579bec09380660d02b371a6c5adb8f4d857217854e464b5045d89 |

Earlier H1 manual acceptance remains limited to its 114 reports; the new 19 are
covered by the separate explicit decision below, not silently appended to that
earlier approval. Java was not rescanned or rebuilt in
this frontend-only phase; its previous 25-finding result remains historical.
H1 raw remains FAILED, H2 remains FAILED pending runtime assessment, H3 remains
PASSED; the primary-item scoreboard remains 42 PASSED / 2 FAILED / 0 BLOCKED /
0 SKIPPED. This supporting phase is not a new primary checklist item.

## Side effects and handoff

Only approved frontend/server/bootstrap/manifest/example/docs files, build output
and ignored QA reports changed. Prior AGENTS/POM/Vite/review-tool changes were
preserved, with no stage/commit/push or other Git mutation. No direct real .env,
credential environment-value or runtime-log inspection; no install/download,
browser/network request, API/data mutation or service start/stop/restart.
Ordinary Vite HMR/reload from source edits is possible, not a config-driven
restart; actual live UI behavior was not inspected.

No backend/Mongo restart is needed for these changes. The new Node server is
not running; a later approved port-5173 handover from Vite is required. Do not
execute npm start or stop the user's Vite process automatically. Production
builds must use the server rather than plain preview because of fail-closed
nonce metadata.

Remaining verification is NOT RUN: actual HTTP serving/cache coherence, browser
CSP enforcement/negative style controls, real Emotion/global styles/transitions/
menus/dialog focus/chart tooltips/resizing/HMR compatibility, real proxy/cookie/
auth behavior, accessibility/responsive reruns and H2 passive assessment. Mock
unit tests do not establish these properties on the live stack.

## Recorded manual decision — accepted, native gate unchanged

On 2026-11-08 the user replied "Approved" to the request to record manual
dispositions for the 19 specific new Phase 4A warnings while keeping the raw
gate FAILED. This accepts only A01-A19, their stated DESIGN CHOICE rationale,
trust boundaries and exact source/report snapshot above. It does not accept new
findings, future source/configuration drift or a public production deployment.

Before recording the decision, a read-only reconciliation verified the saved
native report SHA-256, all 19 unique IDs/exact diagnostic spans/rules, and all
three warning-bearing source hashes. Zero row mismatches or source drift were
found. Saved counts remain 108 warnings, zero errors/fatal diagnostics. This
was saved-evidence verification, not a fresh scan or test run.

Accepted scope: six trusted startup-loader filesystem operations, twelve
owned temporary-fixture filesystem operations, and one bounded test-array
lookup. Preserve all resource/symlink/ownership/transport assertions and stated
deployment-input assumptions. Manual acceptance is not a blanket claim that
dynamic paths or object indexing are safe.

No source/configuration/test, scanner threshold, suppression, exclusion,
executable manifest, accepted fingerprint, native report or gate criterion was
changed. Raw frontend security lint remains FAILED with 108 warnings; H1/H2
raw failures, H3 pass and primary 42/2/0/0 scoreboard remain unchanged. Runtime
HTML/CSP/proxy verification is still NOT RUN. No service, port handover,
credential/environment-file/log access, network/download or Git mutation was
performed or authorized by this documentation decision. No restart required.

Next decision: separately approve Phase 4B port-5173 handover and localhost-only
mocked-browser verification before starting the server. This decision does not
authorize stopping Vite, starting Node, real authentication/writes or a passive
container scan; each still needs its applicable explicit scope approval.
