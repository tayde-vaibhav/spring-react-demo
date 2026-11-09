# Phase 3 — CSP feasibility and proposed implementation/test plan

Date: 2026-11-08. Approved scope: local, read-only feasibility review and QA
documentation. **Review completed; no CSP implementation or browser validation
performed. H2's raw result remains FAILED with its accepted dev-only dispositions.**

## Executive decision

A nonce-based policy is technically plausible with the installed Emotion/MUI
and Vite stack, but is not a safe one-line removal of unsafe-inline. The missing
pieces are per-response HTML/header integration, an explicit Emotion cache and
browser evidence for the actual dynamic-style paths.

Recommended direction: retain the accepted development policy for now; choose
a nonce-capable production HTML-serving path, then implement and verify a small
candidate before enforcing a stricter policy. Do not commit a fixed nonce, use
a client-generated nonce to authorize the page, replace MUI/Recharts speculatively
or broaden the existing script/CORS policy.

No production HTML-serving configuration was found in the inspected repository
inventory; the identified Compose file is for MongoDB. This does not establish
what hosting the user may have outside this repository. That choice needs input
before production implementation can be scoped accurately.

## Evidence from current source and installed dependencies

Only repository source and explicitly selected installed package files were
read. No local secret/environment file or credential environment value was
inspected. Package versions below were read from installed package metadata,
not inferred from manifest ranges. No external documentation/network request
was made, and no browser-standard conformance result is claimed.

| Area | Evidence | Consequence |
| --- | --- | --- |
| Current enforced policy | [Header helper](../../frontend/security-headers.ts), lines 15-37, enables dev-only CSP and permits inline styles, with exact script hash and localhost HMR | Preserve the accepted policy until a separately approved replacement is demonstrated; no production policy is installed by this helper |
| App providers | [Entry point](../../frontend/src/main.tsx) and [app](../../frontend/src/App.tsx), lines 101-115, have no custom Emotion CacheProvider | A hardened candidate needs an explicitly wired cache before rendering the application, including its error boundary and global styles |
| Emotion 11.14.0 / sheet 1.4.0 | [Cache implementation](../../frontend/node_modules/@emotion/cache/dist/emotion-cache.browser.development.esm.js), lines 578-588, forwards options.nonce; [sheet creation](../../frontend/node_modules/@emotion/sheet/dist/emotion-sheet.development.esm.js), lines 45-55, sets it on style elements | Style-element nonce support exists; preserve style ordering and one cache per document rather than recreating it on render |
| Emotion global styles | [Global implementation](../../frontend/node_modules/@emotion/react/dist/emotion-react.browser.development.esm.js), lines 381-389, propagates cache.sheet.nonce to the global sheet | CssBaseline/global styles can use the same cache nonce; this still requires real integration tests |
| Vite 8.3.5 | [HTML configuration contract](../../frontend/node_modules/vite/dist/node/index.d.ts), lines 3663-3669, requires its placeholder to be replaced uniquely per request; [client updateStyle](../../frontend/node_modules/vite/dist/client/client.mjs), lines 1288-1297, applies the nonce read from a meta element | A fixed html.cspNonce config string is insufficient. If dev CSP is hardened too, imported CSS, HMR and overlay style injection need matching nonce plumbing |
| React DOM 19.3.1 | [Style writer](../../frontend/node_modules/react-dom/cjs/react-dom-client.development.js), lines 2898-2913, uses style properties/setProperty | Do not infer a CSP violation solely from a DOM style attribute. Browser treatment of the actual insertion/update mechanism must be tested |
| MUI 9.5.0 | [Fade](../../frontend/node_modules/@mui/material/Fade/Fade.js), [Grow](../../frontend/node_modules/@mui/material/Grow/Grow.js), and [Popover](../../frontend/node_modules/@mui/material/Popover/Popover.js) modify style properties | Test transition completion, menu placement and portal behavior; do not preemptively remove dynamic styles or weaken focus/accessibility behavior |
| Recharts 3.10.1 | [ResponsiveContainer](../../frontend/node_modules/recharts/es6/component/ResponsiveContainer.js), lines 140-155, and [TooltipBoundingBox](../../frontend/node_modules/recharts/es6/component/TooltipBoundingBox.js), lines 74-97, supply React styles; [DOMUtils](../../frontend/node_modules/recharts/es6/util/DOMUtils.js), lines 41-54, writes measurement-span styles directly | Test chart dimensions, text measurement, hover tooltips and resizing, not merely SVG presence |
| Conditional MUI layer ordering | [useLayerOrder](../../frontend/node_modules/@mui/system/ThemeProvider/useLayerOrder.js), lines 19-45, conditionally creates a style element without a nonce assignment | Treat enabling modularCssLayers as a separate compatibility boundary. Current application theme does not explicitly enable it; do not claim this conditional path is an active defect |
| Fonts | [Application CSS](../../frontend/src/styles.css), line 1, imports Google Fonts; the current CSP names exact CSS/font hosts | Preserve current appearance/origin choices during a prototype. Self-hosting/removing fonts is a separate licensing/assets/network decision, not an automatic CSP fix |

