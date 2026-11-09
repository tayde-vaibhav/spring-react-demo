# H1 — Review of 24 new tooling warnings

Date: 2026-11-07. Approved: source review and proposed fixes/dispositions, plus
README reporting correction. **No implementation fixes or exclusions applied.**

Subsequent approved G01/G02 implementation is complete and regression-tested:
[collector hardening handoff](h1-collector-hardening.md). The proposal and source
coordinates below are historical review evidence. Current raw frontend total is
89, not 85; no exception candidates were automatically expanded or activated.

## Outcome

Review/documentation task: PASSED. H1 remains FAILED on the last raw scans:
25 Java findings and 85 frontend warnings. No scanner, test or build ran here.

| Scope | REAL | FALSE POSITIVE | DESIGN CHOICE |
| --- | ---: | ---: | ---: |
| 24 new native diagnostics | 0 | 1 | 23 |
| Additional manual tooling observation G01 | 1 | 0 | 0 |

Classifications are source-review conclusions under current local-only contracts,
not accepted exceptions or a green gate. No manifest, rule disable, suppression,
fingerprint refresh or expansion of the existing 61 frontend candidates occurred.
The four current source files exactly match their source text in the saved
[raw JSON](h1-frontend-xmlonly-rescan-20261107.json); hashes were checked without
printing contents. Existing [raw audit IDs](h1-xmlonly-rescan-20261107.md) are kept.

## Findings by severity — proposed, not applied

### G01 — MEDIUM: directory traversal lacks independent resource budgets (REAL tooling robustness gap)

