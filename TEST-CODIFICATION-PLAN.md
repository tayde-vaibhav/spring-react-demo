# Test codification roadmap

## Approval and current status

Roadmap approved by the user on 2026-11-08. This document records the approved
design and proposed I7/I8 scope additions. Approval covers this plan document;
it is not authorization to implement every task, run tests, install tools,
download dependencies/images/advisories, or start/stop services.

I1 traceability is complete at commit `0cf1894`: all 44 primary A-H checklist
items were mapped, with 23 having committed suite/runner coverage, 15 partial
and 6 manual/ad-hoc only. Those classifications are not fresh test results,
coverage percentages or a claim that every checklist assertion is automated.
I2-I8 execution remains individually gated.

I2 implementation and the listed documentation updates were approved on
2026-11-09. The candidate now adds Boot-managed, test-scoped container support,
imports owned service connections into all full Boot contexts, removes the
external test-URI prerequisite, and adds isolation/real-persistence regressions.
Existing assertions and mocks are preserved. Runtime isolation and actual
unavailable-Docker acceptance now pass as detailed below. Full I2 is not yet
PASSED: only fresh-clone acceptance using the user's committed candidate remains.

I2 verification stage 1 passed on 2026-11-09: a bounded Maven Central-only
focused build completed successfully in 43.414 seconds and ran 21 Docker-free
guard checks with zero failures, errors or skips. This included Maven's
test-compilation phase, not the full clean verification or live Mongo tests.
Dependencies/build outputs were updated; no Docker access or service operations
occurred.

I2 stage 2 read-only preflight also passed: Docker 28.5.1 is reachable through
the default local Unix socket, with no relevant host/strategy/JVM overrides
found and cleanup not disabled. Mongo 7.0.45 is cached; Ryuk 0.14.0 and Alpine
3.17 are absent. No images were pulled and no containers were started/stopped.
I2 stage 3 subsequently downloaded only Ryuk 0.14.0 and Alpine 3.17 and
confirmed both in the local cache in 10.4 seconds, within the approved
four-minute bound. No containers or tests started during image acquisition.

I2 stage 4 full `clean verify` then FAILED: 289 tests, zero assertion failures,
25 errors and zero skipped, Maven duration 28.197 seconds. Database environment
variables were removed. Spring's dependency-injected provider excludes its own
guard bean, so the last-customizer assertion rejects the full Boot contexts.
The 21 pure guard checks do not cover that injection behavior. Five test
containers were observed starting; one remained at the first cleanup check,
then none on follow-up without manual removal. Existing development Mongo
state/start time/health were unchanged. The approved test-only remediation now
uses a bean-factory provider lookup and adds three Docker-free real Spring
wiring regressions: self inclusion/owned settings, trailing-customizer rejection,
and non-owned settings rejection. No existing guards/assertions were removed.
The fixtures are test-only configurations with mocked container metadata and
no client/container startup. The corrected focused Maven build subsequently
PASSED: 24 checks, zero failures/errors/skips, Maven time 7.688 seconds; all
three wiring regression results were confirmed in the Surefire report. No
Docker access occurred during the focused rerun.