The default Emotion cache shown in its installed implementation has no nonce
option. Supplying a nonce on an HTML meta element alone therefore does not
configure Emotion. Conversely, nonces on style elements do not themselves
authorize HTML style attributes. Direct CSSOM property updates, parsed attributes
and text-based style insertion are different paths; their relevant browser
behavior is an explicit verification item, not an assumption that every React
style prop breaks or that every such update is universally safe.

## Hosting options and manual decisions

| Option | Required capability / cost | Decision |
| --- | --- | --- |
| A. Nonce-capable HTML server, reverse proxy or edge | Can generate an unpredictable nonce per delivered HTML response and modify both headers and HTML consistently; runtime Emotion styles receive the same value | Recommended fit for preserving the current runtime styling stack; exact hosting implementation remains undecided |
| B. Static-only hosting with no per-response HTML processing | No secure per-response nonce wiring available at that layer; runtime-generated style content cannot simply be covered by a fixed build-time hash list | Requires a separate CSS extraction/styling or hosting architecture assessment. Do not promise a small change or silently retain a production inline-style exception |
| C. Development-only nonce experiment | Requires a separately approved local serving/test arrangement compatible with the existing localhost:5173 workflow and Vite transforms | Can supply compatibility evidence without deploying production, but is not itself production hardening or authorization to change the accepted dev policy |

User input needed before Phase 4 production work: whether per-request HTML
processing is available or the deployment must be static-only. Also confirm
production UI/API origins and whether the current exact font hosts should remain
allowed. No hosting service, external origin or font download is authorized by
this feasibility review. If deployment is undecided, first approve a bounded
local proof-of-concept scope rather than guessing the final infrastructure.

## Proposed Phase 4 sequence — not approved or executed

1. **Agree the serving boundary and exact diff.** Identify the HTML/header owner,
   same-origin API routing and cache behavior. Show exact proposed files and
   restart ownership before any edit. Keep backend JWT, cookies, CSRF, CORS,
   product contracts and Mongo unchanged.
2. **Wire a hardened candidate, without immediately enforcing it globally.**
   Generate a cryptographically random per-response nonce at the serving layer
   (at least 128 bits of randomness), propagate it through a controlled HTML
   marker and an explicit Emotion cache before render. Use Vite's placeholder
   facility only with real per-request replacement if the candidate includes
   Vite. Fail closed for missing/malformed/unreplaced values when hardened mode
   is enabled; do not impose that new requirement on unchanged dev mode.
3. **Handle response/cache consistency.** Do not use a single process-global
   nonce or regenerate it on React render/navigation. Header and HTML must agree
   for each document; test separate requests and concurrent documents. Specify
   HTML/CDN/conditional-304/service-worker behavior so caches do not reuse a
   shared nonce or pair a new CSP with old cached HTML. Hashed static assets may
   retain their independent cache policy. Never log nonce/header/body values.
4. **Exercise a report-only candidate, then an enforced candidate.** Retain the
   current enforced protection during report-only evaluation. Target a policy
   that permits same-origin/exact required external styles and nonced style
   elements, excludes unsafe-inline/unsafe-eval, and sets style-src-attr to none.
   Keep script, frame, object and form protections; no production localhost HMR
   exception. Do not add unsafe-hashes, a broad wildcard or a fixed script nonce
   to make tests pass. Multiple CSP headers intersect; a report-only header
   cannot relax an already enforced header. Configure/test the intended pair
   deliberately rather than appending an accidental second policy.
5. **Fix only demonstrated incompatibilities.** Replace a specific app-owned
   text/attribute style path with a class if a browser test proves a failure.
   Library-internal incompatibilities require an upstream/configuration/custom
   renderer decision and separate approval, not node_modules patches or removed
   transitions/tests. No bulk conversion of sx/theme rules is justified yet.
