# H1 — Phase 1 fresh static-analysis comparison

Date: 2026-11-08 (repository session date). Approved scope: fresh unfiltered
Java/frontend security analysis with cached tooling, comparison with the accepted
snapshot, generated reports and QA documentation only. No implementation fixes,
suppression changes, acceptance expansion or service operations.

## Outcome

Evidence refresh/comparison completed successfully. **H1 raw gates remain FAILED**:
both commands exited 1 because the strict gates reject the retained findings.
Neither failure is a compilation, analyzer startup, missing-class or parse failure.

| Scope | Previous | Fresh | Added / removed | REAL confirmed in reviewed findings | FALSE POSITIVE | DESIGN CHOICE |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Java | 25 | 25 | 0 / 0 accepted-membership differences | 0 | 4 | 21 |
| Frontend / QA tooling | 89 | 89 | 0 / 0 exact diagnostic differences | 0 | 32 | 57 |
| Total | 114 | 114 | No new unmatched diagnostic | 0 | 36 | 78 |

These are the existing narrow review classifications, not a new guarantee of
application safety. Design choices retain their documented limitations. The
[accepted manual record](h1-final-manual-disposition.md) was not rewritten,
expanded, converted into executable policy or used to suppress scanner output.

## Commands and execution

Backend module, bounded to 210 seconds by a one-shot process supervisor:

```bash
./mvnw -o -B -ntp -Pstatic-analysis -DskipTests compile spotbugs:check
```

Frontend module, bounded to 60 seconds by the same supervisor:

```bash
npm run lint:security -- --format json --output-file ../docs/qa/h1-phase1-frontend-20261108.json
```

- Final Java command: exit 1, 13,834 ms, 25 bugs, zero analyzer errors; no timeout,
  spawn error, missing offline dependency or compilation failure.
- Final frontend command: exit 1, 4,918 ms; the zero-warning gate triggered.
  No timeout, spawn error, error diagnostic or fatal diagnostic.
- Initial sandboxed subprocess attempts returned EPERM. Both commands were
  rerun with explicit execution escalation; only final completed reports/counts
  above establish the scanner outcome. Raw console output was not printed or
  saved, and no failure was converted to success.
- An initial ad hoc metadata extraction assumed double-quoted XML attributes;
  native XML uses single quotes, so that extraction was not valid evidence of
  identity or coverage. Final Java validation used the existing bounded XML
  adapter and independent class inventory. Its sandboxed subprocess timed out
  at ten seconds; the approved outside-sandbox validation succeeded. No adapter,
  parser, scanner or application code was edited to perform this validation.

Maven was offline; npm ran installed tools without installation, audit or
autofix. No application/test runner, live QA script or network scan was executed.

## Java completeness and exact comparison

The existing read-only [XML adapter](../../tools/qa/reviewed/java_report.py)
returned ready/healthy with zero issues. The native report contains:

- SpotBugs core version 4.10.5, 25 findings, zero analysis errors and zero
  missing classes; six priority-2 and 19 priority-3 findings. Native priorities
  are not asserted to be exploit severity ratings.
- All 38 independently enumerated compiled application classes, with no
  missing, extra or duplicate reported class identity.
- All 25 accepted file/start-line/member/field rows match exactly, with zero
  unmatched or ambiguous row. All 22 documented class/member/pattern/signature/
  field scopes also match their exact expected multiplicities. The draft XML
  was read as comparison metadata, not installed or executed as a filter.

| Pattern | Count | Classification / preserved boundary |
| --- | ---: | --- |
| EI_EXPOSE_REP2 | 4 | FALSE POSITIVE: intentional shared Spring collaborators, not exposed DTO/entity collections |
| SPRING_ENDPOINT | 11 | DESIGN CHOICE: endpoint hotspots; authorization/default-deny, validation and CSRF remain separate requirements |
| COOKIE_USAGE | 4 | DESIGN CHOICE: intentional JWT/CSRF cookies; existing flags, expiry and validation contracts remain required |
| PREDICTABLE_RANDOM | 2 | DESIGN CHOICE: deterministic dev-only fixture generation, never authentication material |
| SERVLET_PARAMETER | 1 | DESIGN CHOICE: untrusted inputs remain typed, bounded and allowlisted |
| SERVLET_HEADER | 1 | DESIGN CHOICE: CSRF header is read for validation, not trusted as identity |
| THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | 2 | DESIGN CHOICE: checked exceptions in Spring security-chain construction |

