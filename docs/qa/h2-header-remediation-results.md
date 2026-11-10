# H2 — Approved development headers and passive rerun

Date: 2026-11-08 Asia/Kolkata. **Implementation verification PASSED; H2 raw
assessment FAILED (findings retained). Manual dev-only dispositions ACCEPTED
by the user on 2026-11-08; documentation only.**

Approved [implementation plan](h2-header-remediation-plan.md). Live rerun
completed 2026-11-07 19:03:32 UTC / 2026-11-08 00:33:32 Asia/Kolkata.
Sanitized [native result](h2-passive-result-2026-11-07T19-03-32-174Z.json).

## Changes and boundaries

- Added [security-headers.ts](../../frontend/security-headers.ts): dev-only
  framing/nosniff/CSP headers, exact reviewed Refresh template comparison,
  SHA-256 bootstrap hash and fail-closed template-drift behavior.
- Modified [vite.config.ts](../../frontend/vite.config.ts) only to integrate
  the helper and serve/mode/preview context. Existing environment target lookup,
  missing-target failure, proxy destination/options and React plugin preserved.
- Added [unit regressions](../../frontend/security-headers.test.ts), ten cases,
  including installed-template agreement, hash/drift checks, dev-only behavior,
  actual config/proxy preservation and unchanged missing-target failure. Mocked
  dotenv loader avoids inspecting local dotenv contents in config contract tests.
- Added [browser smoke](../../frontend/e2e/security-headers.e2e.ts), two cases,
  using the existing safe fixtures/reporter. All API responses mocked; no real
  account, password, cookie/token, database write or product fixture needed.
- Added approved frontend header/limitations/run guidance to
  [README](../../README.md) and [SECURITY](../../SECURITY.md), retaining earlier
  README static-analysis corrections. No new dependency or lockfile change.

The CSP blocks arbitrary inline JavaScript/attributes, eval, framing and objects;
restricts default/base/form sources; permits only the exact reviewed Refresh
script hash and same-origin scripts. It retains the explicitly approved dev
inline-style compatibility and existing exact Google Fonts origins. HMR uses
only ws://localhost:5173. Browser checks abort external requests before dispatch;
font permissions do not authorize QA external traffic or downloads.

Production/preview policy unchanged. No deployment hardening is claimed.
No nonce middleware, app bootstrap/Emotion cache changes, CSS/font redesign,
backend/CORS/authentication changes, scanner exclusions or accepted manifests.

## Diff-before-verification and test evidence

The implementation/file summary and header directives were shown before tests.
The user was warned immediately before the Vite config save and possible
automatic restart. Reachability after save: localhost:5173/login HTTP 200.
No agent-initiated backend/Mongo stop/start or manual frontend launch occurred.

Final checks:

| Check | Actual result |
| --- | --- |
| npm run lint | PASSED |
| npm run test | 244 PASSED, ten files (234 existing + ten new); no failures |
| npm run typecheck:e2e | PASSED |
| Explicit strict TypeScript check of new root unit test | PASSED |
| npm run build | PASSED, unchanged JS asset index-C8PsyG58.js, 1,004,980 bytes; gzip 304.24 kB |
| Production source maps | Zero emitted maps in assets |
| Focused Chromium smoke | Both cases PASSED, 2,077 ms and 953 ms |
| Editor diagnostics / whitespace | Clear / PASSED |

Final explicit unit-test type command, from frontend:

```bash
./node_modules/.bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --strict --types node security-headers.test.ts
```

Initial shell-backed checks emitted sandbox stream-fd warnings but all exited
zero; final reruns with non-login shell completed without those messages. Initial
Vite warning for the new extensionless helper import was fixed by spelling the
`.ts` extension, not suppressed. Final build retains only the pre-existing
greater-than-500-kB chunk warning; thresholds/chunking unchanged.

Browser command, from frontend:

```bash
npm run test:e2e -- e2e/security-headers.e2e.ts
```

Actual headers on login/root matched exactly. Installed inline bootstrap bytes
matched the CSP hash. Login rendered, Emotion style sheets existed and computed
story background was unchanged. DOM-inserted unauthorized inline script did not
execute and raised a CSP violation. Mocked dashboard rendered both charts and
navigation worked with zero unexpected write requests/page errors.

The HMR case verified a real localhost Vite WebSocket connection, intercepted
only the test browser's updated LoginPage module response, delivered a synthetic
update over that routed connection and observed the new heading without page
navigation or losing typed synthetic username state. No source file/server
fixture was edited or added to induce HMR. This tests client-side Fast Refresh
compatibility, not filesystem-watcher performance. No real credential input.