The corrected full rerun then FAILED: 292 tests, zero assertion failures,
25 errors, zero skipped; Maven time 27.467 seconds, runner time 39.9 seconds.
All 24 guard checks passed, but full Boot contexts still rejected the order.
Cached Boot metadata shows two unordered Actuator Mongo metrics customizers,
which tie with the guard at lowest precedence. The focused fixtures did not
include that auto-configuration chain. Five test containers started; cleanup
confirmed none remaining and unchanged development Mongo identity/state/start
time/health. The subsequently approved test-only registration fix now moves
only the owned guard definition after ordinary/auto-config definitions,
before instantiation; missing or already-created guards are rejected. Native
customizers retain their definitions/order, and the endpoint/final-order
assertions are unchanged. Four added regressions cover the actual Actuator
Mongo metrics auto-configuration/listeners, later-customizer rejection,
metadata-only movement and missing/already-created guard rejection. The
registration correction's focused Maven build subsequently PASSED: 28 tests,
zero failures/errors/skips, Maven time 9.806 seconds; all four new outcomes
were confirmed individually from the Surefire report. No Docker access occurred.
The latest working-tree full runtime rerun subsequently PASSED: 296 tests,
zero failures/errors/skips, Maven time 41.129 seconds, runner elapsed 48.3 seconds.
Database environment variables were removed; live ping/owned endpoint override,
product persistence/auditing/version/conflict/qa-fixture cleanup assertions all
passed. Packaging and JaCoCo HTML/XML completed. Five test containers started;
cleanup confirmed none remaining and unchanged development Mongo identity/state/
start time/health. Both prior failures remain recorded. The actual unavailable-
Docker check subsequently passed as detailed below. Genuine user-committed
fresh-clone verification remains the final I2 gate; full I2 is not complete
merely because the working tree passed.

The unavailable-Docker read-only isolation preflight completed: Bubblewrap
0.11.1 and unshare 2.41.3 are installed, required Bubblewrap flags are present,
and JDK/Maven/Testcontainers caches exist. Unprivileged user namespaces are
enabled, but AppArmor's unprivileged-userns restriction is also enabled; no
standard bwrap/bubblewrap profile file was found. This is inventory evidence,
not proof that namespace creation is permitted. No namespace was launched.

The earlier proposed 15-second Bubblewrap capability probe used only a read-only
system runtime, empty temporary filesystem and isolated user/PID/network
namespaces to execute `true`. Clear inherited environment and drop capabilities;
do not bind Docker sockets, the real home/configuration directories or the
project. No Maven, Docker commands, downloads or services run in this probe.
If denied, report BLOCKED without changing AppArmor/sysctls or retrying through
a weaker isolation mode. Only after a successful probe and a separate approval
should an exact offline Maven failure-path command be executed with approved
minimal runtime/backend/cache mounts and an owned writable build-output area.
That check must prove an actionable missing-Docker error/nonzero Maven exit,
not mistake a sandbox/bootstrap/compilation failure for the intended result.

The detailed I1 matrix is currently in the local ignored QA report. I8 will
publish the durable sanitized traceability/results summary in root
`TESTING.md`; a fresh clone must not depend on ignored QA evidence.

Follow [AGENTS.md](./AGENTS.md), [SECURITY.md](./SECURITY.md) and the repository's
gated QA protocol. Preserve existing tests, API contracts and unrelated edits.
H1/H2 remain disposed with historical raw failures retained. Codifying their
tools does not convert those scanner outcomes into clean passes.

## Prerequisite 1: self-contained backend tests (I2)

### Proposed changes

- Add compatible, test-scoped Testcontainers support in
  [the Maven configuration](./backend/springreactdemo/pom.xml). Confirm exact
  dependency versions/APIs before proposing the implementation diff.
- Supply database connections through owned test containers, removing the
  mandatory database-environment prerequisite from the default automated test
  path in [application-test.yml](./backend/springreactdemo/src/main/resources/application-test.yml).
- Cover every database-capable application test context, including the
  dev-profile API-documentation test. Unit tests with mocked persistence should
  remain independent of Docker.
- Ensure exported development connection settings cannot redirect automated
  tests to the development database. Never add a development-URI fallback.
- Review affected README, SECURITY, AGENTS and environment-template guidance
  in the implementation proposal. Do not rename variables or invent an
  alternative external-database mode without explicit approval.

### Acceptance criteria

1. Full `./mvnw clean verify` passes with Docker as the only external service
   and without database environment variables. Java and build-tool/bootstrap
   prerequisites still apply; dependency/image acquisition is separately gated.
2. Real database tests use only their owned isolated database/container, not
   the existing development Mongo service or its named volume.
3. Docker unavailability produces a clear nonzero build failure, not silently
   skipped integration tests or an external-database fallback.