6. **Enforce after the complete matrix passes.** Rerun applicable static checks,
   UI/accessibility/responsive tests and bounded passive analysis against the
   actual chosen serving path. Keep informational SPA observations visible.
   Update README/SECURITY and the QA report within the implementation's approved
   documentation scope. No claim of a clean native H2 gate solely because the
   unsafe-inline warning is gone.

Likely application touch points are the entry point plus a small cache helper,
HTML metadata/serving integration and focused tests. Theme/page/styles changes
are conditional on demonstrated failures, not automatically in scope. Existing
dev-header helpers/tests should remain unchanged unless a dev-policy change is
explicitly approved. Production serving files cannot be named accurately before
the hosting choice is known.

@emotion/cache 11.14.0 is currently installed transitively, not declared as a
direct application dependency. Importing it explicitly should be accompanied by
an approved direct dependency/lockfile update. No package install/update was
performed or authorized here; ask before any required cache resolution/download.

## Proposed verification matrix — all NOT RUN in Phase 3

| Area | Required evidence before enforcement |
| --- | --- |
| Nonce and HTML contract | Distinct nonces across independent/concurrent document responses; identical per-document header/meta/cache values; no fixed nonce/placeholder; malformed/missing values fail closed only in hardened mode |
| Negative style controls | Unnonced/wrong-nonce style elements and parsed/setAttribute style payloads cannot change computed appearance; intended nonced styles do. Record actual behavior of individual property writes rather than assuming it |
| Script protection | Existing unauthorized-script and event-handler probes still fail; no unsafe-eval, fixed nonce, hash drift bypass or script relaxation |
| Emotion/global styles | CssBaseline, theme/sx rules, portals and error fallback retain expected computed appearance and matching cache sheets, without duplicate/leaking caches |
| Login and forms | Labels, focus, loading/errors, input dimensions, select menus, switches and validation feedback work with synthetic/mock data |
| Catalogue and account menu | Sorting/filtering/pagination states render; popover placement, scroll locking and menu transitions work |
| Delete dialog | Open/cancel/Escape and keyboard focus trap/return remain correct, without submitting a real product deletion |
| Dashboard | Both charts have meaningful dimensions; ticks and hover tooltip text/placement work; resize, empty/loading/error states work |
| Responsive/accessibility | Repeat applicable F1/F2 checks at the existing mobile/desktop breakpoints; no hidden or disabled controls to mask regressions |
| Development, only if changed | Imported CSS updates, React Refresh state retention, HMR WebSocket and error overlay remain usable; production must not inherit HMR allowances |
| Production artifacts and host | Actual production HTML/static asset serving, deep-link routing, cache/header coherence and exact API/font destinations tested; a modified browser response or Vite check alone does not certify the real host |
| Passive/static gates | Fresh H1 analysis of changed files and the approved bounded H2 assessment, with unchanged native diagnostics/severities and explicit residual review |

Use the existing cached Chromium and localhost:5173 only. If another browser,
port, container, package, serving process or longer-than-five-minute operation
is needed, obtain separate approval first. Begin with all API calls mocked,
no real login or write requests, and no credentials. Preserve capture-off
settings and block external traffic before dispatch, including permitted fonts.
Fallback-font tests cannot certify the external font fetch path; production
origin/network validation needs its own explicit approval.

Collect CSP events in memory using bounded, sanitized directive/disposition
metadata, not full URLs, script samples, report request bodies, cookies, tokens
or response HTML. Do not configure an external report endpoint. DOM/browser
probes are future separately approved tests, not permission to execute them now.

## Current status and safety

This review is PASSED as a feasibility/planning deliverable, **not an H2 scan
pass**. H1/H2 raw gates and exact manual dispositions are unchanged; primary
checklist scoreboard remains 42 PASSED / 2 FAILED / 0 BLOCKED / 0 SKIPPED.
No implementation/test/build/browser/scanner or live application request ran.
No production or dev configuration, npm manifest/lockfile, installed dependency,
README/SECURITY/AGENTS, database or Git state was changed by this phase.

Only this ignored QA plan and the pre-approved QA summary were written. Existing
working-tree changes were preserved. No secret/local .env/credential-value/log
access, network/download/install, service operation or restart occurred. No
manual intervention or restart is needed now. A later frontend serving/config
change may require a user-approved reload/restart; backend/Mongo restart is not
expected for the proposed frontend-only direction.

Next decision: choose nonce-capable per-request HTML serving versus static-only
hosting, or request a bounded local proof-of-concept plan if hosting is undecided.
Then approve an exact Phase 4 implementation/test/documentation scope before
any code, configuration, dependency or service changes.