Location: [review-inputs.mjs:97](../../frontend/e2e/support/review-inputs.mjs#L97),
especially full readdirSync allocation at line 100 and recursion at line 106.
Related dynamic-path diagnostic T07 remains DESIGN CHOICE; it does not itself
prove path injection. The independent issue is missing traversal bounds.

Evidence: maxFiles increments only inside read, after extension selection.
Directory visits and nonmatching entries consume no entry budget; walk has no
depth limit. readdirSync allocates an entire directory listing before checking
matching files. A sufficiently deep/large local checkout can therefore exhaust
stack/time/memory despite per-file/total-byte limits. This is source-derived;
no actual hang/stress reproducer or application exploit was executed here.
The helper is opt-in local tooling, not a running application endpoint.

Proposed targeted fix, requiring approval:

- Add fixed independent depth/visited-entry budgets (proposed 64 and 10,000).
- Enumerate directories incrementally, close their handles, bound collected
  entries before deterministic sorting, and count directories/nonmatching entries
  too. Do not open hidden/local file content or broaden the current roots.
- Exhaustion throws the existing sanitized blocked error, never a partial result.
  Preserve symlink/O_NOFOLLOW, byte/hash and all current fixture assertions.
- Add synthetic temporary-tree tests for exact bound/bound+1, deep/empty trees,
  many nonmatching entries and deterministic normal behavior. No real checkout
  stress test, actual local-config read or new dependency is needed.

### G02 — LOW: explicit package-version length bound (defense in depth)

Location: [review-inputs.mjs:120](../../frontend/e2e/support/review-inputs.mjs#L120),
T08 at line 122. The reported regex is a FALSE POSITIVE for catastrophic
backtracking: three digit runs separated by literal dots, followed by an optional
suffix evaluated at most once; there is no nested unbounded repeated group.
No timing test ran here and this is not a general SemVer-validator claim.

The current manifest-file cap is 2 MiB. Proposed hardening, requiring approval:
limit the version field to 1–128 characters before the existing grammar check.
Preserve the accepted grammar rather than silently introducing stricter SemVer
semantics. Add ordinary/prerelease/empty/malformed/wrong-type/128/129/very-long
fixtures; retain exact package-name validation and every existing test.
This is not a newly proven ReDoS vulnerability, and bounding it may leave the
heuristic warning present. No regex rule disable or dependency is proposed.

## Every new diagnostic and exact rationale

FS operations use fixed-scope checked paths or synthetic temporary roots.
Object accesses use constant key lists or installed parser visitor metadata.
Native JSON is cloned only after rejecting proxies/accessors/custom inherited
prototypes/sparse arrays/cycles; own-key schema checks precede optional reads.
ASTs come from parsing source text, never evaluating source or accepting a
report-supplied AST. Changed trust boundaries invalidate these dispositions.

| Audit ID | Exact file/line and exclusive columns | Classification | Specific trust boundary / preservation condition |
| --- | --- | --- | --- |
| T01 | [review-inputs.mjs:44](../../frontend/e2e/support/review-inputs.mjs#L44) :7–25 | DESIGN CHOICE | Canonical absolute root comes from a trusted local caller; realpath equality rejects aliased/symlink roots. |
| T02 | [review-inputs.mjs:44](../../frontend/e2e/support/review-inputs.mjs#L44) :39–54 | DESIGN CHOICE | Checks that the same canonical local root is a directory; not a request-selected filename. |
| T03 | [review-inputs.mjs:61](../../frontend/e2e/support/review-inputs.mjs#L61) :11–29 | DESIGN CHOICE | Each validated relative path component is checked for symlinks before opening a file. |
| T04 | [review-inputs.mjs:63](../../frontend/e2e/support/review-inputs.mjs#L63) :9–29 | DESIGN CHOICE | Resolved target must equal the constructed in-root path; hostile concurrent parent mutation is outside this guarantee. |
| T05 | [review-inputs.mjs:70](../../frontend/e2e/support/review-inputs.mjs#L70) :24–83 | DESIGN CHOICE | Read-only open on the checked target with O_NOFOLLOW; type/size and bounded descriptor reads follow. |
| T06 | [review-inputs.mjs:99](../../frontend/e2e/support/review-inputs.mjs#L99) :10–30 | DESIGN CHOICE | Directory comes from checkedPath and fixed source roots; separate traversal-budget gap G01 still applies. |
| T07 | [review-inputs.mjs:100](../../frontend/e2e/support/review-inputs.mjs#L100) :25–72 | DESIGN CHOICE | Enumerates a checked local directory; dynamic path is legitimate, but G01 requires depth/entry/allocation bounds. |
| T08 | [review-inputs.mjs:122](../../frontend/e2e/support/review-inputs.mjs#L122) :11–49 | FALSE POSITIVE | Digit runs separated by dots and a single optional suffix do not create nested unbounded repeated groups; see G02. |
| T09 | [review-inputs.test.mjs:12](../../frontend/e2e/support/review-inputs.test.mjs#L12) :3–60 | DESIGN CHOICE | Creates fixture parents under a fresh mkdtemp root, using internal test-only paths. |
| T10 | [review-inputs.test.mjs:13](../../frontend/e2e/support/review-inputs.test.mjs#L13) :3–40 | DESIGN CHOICE | Writes synthetic fixture content under that same generated temporary root. |
| T11 | [review-inputs.test.mjs:42](../../frontend/e2e/support/review-inputs.test.mjs#L42) :78–108 | DESIGN CHOICE | Reads a returned fixture source path to verify its exact hash, never real local configuration. |
| T12 | [review-inputs.test.mjs:43](../../frontend/e2e/support/review-inputs.test.mjs#L43) :41–71 | DESIGN CHOICE | Second byte-equality assertion reads the same fixture path; preserve both assertions. |
| T13 | [review-inputs.test.mjs:67](../../frontend/e2e/support/review-inputs.test.mjs#L67) :7–64 | DESIGN CHOICE | Creates parents for fixed broken-link fixtures under the temporary root; does not open the named hidden files. |
| T14 | [review-inputs.test.mjs:68](../../frontend/e2e/support/review-inputs.test.mjs#L68) :7–75 | DESIGN CHOICE | Creates a broken test symlink targeting a synthetic nonexistent path; verifies forbidden-input exclusion. |
| T15 | [review-inputs.test.mjs:78](../../frontend/e2e/support/review-inputs.test.mjs#L78) :5–113 | DESIGN CHOICE | Creates an in-fixture link to exercise source/control/package/directory symlink rejection. |
| T16 | [review-inputs.test.mjs:104](../../frontend/e2e/support/review-inputs.test.mjs#L104) :5–46 | DESIGN CHOICE | Creates a linked temporary repository root to prove canonical-root rejection; cleanup tracks generated parents. |
| T17 | [review-native-frontend.mjs:122](../../frontend/e2e/support/review-native-frontend.mjs#L122) :49–59 | DESIGN CHOICE | Optional-field read from a constant two-key list after plain-data cloning and own-key schema checks. |
| T18 | [review-native-frontend.mjs:122](../../frontend/e2e/support/review-native-frontend.mjs#L122) :77–87 | DESIGN CHOICE | Second read of the same constant-key optional field for value validation; no arbitrary key selection. |
| T19 | [review-native-frontend.mjs:127](../../frontend/e2e/support/review-native-frontend.mjs#L127) :49–59 | DESIGN CHOICE | Coordinate read from the fixed line/column/endLine/endColumn list after schema checks. |
| T20 | [review-native-frontend.mjs:127](../../frontend/e2e/support/review-native-frontend.mjs#L127) :80–90 | DESIGN CHOICE | Second coordinate read validates null or integer; missing/zero/out-of-range positions explicitly block. |
| T21 | [review-native-frontend.mjs:159](../../frontend/e2e/support/review-native-frontend.mjs#L159) :26–36 | DESIGN CHOICE | Reads one of five constant native count keys; values must be non-negative safe integers. |
| T22 | [review-native-frontend.mjs:164](../../frontend/e2e/support/review-native-frontend.mjs#L164) :56–66 | DESIGN CHOICE | Reads source or output from a constant two-key list; source mismatch and any autofixed output block. |
| T23 | [review-native-frontend.mjs:235](../../frontend/e2e/support/review-native-frontend.mjs#L235) :21–30 | DESIGN CHOICE | AST children selected using installed parser visitor keys; arbitrary report JSON is not accepted as an AST. |
| T24 | [review-native-frontend.test.mjs:266](../../frontend/e2e/support/review-native-frontend.test.mjs#L266) :5–28 | DESIGN CHOICE | Mutates one of five literal counter-name fields in a synthetic test to prove tampering is rejected. |

Do not replace indexing with reflection merely to evade detection, remove
assertions, widen trusted keys/paths, or turn rules off for files. No demonstrated
security need requires rewriting all 23 legitimate operations. Future exact
acceptance requires separate approval, unchanged identity/hash/count checks and
preserved raw diagnostics. No new gate infrastructure is proposed in this review.

## Existing evidence and current limits

Previously recorded preparation: 15 collector cases, 23 frontend-native cases,
94 existing guard cases, 211 full frontend cases and 41 Python parser cases.
These are historical results, not tests run for this source review. Existing
fixtures do not establish G01 traversal budgets or G02's proposed version bounds.
Java's XML-only correction already verified 38/38 classes with unchanged findings.
No new full backend build/coverage result is claimed.

The existing non-security react-refresh directive remains a disclosed strict
adapter blocker; neither this review nor README correction accepts/removes it.
Execution provenance, future complete control/runtime inventories and Java
member/evidence validation remain separate activation prerequisites.

## Approved documentation change and safety

Corrected only README's static-analysis reporting paragraph: native
target/spotbugsXml.xml is the findings/class-statistics artifact; XML-only output
avoids the pinned simultaneous-reporter defect; older HTML can be stale.
Existing commands, strict failure behavior and scanner settings are unchanged.
Reviewed the paragraph diff and Git whitespace; no tests/scans for this doc edit.

This note and the pre-approved QA summary document the review. Preserved the
existing POM fix and untracked tools. No implementation/test/production edits,
.env/credential/token/cookie access, runtime-log read, dependency/network/download,
service/database request, restart, Git mutation or H2/H3 run occurred.

## Next approval requested

Only G01/G02 collector hardening and regression tests, associated QA documentation,
and offline focused/unit/lint/typecheck/build/security verification. Show the diff
before verification; leave exclusions disabled and raw gates strict. No new gate
machinery, accepted policy expansion, production API or unrelated frontend work.
A lower warning count is not guaranteed or required to demonstrate these fixes.
