# Quality Assurance Evidence Index

This directory contains historical QA reports, verification evidence, security assessments, and supporting test tooling for `spring-react-demo`.

The reports document work performed at different stages of development. A completed plan, reviewed finding, or accepted disposition does **not** necessarily mean that its associated scanner gate passed.

For the current project setup, test commands, and coverage requirements, consult the [root README](../../README.md), [security guidance](../../SECURITY.md), and [test codification plan](../../TEST-CODIFICATION-PLAN.md).

## Start here

| Document                                                 | Purpose                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [QA test report](test-report.md)                         | Chronological verification record, implementation history, and outstanding work           |
| [H1 final dispositions](h1-final-dispositions.md)        | Proposed static-analysis finding dispositions and verification approach                   |
| [H1 manual dispositions](h1-final-manual-disposition.md) | Manual review and disposition evidence                                                    |
| [H2 passive assessment](h2-passive-results.md)           | Limited passive security assessment, findings, and limitations                            |
| [Phase 4A results](phase4a-results-20261108.md)          | Standalone nonce HTML server and security verification                                    |
| [Phase 4B results](phase4b-results-20261108.md)          | Localhost serving and mocked Chromium verification                                        |
| [Phase 4C4 results](phase4c4-results-20261108.md)        | CSRF and tampered-cookie recovery, including failed diagnostics and subsequent correction |

## H1 — Static analysis and remediation

### Planning and findings

- [Remediation plan](h1-remediation-plan.md)
- [Batch 2 findings](h1-batch2-findings.md)
- [Batch 3 findings](h1-batch3-findings.md)
- [Batch 4 implementation](h1-batch4-implementation.md)
- [Batch 4 review](h1-batch4-review.md)

### Evidence reconciliation and disposition

- [Collector hardening](h1-collector-hardening.md)
- [Raw evidence reconciliation](h1-raw-reconciliation-20261107.md)
- [XML-only rescan](h1-xmlonly-rescan-20261107.md)
- [Phase 1 reconciliation](h1-phase1-reconciliation-20261108.md)
- [Tooling warning review](h1-tooling-warning-review.md)
- [Supporting verification](h1-supporting-verification.md)
- [Reviewed gate preparation](h1-reviewed-gate-preparation.md)
- [Final disposition proposal](h1-final-dispositions.md)
- [Final manual disposition](h1-final-manual-disposition.md)

These records include intermediate findings, proposed dispositions, and scoped verification. They must not be interpreted collectively as proof of a final passing H1 scanner gate.

## H2 — Passive security assessment

- [Passive assessment plan](h2-passive-plan.md)
- [Passive assessment results](h2-passive-results.md)
- [Header remediation plan](h2-header-remediation-plan.md)
- [Header remediation results](h2-header-remediation-results.md)
- [Phase 3 CSP feasibility](h2-phase3-csp-feasibility-20261108.md)

The passive assessment has defined scope and coverage limitations. Refer to the individual reports before drawing conclusions about application-wide security.

## Phase 4 — Frontend and security verification

- [Phase 4A: Standalone nonce server](phase4a-results-20261108.md)
- [Phase 4B: Localhost and mocked Chromium](phase4b-results-20261108.md)
- [Phase 4C1](phase4c1-results-20261108.md)
- [Phase 4C2](phase4c2-results-20261108.md)
- [Phase 4C3](phase4c3-results-20261108.md)
- [Phase 4C4: CSRF and tampered-cookie recovery](phase4c4-results-20261108.md)

Read each report's final status and limitations, not only its initial execution result.

## Other QA planning

- [Playwright verification plan](playwright-plan.md)
- [Chronological QA test report](test-report.md)

## Machine-readable evidence

The directory also contains JSON evidence associated with baseline checks, H1 scans, H2 passive assessments, and Phase 4A security verification.

These files are retained for auditability. They may contain historical scanner findings or test fixtures and should not be treated as current production telemetry.

## Supporting tools

The directory includes JavaScript and Python QA utilities for accessibility, responsiveness, performance, API contract verification, passive security checks, and offline test verification.

**Execution safeguards:**

- Inspect a tool's prerequisites and side effects before running it.
- Do not start, stop, restart, or modify user-managed services without approval.
- Do not substitute a development MongoDB connection for a test database.
- The historical `run-maven.mjs` entry point is intentionally disabled.
- The I3 verification harness requires Java 25, reviewed Docker prerequisites, and an isolated verification environment.

## Verification status and interpretation

The repository documents a completed I2 fresh-clone verification and I3 coverage-gate verification. Refer to the root README and test codification plan for their verified scope and evidence.

Other findings, proposed remediations, scanner gates, and test-codification items may remain pending. Historical reports should be interpreted according to their recorded execution dates, approvals, and limitations.

This index is a navigation aid, not a replacement for the underlying verification evidence.