4. Verify the unavailable-Docker path with an isolated process/configuration;
   never stop the user's Docker daemon or Mongo container for this check.
5. Owned test resources are cleaned up on success and failure; retain existing
   assertions and show isolation evidence without revealing connection secrets.
6. Distinguish working-tree verification from fresh-clone verification. Genuine
   fresh-clone proof must use the user-committed candidate; the agent must not
   create a commit simply to make this check possible.

## Prerequisite 2: separate E2E serving modes (I6)

The current [Playwright configuration](./frontend/playwright.config.ts)
discovers both Vite-only HMR/header tests and standalone Node-only nonce/proxy
tests under the same frontend URL. A single unchanged server cannot satisfy
both sets' serving-path assertions.

### Proposed changes and acceptance criteria

- Define disjoint projects/configurations for Vite and standalone Node modes,
  with explicit prerequisite/mode validation and documented commands.
- Retain every existing spec and assertion. Do not remove incompatible tests,
  relax headers or hide failures to obtain a green suite.
- Preserve localhost-only browser traffic, headless operation, environment-only
  credentials, zero retries, disabled sensitive recordings and ignored artifacts.
- Plan an approved service handover on the existing project ports, or separately
  approve an owned isolated test environment. Never stop user-owned apps
  implicitly or introduce additional ports without agreement.
- Resolve the shared-proxy-peer login-limiter constraint before repeated runs.
  Prefer an isolated E2E backend/database and bounded authentication batches.
  Keep production throttling intact; owned-process restarts, if proposed, need
  explicit approval. Never silently wait out 429s, trust spoofed forwarding
  headers, weaken limits or reset the development database.
- Both serving-mode suites must complete three consecutive runs without
  retries. Define and verify the clean baseline before/after each run. Record
  flaky behavior without rerunning until green or omitting either mode.
- Temporary application records must be qa-prefixed, owned by the test and
  cleaned up; preserve the 500-product development baseline whenever it is the
  approved target. A separate E2E database requires explicit approval first.

## Recommended committed automation: approved scope additions

The following work is planned as explicitly approved I7/I8 sub-batches. Each
implementation still needs its own file/test proposal and applicable approval;
networked scanner execution is separate from writing or testing its wrapper.

| Source items | Proposed deliverable | Acceptance and boundaries | Placement |
| --- | --- | --- | --- |
| A1 + D3 | Shared tracked-file/history hygiene and secret-scanning wrapper under the existing tools/qa tree, with synthetic positive/negative controls. | Detect forbidden tracked artifacts and secret patterns. Report redacted locations/counts only. Generate synthetic fixtures at runtime; never inspect real local environment files. Tool installation is separately gated. | I7 sub-batch |
| D1 | Explicit network-enabled npm audit command and report adapter. | Distinguish vulnerabilities from unavailable tools/network failures; report severity and available fixes. No automatic audit fix. Advisory failure policy requires approval. | I7 sub-batch |
| D2 | Reproducible Maven SBOM generation, pinned OSV workflow and a separate outdated-dependency report. | Record tool versions/scope. Keep known vulnerabilities separate from newer available versions. Downloads/advisory queries require approval; do not treat parser fixtures as a real vulnerability scan. | I7 sub-batch |
| F3 | Bounded browser-performance runner using existing Playwright/CDP capabilities. | Measure the actual standalone production-serving path with documented sampling conditions. Report timings/bundle sizes without calling them Lighthouse scores. No performance threshold before baseline review. | I7 sub-batch |
| H3 | Documentation link, declared-command, configuration-reference and environment-template contract checks. | Inspect committed templates/configuration only. Detect stale references while retaining human semantic review of security claims and architecture. | I8 sub-batch |

A1 and D3 can share an implementation but must retain separate traceability
and results. Commit selected sanitized tooling, not the ignored QA directory,
real runtime logs, captured requests or credential-bearing artifacts.

## Remaining I2-I8 sequence

