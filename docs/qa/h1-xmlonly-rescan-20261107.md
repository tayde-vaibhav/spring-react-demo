# H1 — XML-only reporting correction and raw rescans

Date: 2026-11-07. Approved: one-line reporting correction and fresh offline raw
scans. **No exclusions, accepted-finding manifest or reviewed-gate activation.**

## Outcome

Reporting correction: **PASSED**. H1 raw gates: **FAILED** (both exit 1).

| Check | Result |
| --- | --- |
| Java XML class coverage | 38 reported classes, exactly the 38 compiled identities; zero missing/unexpected |
| Java adapter | ready/healthy, no issues; retains 25 findings and raw exit 1 |
| Java analysis health | zero analysis errors, zero missing classes |
| Java finding reconciliation | same 25 findings across 22 exact proposed identities; zero unmatched/ambiguous/count mismatches |
| Frontend | 49 files, 85 warnings, zero errors/fatal errors; strict exit 1 |
| Frontend comparison | all 61 previous diagnostic coordinates retained; 24 additions in new preparation tooling/tests; zero removals |

## Exact change and commands

Only tracked change: [pom.xml](../../backend/springreactdemo/pom.xml) in the
static-analysis profile changes htmlOutput from true to false. The one-line diff
was shown before running scanners. XML output, plugin versions, Max effort,
Low threshold, includeTests=false, failOnError=true and existing raw commands
remain unchanged. No suppression or filter was introduced. Runtime behavior is
unaffected; **no backend restart is required**.

```bash
# backend/springreactdemo/ (cached/offline, tests skipped)
timeout 240s ./mvnw -o -B -Pstatic-analysis -DskipTests compile spotbugs:check

# frontend/ (installed tools only)
timeout 180s npm run lint:security -- --format json --output-file ../docs/qa/h1-frontend-xmlonly-rescan-20261107.json
```

Java finished 2026-11-07 20:16:53 +05:30, 16.876 seconds. Exit 1 is the strict
25-finding check failure, not an analyzer startup or coverage failure. No test
profile, MONGODB_TEST_URI, application startup or database is involved in this
command. It must not be confused with full verify attempts recorded elsewhere.
No new full Maven/test/coverage result is claimed.

## Root cause confirmed and coverage verified

Previous simultaneous HTML/XML output populated statistics only in the first
reporter's object: the Maven plugin adds HTML first, while core
BugReportDispatcher.getProjectStats returns that reporter's statistics object.
Findings still reach XML. Disabling HTML makes XML the statistics-bearing reporter.
The fresh XML now has total_classes=38 and a complete 38-entry ClassStats inventory.

The previously tested native adapter normalized the fresh report against the
independently listed 38 compiled application class identities. It returned ready,
healthy=true, zero issues and all 25 findings retained. All 22 existing proposed
Java scopes still have their exact expected membership. This validates report
consistency/class coverage, not activation, absence of vulnerabilities, arbitrary
report provenance, Java source/bytecode freshness or native filter-engine behavior.

Native XML: [spotbugsXml.xml](../../backend/springreactdemo/target/spotbugsXml.xml).
SHA-256: `d42c74577dc41631e15155aa12d6346d12f1c6811365af86009f00cabaa494b4`.
Current POM SHA-256: `60569a5baddb523d14f4bc1d672b3ee772c14d8860f46f5c4e34d8c063493584` (observed evidence, not active approval data).

An old generated HTML file may still exist from earlier runs; it is not refreshed
or evidence for this run. No old artifact was deleted. README still describes
simultaneous rendered XML/HTML output; its reporting paragraph needs a separately
approved wording update. No README/SECURITY edit was made in this correction.

## Pattern totals and candidate classification

| Tool / pattern | Previous | Current | Added |
| --- | ---: | ---: | ---: |
| Java EI_EXPOSE_REP2 | 4 | 4 | 0 |
| Java SPRING_ENDPOINT | 11 | 11 | 0 |
| Java COOKIE_USAGE | 4 | 4 | 0 |
| Java PREDICTABLE_RANDOM | 2 | 2 | 0 |
| Java SERVLET_PARAMETER | 1 | 1 | 0 |
| Java SERVLET_HEADER | 1 | 1 | 0 |
| Java THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | 2 | 2 | 0 |
| Frontend security/detect-unsafe-regex | 31 | 32 | 1 |
| Frontend security/detect-object-injection | 26 | 34 | 8 |
| Frontend security/detect-non-literal-fs-filename | 3 | 18 | 15 |
| Frontend security/detect-non-literal-regexp | 1 | 1 | 0 |

Existing source-reviewed candidates remain Java four FALSE POSITIVE/21 DESIGN
CHOICE and frontend 31 FALSE POSITIVE/30 DESIGN CHOICE; no accepted exceptions.
The additional 24 findings are **unapproved** and must not inherit prior scopes.
Initial source triage, not acceptance:

- One unsafe-regex warning on the installed-package version grammar: candidate
  FALSE POSITIVE for catastrophic backtracking (separated digit groups and one
  optional suffix, no repeated ambiguous group). Explicit version-length limits
  and malformed/long-value fixtures are a reasonable small hardening proposal,
  not applied here and not proof supplied by this scan.
- Eight object-index warnings: candidate DESIGN CHOICE for fixed schema key lists,
  installed parser visitor keys, and fixed-counter-name test mutations. Exact
  own-key/plain-data/AST assumptions need per-entry review, not blanket rule off.
