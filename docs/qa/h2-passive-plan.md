# H2 — Proposed bounded import-only passive assessment

Plan date: 2026-11-07. **APPROVED AND EXECUTED — 2026-11-08 Asia/Kolkata.**
The user approved the bounded import-only alternative, QA helpers/tests and run.
See [actual results](h2-passive-results.md): completed assessment, FAILED on
reported findings; no production fixes approved or applied. Original proposal
wording below is retained as the scope record, not a pending implementation.

## Offline inspection evidence

The approved inspection used only temporary, automatically removed containers:

```bash
docker run --rm --pull=never --network=none --read-only \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --pids-limit=64 --memory=256m --cpus=1 \
  --entrypoint=sed \
  ghcr.io/zaproxy/zaproxy@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af \
  -n 1,260p /zap/zap-baseline.py
```

Other inspected ranges: baseline 260–700; shared helpers 1–760;
launch wrappers 1–260. Read-only `ls`/`unzip` inspected bundled add-on names,
the Import/Export 0.22.0 manifest/template and relevant built-in descriptions.
No project mount, credential forwarding, daemon, application traffic or download.

Findings from the bundled primary sources:

- Core launcher references `zap-2.17.0.jar`; this is packaged-version evidence,
  not an executed runtime version check. Multiple add-on revisions are present;
  active runtime selection is not yet verified.
- Baseline defaults to Automation Framework and spiders automatically; both
  generated-plan and legacy paths can reset a path target to the origin root.
- Without `-silent`, baseline requests add-on updates/installation. `-s`
  shortens normal output but failure handling can dump scanner logs. A normal
  baseline invocation is not by itself proof of strict network/privacy scope.
- Import/Export 0.22.0's `import-max.yaml` explicitly documents `type: har`,
  `fileName`, `sendRequests` (default false) and `maxMessages`.
  Built-in API descriptions distinguish importing recorded responses from
  replaying requests. No import/replay operation was executed here.
- `docker ps -a --filter ancestor=<pinned image>` returned no containers after
  inspection. No application or Mongo service was touched.

## Alternative requiring approval

Use ZAP's passive analysis of a finite anonymous response capture instead of
running the stock spider-based baseline. This changes discovery/coverage, not
application security. Record the result as **limited import-only passive DAST**,
not a full stock baseline or authenticated application assessment.

### Fixed live capture scope

Exactly one GET per URL below, sequentially, with no redirects, retries,
authentication, Cookie/Authorization headers, cookie jar, browser or discovery:

1. `http://localhost:5173/`
2. `http://localhost:5173/login`
3. `http://localhost:8080/actuator/health`
4. `http://localhost:8080/app-test`
5. `http://localhost:8080/api/v1/products?page=0&size=1`
6. `http://localhost:8080/api/v1/products/stats`
7. `http://localhost:8080/api/v1/auth/me`
8. `http://localhost:8080/qa-h2-not-found`

The runner must reject any other origin, URL or method. Use only hostname
`localhost`, not alternate target URLs. Resolve it locally and refuse any
non-loopback resolved address. Ignore proxy environment settings and never
follow returned URLs. Five-second deadline and 1 MiB body cap per response,
8 MiB aggregate body cap; overflow/unreachable target fails closed rather than
silently omitting evidence. If apps are unavailable, stop and ask the user to
start them; do not start them automatically.

This includes frontend dev-server HTML and anonymous backend responses only.
It does not execute SPA JavaScript, enumerate assets, log in, exercise CRUD,
prove authorization/CSRF/CORS behavior, analyse production hosting or TLS, or
replace earlier authenticated checks. Protected routes should return denial
responses; no claim of product-body coverage follows from those responses.

### Privacy and storage

- No environment credentials, `.env`, runtime logs, browser state or project
  source configuration are inputs. No credentials forwarded to Docker.
- Keep captures in host memory and stream a bounded HAR to container stdin.
  Remove actual cookie values before serialization; preserve relevant cookie
  attributes where possible. Reject unexpected bearer/JWT/credential-bearing
  material with count-only diagnostics, never print the content.
- All scanner home/database/HAR/raw report/log files belong only in explicitly
  bounded container tmpfs; no capture/session/raw report is written to host
  disk or Docker logs. Use `--log-driver=none`; capture child output privately
  and print allowlisted metadata only, including on errors.