| Item | Planned work | Gate |
| --- | --- | --- |
| I2 | Implement and prove the backend isolation prerequisite above. | Show exact files/tests/side effects first; dependency, image, container and failure-path approvals remain explicit. |
| I3 | Report actual JaCoCo coverage for relevant service/controller/security classes/packages. Add JaCoCo only if absent. Propose 80% where realistic, otherwise the measured current level rounded down with metrics/scope stated. | Threshold enforcement needs separate approval; do not exclude code just to meet a number. |
| I4 | Present exact missing security test cases, then implement approved MockMvc/integration regressions. Priorities include alg=none, actual login-to-429, generic credential-error equivalence, injection edge cases and full CORS preflights/header checks. | Show the test list before writing. Preserve existing access-matrix, CSRF and strict unknown-field tests. |
| I5 | Measure Vitest coverage and propose approved MSW-backed component tests for auth/routes/roles/list/form/conflict behavior. | Component coverage is distinct from browser coverage; dependencies and thresholds need their approvals. |
| I6 | Implement serving-mode separation, prerequisite validation and the full three-run stability exercise. | Agree clean-state, service ownership/handover and limiter strategy before execution. |
| I7 | Create the CI-ready verification entry point and implement the approved automation sub-batches above, one at a time. | Show diffs/tests for each batch; scanner execution and policy enforcement remain separately gated. |
| I8 | Create root TESTING.md with commands, prerequisites, isolation/data rules, traceability and sanitized results; implement approved documentation contract checks. | Review actual commands/results and disclose remaining manual work and disposed findings. |

The following partial gaps require separate proposed test lists and approval
rather than silent inclusion in the scope additions:

- A non-disruptive runtime-health preflight, independent of the outage runner.
- Actual production-bundle secret/internal-URL/source-map assertions.
- Scoped runtime log-leak capture/canary regressions.
- Safe G4 pre-restart baseline capture and isolated restart orchestration.
- The bounded passive DAST runner and its positive controls.
- Remaining validation, reversed price-bound, unsupported-method/body-limit,
  error-response and leakage cases identified in I1.

## One-command verification boundaries (I7)

The proposed entry point should:

- Run backend verification and frontend lint, application/E2E typechecks,
  unit tests and production build, exiting nonzero on failure or missing
  prerequisites. Include approved offline QA-tool regression suites explicitly.
- Include the owned Testcontainers lifecycle documented and approved under I2.
  This is not permission to control existing development services.
- Avoid silently installing dependencies, browsers or scanner tooling. Make
  required bootstrap/cache/image prerequisites explicit.
- Make E2E, network audits, performance/load tests and disruptive resilience
  checks explicit options with clear side effects and failure semantics.
- Never implicitly start, stop or reset user-owned development services, weaken
  existing checks, suppress raw findings or convert unavailable checks to passes.

## Evidence, documentation and manual boundaries

- Report each approved item/batch with its scope, commands, status, concise
  evidence, changed files, side effects and remaining limitations.
- Keep credentials, token/cookie values, full sensitive bodies and real logs
  out of reports, test artifacts, screenshots and source control. Use only
  approved exported credentials; never inspect actual local environment files.
- Append the pre-approved local QA report during execution. I8 will provide a
  tracked sanitized summary at the repository root, not under ignored docs/.
- Human approvals, exact-snapshot finding dispositions, architectural/performance
  recommendations and semantic security-documentation review remain manual.
- After I8, report the A-I scoreboard, remaining manual-only work and prioritized
  proposed fixes. Do not silently relabel historical H1/H2 scanner outcomes.

## Per-batch approval and Git handoff

1. Show exact proposed files, test cases, side effects and expected duration.
2. Obtain the applicable implementation/documentation/network/service approval.
3. Implement the approved scope and show the diff.
4. Run approved verification and document results; propose fixes on failure
   without implementing unapproved changes.
5. Supply meaningful manual commit/push/PR commands at the agreed milestone.
   The user controls Git mutations; the agent does not stage or commit.