- Fifteen filesystem-path warnings: candidate DESIGN CHOICE for fixed-scope input
  discovery and synthetic temporary test repositories. Existing source checks
  constrain roots/components, symlinks, byte limits and hidden paths; tests use
  generated temporary roots. No arbitrary HTTP path input or live service is
  involved. Collector's documented concurrent-filesystem/provenance limitations
  remain; these are not general filesystem-security guarantees.

No newly proven production vulnerability is claimed from these heuristic
warnings. No entry was automatically added to the 61-row proposal or any policy.
A focused review/fix-or-disposition plan needs approval before any implementation.

## Every new frontend warning (metadata only)

T IDs below are audit identifiers, **not acceptance-manifest entries**. Prior
F01–F65 IDs remain unchanged. Each row is one native diagnostic and count one.

| Audit ID | File and exclusive span | Rule |
| --- | --- | --- |
| T01 | `frontend/e2e/support/review-inputs.mjs:44:7–25` | `security/detect-non-literal-fs-filename` |
| T02 | `frontend/e2e/support/review-inputs.mjs:44:39–54` | `security/detect-non-literal-fs-filename` |
| T03 | `frontend/e2e/support/review-inputs.mjs:61:11–29` | `security/detect-non-literal-fs-filename` |
| T04 | `frontend/e2e/support/review-inputs.mjs:63:9–29` | `security/detect-non-literal-fs-filename` |
| T05 | `frontend/e2e/support/review-inputs.mjs:70:24–83` | `security/detect-non-literal-fs-filename` |
| T06 | `frontend/e2e/support/review-inputs.mjs:99:10–30` | `security/detect-non-literal-fs-filename` |
| T07 | `frontend/e2e/support/review-inputs.mjs:100:25–72` | `security/detect-non-literal-fs-filename` |
| T08 | `frontend/e2e/support/review-inputs.mjs:122:11–49` | `security/detect-unsafe-regex` |
| T09 | `frontend/e2e/support/review-inputs.test.mjs:12:3–60` | `security/detect-non-literal-fs-filename` |
| T10 | `frontend/e2e/support/review-inputs.test.mjs:13:3–40` | `security/detect-non-literal-fs-filename` |
| T11 | `frontend/e2e/support/review-inputs.test.mjs:42:78–108` | `security/detect-non-literal-fs-filename` |
| T12 | `frontend/e2e/support/review-inputs.test.mjs:43:41–71` | `security/detect-non-literal-fs-filename` |
| T13 | `frontend/e2e/support/review-inputs.test.mjs:67:7–64` | `security/detect-non-literal-fs-filename` |
| T14 | `frontend/e2e/support/review-inputs.test.mjs:68:7–75` | `security/detect-non-literal-fs-filename` |
| T15 | `frontend/e2e/support/review-inputs.test.mjs:78:5–113` | `security/detect-non-literal-fs-filename` |
| T16 | `frontend/e2e/support/review-inputs.test.mjs:104:5–46` | `security/detect-non-literal-fs-filename` |
| T17 | `frontend/e2e/support/review-native-frontend.mjs:122:49–59` | `security/detect-object-injection` |
| T18 | `frontend/e2e/support/review-native-frontend.mjs:122:77–87` | `security/detect-object-injection` |
| T19 | `frontend/e2e/support/review-native-frontend.mjs:127:49–59` | `security/detect-object-injection` |
| T20 | `frontend/e2e/support/review-native-frontend.mjs:127:80–90` | `security/detect-object-injection` |
| T21 | `frontend/e2e/support/review-native-frontend.mjs:159:26–36` | `security/detect-object-injection` |
| T22 | `frontend/e2e/support/review-native-frontend.mjs:164:56–66` | `security/detect-object-injection` |
| T23 | `frontend/e2e/support/review-native-frontend.mjs:235:21–30` | `security/detect-object-injection` |
| T24 | `frontend/e2e/support/review-native-frontend.test.mjs:266:5–28` | `security/detect-object-injection` |

Fresh frontend JSON: [raw report](h1-frontend-xmlonly-rescan-20261107.json).
SHA-256: `2065c1020f6de919dbcfe009f3a380a7d463607e4f13813d27ddab60092bc88c`.
It retains the existing one non-security react-refresh suppressed diagnostic in
AuthContext.tsx:74; zero security suppressions and no new directives. The strict
prepared adapter still blocks that suppression; no allowance was silently added.

## Documentation, safety and next approval

Created this QA note and appended the pre-approved QA report; updated the old
proposal's status note to point to current raw totals without expanding any
exception candidate or regenerating hashes. All existing untracked preparation
files are preserved. No application source, DTO/API behavior, security matcher,
validation, existing assertion, coverage threshold, database record, Git setting
or service changed. No .env/real credential/cookie/token or runtime log body was
read or printed. No network/install/download, application/database request,
service restart, staging, commit or push occurred. Reports/build outputs and QA
notes remain ignored; the POM change remains unstaged on showcase-app.

Proposed next approval: focused review of the 24 new tooling warnings, propose
small fixes versus exact documented dispositions without applying exclusions,
and correct README's report-output wording. Do not activate reviewed gates,
expand manifests or proceed to H2/H3 without the appropriate separate decision.