Existing test files/assertions and Playwright capture settings are unchanged.
Screenshots, traces, videos, auth-state persistence and raw error/call-log
reporting remain disabled. The existing reporter labels these new H2 titles
SETUP because its ID grammar is E1–E9; the explicit file and two passed records
identify the actual executed cases. Reporter grammar was not expanded or waived.

## H2 rerun and comparison

Same approved command and eight fixed anonymous GETs:

```bash
env -u NODE_OPTIONS -u NODE_TEST_CONTEXT node docs/qa/h2-passive.mjs
```

Pinned cached image unchanged. ZAP 2.17.0, 62 enabled passive rules, network=none,
replay disabled, exact eight imported snapshots verified, passive work complete.
Seven validated empty native tree placeholders remain separate from responses.
No raw session/headers/bodies/evidence strings are persisted to host reports.

| Native rule | Initial instances | Rerun instances | Meaning |
| --- | ---: | ---: | --- |
| 10038 — CSP header missing | 2 | 0 | Original absence fixed |
| 10020 — Anti-clickjacking header missing | 2 | 0 | Original absence fixed |
| 10021 — nosniff missing | 2 | 0 | Original absence fixed |
| 10055 — CSP style-src unsafe-inline | 0 | 2 medium | Explicit dev style compatibility, not auto-accepted |
| 10109 — Modern Web Application | 2 informational | 2 informational | SPA coverage observation retained |

Rerun total: high=0, medium=2, low=0, informational=2, four instances across
two rule IDs, all on frontend `/` and `/login`. No alert reported on the six
captured anonymous backend responses; no authenticated/backend-completeness
claim. HTTP statuses unchanged: frontend/root/login and health 200; the five
other backend URLs 401. Product count was not rechecked in this read-only item.

Raw runner exit is still 2. No rule suppression, risk downgrade, warning-limit
change, altered scope or automatic informational acceptance. H2 stays FAILED
under unchanged acceptance semantics, despite the original absences being fixed.

## Recorded manual development-only decision

On 2026-11-08 the user replied "yes" to: "Approve recording these specific
remaining findings as manual dev-only dispositions, keeping raw H2 FAILED and
production hardening pending? (yes / skip / stop)" This approves only recording
the four exact instances below, not changes to code, scan semantics, production
security requirements, future findings or future source/configuration changes.

Decision snapshot: the sanitized native rerun linked above, SHA-256
`7c1c9b96cf3c210a8359ce5803eb9ac45b0315a3fe9c2e9258346f3baed9fd4c`.
Read-only membership verification confirmed exactly these four unique entries,
not a new scan or an executable acceptance fingerprint/baseline refresh.

| Rule | URL | Native severity retained | Accepted manual disposition |
| --- | --- | --- | --- |
| 10055 | http://localhost:5173/ | Medium | Documented development-only inline-style compatibility for the current Emotion/MUI/chart approach; not accepted for production |
| 10055 | http://localhost:5173/login | Medium | Same specific dev-only compatibility condition; re-review on styling/policy/serving changes |
| 10109 | http://localhost:5173/ | Informational | Expected SPA coverage observation, not evidence of an exploit or complete authenticated coverage |
| 10109 | http://localhost:5173/login | Informational | Same specific SPA observation, retained in counts and raw result |

Raw H2 remains **FAILED**, exit 2. Manual acceptance is a QA disposition record,
not a scanner pass or production waiver. No suppression, risk downgrade, rule
disable, exclusion, acceptance-criterion change or executable policy introduced.
No finding added/removed and no native JSON rewritten. H3 requires separate
approval; this decision does not authorize its execution or documentation fixes.

The remaining medium warning concerns the explicitly documented dev-only style
allowance needed by the current styling approach. A strict nonce-based style
policy and React inline-style compatibility need a separate, larger scope;
simply deleting the allowance can break the UI. Do not introduce it without
approval or extend the dev exception into production.

The user's subsequent manual decision above is separate from the earlier
implementation approval. A stricter style-CSP implementation still needs its
own approved plan; no additional changes or unchanged repeated scan follow
automatically. Production hardening remains pending.

## Side effects / untouched work

Only the approved six frontend/config/test/documentation files above, ignored QA
notes and sanitized rerun JSON changed. Previous POM and unrelated untracked
review tooling preserved and unstaged. No Git mutation, package/browser/image
download, direct `.env` inspection, credential/runtime-log access, real login,
product/user/database mutation, existing-service stop or backend/Mongo restart.
Vite config auto-reload was explicitly approved and frontend readiness verified.
All ephemeral ZAP containers/tmpfs removed; filtered post-run inventory empty.

No backend/full Maven build/coverage or H1 raw rescan run. Prior H1 manual
snapshot acceptance is not automatically extended to these new files/control
changes. Build output remains ignored; new frontend source/tests are untracked,
not staged. QA notes/results remain ignored, with no force-add operation.