## Frontend completeness and exact comparison

The fresh JSON contains 52 files, compared with the prior 49. All 89 previous
diagnostics retain their exact file, rule, message and start/end coordinates;
zero diagnostics were added or removed. All prior warning-bearing source texts
still match the saved report exactly.

| Pattern | Count | Classification / preserved boundary |
| --- | ---: | --- |
| security/detect-unsafe-regex | 32 | FALSE POSITIVE within the reviewed bounded/controlled-input contexts; no arbitrary-input safety claim |
| security/detect-object-injection | 34 | DESIGN CHOICE: reviewed bounded arrays, allowlists, own-key schemas and fixed test counters |
| security/detect-non-literal-fs-filename | 22 | DESIGN CHOICE: fixed/checked QA paths or generated temporary test roots; resource/symlink limits still required |
| security/detect-non-literal-regexp | 1 | DESIGN CHOICE: escaped literal label input with existing regression evidence |

The three newly included files have zero warnings/errors:

- [Development header helper](../../frontend/security-headers.ts).
- [Header unit regressions](../../frontend/security-headers.test.ts).
- [Header/HMR browser regressions](../../frontend/e2e/security-headers.e2e.ts).

The pre-existing non-security react-refresh/only-export-components suppression
in AuthContext.tsx remains reported separately. No security diagnostic is
suppressed. Neither that directive nor its automated-gate blocker was altered.

All 27 source hashes in the original disposition proposal still match. A separate
92-file source/control before/after snapshot had zero changes during this phase.
This comparison is not a complete transitive toolchain/provenance or reproducible
bytecode attestation, and does not activate the unfinished reviewed gate.

## Report provenance

The previous native Java report matched its accepted SHA-256 before the scan;
the canonical generated path was subsequently regenerated by Maven. Its old
hash remains historical evidence in the accepted record, not the hash of the
new report now at that path. The prior frontend JSON was preserved unchanged.

| Report | SHA-256 |
| --- | --- |
| Previous native Java, verified before rerun | d42c74577dc41631e15155aa12d6346d12f1c6811365af86009f00cabaa494b4 |
| [Fresh native Java XML](../../backend/springreactdemo/target/spotbugsXml.xml) | 66f93de46967a902c4fd37426c1c62a46d273551f0ce06afefa5fdaf94c880d5 |
| [Previous frontend JSON](h1-collector-hardening-security-20261107.json) | 4e03e75489089dc6142fbd6ad2bcd3d83d6094b21f3985b035cfed36d927062d |
| [Fresh frontend JSON](h1-phase1-frontend-20261108.json) | c62d07c31d62682970d3ca114728c06e36e1fbc60ed313f6e76b59edecbfb030 |

Hashes here describe observed report artifacts, not new approved fingerprints.
Fresh invocation timing changes the native report hash without demonstrating a
changed finding inventory. No stored acceptance pin was refreshed.

## Side effects, limitations and next decision

Only generated Maven analysis/build output, the fresh ignored frontend JSON,
this QA comparison and the pre-approved QA summary were written. Existing source,
configuration, tests, README/SECURITY/AGENTS edits and review tooling were
preserved. No real .env file, credential environment value or runtime log was
inspected. No network/download/install, app traffic, product/user mutation,
service start/stop/restart or Git mutation occurred. No restart is required.

This was compile plus static analysis, not clean verify: no full backend build,
tests, coverage, browser checks, H2 passive rerun or database count was verified.
Existing compiled-class coverage is not proof of reproducible source-to-bytecode
provenance. The current full backend verification remains separately pending.
H1 and H2 raw failures/manual dispositions and the 42/2/0/0 checklist scoreboard
remain unchanged.

No new confirmed REAL finding justifies a Phase 2 code fix from this rescan.
Do not refactor legitimate operations solely to silence heuristics or build more
acceptance machinery solely to change a label. Recommended next approval is
Phase 3's bounded read-only CSP feasibility review: map current style injection,
Emotion/MUI/chart compatibility and hosting-dependent nonce/hash requirements;
produce an implementation plan and browser-test matrix before any changes.
No CSP/header edit, dependency, serving layer, deployment, restart or acceptance
change is approved by completion of Phase 1. Production hosting choices will
need user input later; no manual intervention is needed for this completed phase.
