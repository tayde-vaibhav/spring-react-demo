# H2 — Limited import-only passive assessment

Completed: 2026-11-07 18:47:31 UTC / 2026-11-08 00:17:31 Asia/Kolkata.
**FAILED on findings; tooling/capture/passive completion succeeded.**

This is the initial run. See the subsequent approved
[header remediation and H2 rerun](h2-header-remediation-results.md) for current
findings; retain this initial evidence and its counts as historical.

Approved [scope and controls](h2-passive-plan.md).
Native sanitized [result JSON](h2-passive-result-2026-11-07T18-47-31-397Z.json).
No production fix or manual finding acceptance is implied.

## Execution and verification

Actual live command, shown before execution:

```bash
env -u NODE_OPTIONS -u NODE_TEST_CONTEXT node docs/qa/h2-passive.mjs
```

Exit 2 denotes completed analysis with findings, not a scanner crash. Eight
fixed anonymous GETs, no redirect following/retries/login/write methods. All
captured responses remained in memory and entered the container through stdin;
cookie values were removed before serialization. No password/environment
credential, `.env`, runtime log or browser state read.

Digest pinned:
`ghcr.io/zaproxy/zaproxy@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af`.
Actual core version 2.17.0, 62 enabled passive rules. Container had no networking,
published ports, Docker socket or inherited credentials; read-only root,
no-new-privileges, dropped capabilities, resource limits, raw files only in
bounded tmpfs and Docker logging disabled. Only the approved driver file was
mounted read-only. No install/update, spider, replay, browser or active scan.

Native startup line used by the driver:

```text
/zap/zap.sh -Xmx512m -daemon -silent -dir /tmp/h2-zap -host 127.0.0.1 -port 8090 -config database.recoverylog=false -config api.disablekey=true -config api.addrs.addr.name=127.0.0.1 -config api.addrs.addr.regex=false
```

127.0.0.1:8090 is scanner-private loopback inside its network-disabled namespace,
not an alternate application target or a published/host-accessible listener.
The host application capture uses URLs with hostname localhost only.

Explicit import API parameters: filePath=/tmp/h2-input.har,
sendRequests=false, maxMessages=8. The bundled Python convenience method lacked
the newer flags, so the verified native API endpoint is called directly.
No native API output, logs or raw HAR is persisted to host reports.

All eight native type-15 records matched the captured URL/status/body snapshots
and exact URL multiplicity. Seven native type-0 empty ancestor placeholders were
validated and counted separately. Passive queue and workers completed before
alerts were collected. No unknown history or out-of-target finding discarded.

## Captured coverage

| Fixed URL | Status |
| --- | ---: |
| http://localhost:5173/ | 200 |
| http://localhost:5173/login | 200 |
| http://localhost:8080/actuator/health | 200 |
| http://localhost:8080/app-test | 401 |
| http://localhost:8080/api/v1/products?page=0&size=1 | 401 |
| http://localhost:8080/api/v1/products/stats | 401 |
| http://localhost:8080/api/v1/auth/me | 401 |
| http://localhost:8080/qa-h2-not-found | 401 |

Health status here is HTTP status, not a new assertion of the health JSON body.
No authenticated response bodies, product count, user passwords or database
contents were checked. No products/users were created, edited or deleted.

## Findings and proposed fixes — NOT APPLIED

Counts are eight alert instances across four rule IDs, each affecting both
frontend HTML URLs. Do not misreport this as eight distinct vulnerability types.

| Severity | Rule | Finding | Instances | Proposed response |
| --- | --- | --- | ---: | --- |
| Medium | 10038 | Content Security Policy header not set | 2 | Define/test an application-appropriate CSP at the frontend serving layer. Separate Vite/HMR dev needs from the eventual production reverse-proxy/static-host policy; do not invent a permissive wildcard policy to clear a scan. |
| Medium | 10020 | Missing anti-clickjacking header | 2 | Set an intentional framing policy on frontend HTML, typically CSP frame-ancestors 'none' and X-Frame-Options DENY when embedding is not required, after approval and compatibility tests. |
| Low | 10021 | X-Content-Type-Options header missing | 2 | Set nosniff at the frontend serving layer; verify correct content types and frontend/HMR behavior. |
| Informational | 10109 | Modern Web Application | 2 | Coverage observation, not a demonstrated exploit. This import-only check does not execute SPA JavaScript or prove authenticated coverage; retain the observation without presenting it as a vulnerability fix. |

High=0, medium=4, low=2, informational=2. No alert was reported on the six
captured anonymous backend responses, which is not proof of backend security.
Absent Secure cookie flags in dev were not treated as a failure.

These are current Vite development-response findings, not evidence that an
uninspected production deployment has the same configuration. Do not mark a
production security requirement complete by changing only the dev server.
Request approval for a focused frontend-header/dev-versus-production plan and
associated documentation before configuration or production code changes.
Rerun H2 only when approved; do not silently suppress or downgrade these alerts.

## QA helper verification and initial attempts

New QA-only files:

- [Host runner](h2-passive.mjs): fixed-target capture, loopback DNS pinning,
  limits/redaction, private Docker output, owned-container cleanup, summary.
- [Host tests](h2-passive.test.mjs): 39 cases passed by direct Node test-file
  execution, including request timeout/caps, no redirect/credentials, isolation,
  privacy and invalid-summary rejection. Initial node --test output summarized
  one file, not individual case counts; direct execution verified all 39 cases.
- [Container driver](h2-zap-driver.py): private API import/passive workflow,
  strict native-history/content membership and metadata-only output.
- [Driver tests](h2-zap-driver-test.py): eight unittest methods passed in the
  cached network-disabled image, including replay flags, worker completion,
  changed-response/duplicate rejection and hostile placeholder rejection.

Synthetic positive control: eight fabricated HTML responses, zero host app
requests. Final run imported exactly eight plus seven validated placeholders,
62 enabled rules, and detected IDs 10020/10038/10021 as expected.

Earlier synthetic runs correctly blocked on an initial incorrect assumption
that all core history entries were imported responses. Count-only diagnostics
observed 15 total (eight targets/seven zero-status ancestors). No live captures
occurred before the issue was grounded in native bytecode, corrected in the QA
harness and regression-tested. No assertion or scanner threshold weakened to
make findings disappear. The Python fact-grounded workflow used actual bundled
API signatures, bytecode and runtime controls; Pylance-specific tools were not
available. Editor diagnostics cleared on all four QA files.

## Side effects and remaining limitations

Only ignored QA helpers/tests, the plan/results/summary and sanitized JSON were
created/updated. Existing tracked README/POM and unrelated untracked changes
preserved. No Git mutation, new dependency/download, production fix, existing
service restart/stop or database mutation. All owned temporary containers/tmpfs
were removed; filtered post-run container inventory was empty. No host raw
capture, scanner session, raw log or response-body report retained. No backend
restart required. H1 raw failures/manual dispositions unchanged; H3 unrun.

This is limited anonymous import-only DAST: not stock baseline crawling,
JavaScript execution, asset discovery, authenticated CRUD, CORS/CSRF proof,
production hosting/TLS verification or a complete security assessment. Cookie
value redaction and finite capture also limit analysis. The real product count
was not independently rechecked in this read-only item.