The approved 15-second Bubblewrap capability probe passed with exit 0. It ran
only /usr/bin/true in private user/PID/network namespaces with a read-only /usr
and temporary proc/dev/tmp; no project/home/Docker socket was bound. No Maven,
Docker commands, installations, downloads or service changes occurred. This
proves namespace capability, not the actual unavailable-Docker failure path.

The approved offline negative-path attempt is BLOCKED at its isolation
preflight. The child exited 2 in approximately 0.13 seconds, before Maven;
its temporary output directory has zero entries and no Surefire reports.
The wrapper suppressed the exact guard diagnostic, so the failing isolation
condition is not yet identified. This is a harness prerequisite issue, not
evidence of an application/Mongo failure or a successful missing-Docker check.
No Docker command, service operation, download or database access occurred.

The approved fixed-label diagnostic retry also exited 2 before Maven, reporting
"unexpected inherited environment". Earlier namespace/socket/interface checks
passed. The installed bwrap manual documents that --clearenv retains PWD;
the harness's five-variable allowlist excludes that variable. No environment
values were printed, and no guard was changed or bypassed.

The approved env -i launcher correction is now applied to the temporary
runner. Its single retry passed every namespace/socket/interface/environment
preflight, including zero database/credential variables. Maven then exited 1
after 1.6 seconds, before compilation/Surefire; temporary output still has zero
entries. The sanitized cause-class evidence is java.lang.IllegalStateException;
the expected Docker-required message was absent. This bootstrap failure is
BLOCKED, not a valid negative-path pass. No isolation guard was loosened.

The subsequently approved bootstrap diagnosis identified permission-denied
file-lock errors with the read-only repository. A temporary writable copy of
the 411 MB cached repository resolved that failure while preserving the original
cache, read-only source/runtime inputs and every isolation guard. Explicit
env -i entry retained only the five intended variables. No downloads, Docker
commands, host-policy changes or development-service operations occurred.

Actual unavailable-Docker check: PASSED. Offline scoped Maven execution took
13.4 seconds and exited 1 with the exact actionable Docker-required message in
both output and Surefire evidence. Both integration tests reported expected
context-startup errors: 2 tests, 0 assertion failures, 2 errors, 0 skipped.
The negative-check runner exited 0. This proves the missing-Docker failure path,
not a successful full build. Earlier harness-blocked attempts remain recorded.

The scoped command remains MongoContainerIsolationIntegrationTest with only
read-only backend sources,
the cached Maven distribution, a temporary writable dependency-cache copy and
necessary runtime files;
use temporary writable build/home directories and explicit secret-free settings.
Clear the child environment, expose neither Docker sockets nor host networking,
and verify those isolation conditions before Maven. Use the cached wrapper with
MAVEN_USER_HOME=/qa-cache and an offline command equivalent to:
./mvnw -o -B -ntp -gs /qa/settings.xml -s /qa/settings.xml
-Dmaven.repo.local=/qa-cache/repository -Dspring.test.mockmvc.print=NONE
-Dtest=MongoContainerIsolationIntegrationTest test.
Require a nonzero Maven result specifically caused by the actionable missing-
Docker prerequisite message, not a setup/cache/compilation failure or skipped
tests. Keep raw Maven output out of the report and inspect sanitized evidence
only. This scoped negative check is not another full clean verify. No downloads,
Docker commands/container starts or development service changes are permitted;
never stop Docker/development Mongo or weaken host policy for this check.
Next gate: the user manually commits the intended I2 candidate, followed by
separate approval for a genuine fresh-clone full verify with only local Docker
and no database environment variables. Do not create an agent commit or call a
dirty export a fresh clone. The 28-check focused suite, 296-test working-tree
full build and actual unavailable-Docker check all passed. Fresh-clone proof
alone remains pending; I3 has not started. See
[backend test setup and pending evidence](README.md#backend-tests-and-coverage).