- Only sanitized plugin ID, bounded rule name, risk/confidence, fixed target
  URL, response status, instance counts and completion/coverage metrics may
  leave the runner. No evidence strings, headers, bodies, cookies, arbitrary
  URL query strings or raw exception/log dumps in saved artifacts.
- Sanitization and limited capture affect coverage, particularly secret and
  cookie-value analysis. Document these limitations, not a blanket clean bill.

### Container and passive job controls

Use the digest above with `--pull=never --network=none --read-only`, no host
network, published ports, Docker socket, credentials or project-root mount.
Drop capabilities, enable no-new-privileges, bound memory/CPU/PIDs and use
dedicated writable tmpfs paths only. The only read-only bind mount, if needed,
contains the explicitly approved QA runner files, not other project files.

The container must launch headless ZAP directly with `-silent`, not baseline's
update/spider workflow. Confirm actual runtime/core/add-on/API availability
before importing. ZAP's API is private to the container loopback namespace.

Import the captured HAR with **sendRequests=false** and `maxMessages=8`.
Perform passive analysis only; no spider, AJAX/client browser, active scan,
requester, URL import, replay or dynamic update job. Keep all findings visible;
do not disable rules, downgrade findings, install exclusions or use `-I` to
force a successful result. Explicitly verify imported message membership/count
and passive queue/worker completion; zero messages or timeout is not a pass.

Implementation evidence corrected an initial core-history assumption: eight
HAR response records (native history type 15) also create seven empty site-tree
ancestors (native type 0). All eight imported records must exactly match their
captured URL/method/status/body snapshots, including duplicate/missing detection.
Only type-0, zero-status, empty-request/body ancestors are distinguished as
placeholders; other history fails closed. This is not acceptance of extra live
requests or ignored alert findings. Regression tests and the real synthetic
positive control verify the distinction. Read-only pinned native bytecode
confirms HarImporter.persistMessage uses type 15, SiteMap.createReference uses
type 0, and ApiResponseConversionUtils exposes the `type` field.

If those controls cannot be implemented and verified with the pinned image,
report BLOCKED; do not switch to host networking or a crawler silently.

### Proposed files and execution interface

Create only QA runner/support/test files under this ignored QA directory:

- `h2-passive.mjs`: host fixed-URL capture, Docker lifecycle, sanitization,
  bounded completion and safe summary generation.
- `h2-zap-driver.py`: container-only import/passive API driver, with raw files
  confined to tmpfs; no live application network access.
- `h2-passive.test.mjs` and, if needed, a container-driver synthetic test file:
  reject out-of-scope URLs/redirects/non-GETs, enforce caps/timeouts, redact
  cookie values, withhold raw error output, preserve alert counts and clean up
  only owned ephemeral resources. Synthetic checks before any live capture.

No dependencies, manifests, production code, Git configuration, README or
SECURITY changes. Show the implementation diff summary before verification.
Use existing Node/image tooling, with no package/image/browser downloads.

Proposed host command (not runnable until the approved runner is created):

```bash
node docs/qa/h2-passive.mjs
```

Runner contract: fixed 240-second overall deadline, private child output,
explicit owned-container cleanup on success/failure/termination, no interaction
with user-owned services. The exact internal Docker/startup command must be
shown after implementation and before live execution; no unverified API flag
is presented here as already working. Stop for further approval if execution
needs a material scope change or could exceed five minutes.

Exit/result policy: distinguish completed scans with findings from scanner
failure/incomplete coverage. Preserve risk counts including informational
findings; no automatic acceptance or green security status. Save only the
sanitized summary and append the actual result to `test-report.md`.

## Approval requested

Approve this **bounded import-only alternative**, including its small QA-only
helpers, synthetic tests and subsequent finite capture/passive analysis after
the diff/actual command is shown. Side effects: eight anonymous localhost GETs
and ordinary application access logs, temporary isolated scanner process/tmpfs,
QA helper/tests and sanitized reports. No application data writes, external
traffic/downloads or existing-service restarts/stops. This does not authorize
production fixes or H3. If not approved, keep H2 unrun or explicitly skip it.
