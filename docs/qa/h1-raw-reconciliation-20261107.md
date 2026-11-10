# H1 — Fresh raw inventory reconciliation

Date: 2026-11-07. Approved scope: fresh unfiltered Java/frontend scans and
comparison with the existing proposal. **NO EXCLUSIONS OR REVIEWED GATES ACTIVE.**

## Outcome

Both raw gates remain **FAILED**, exit 1, because their strict configurations
reject every finding/warning. Reconciliation explains the inventories but does
not convert either raw failure into a pass or approve any finding for exclusion.

| Scan | Findings | Errors / missing classes | Candidate reconciliation |
| --- | ---: | --- | --- |
| Java | 25 | 0 analysis errors; 0 missing classes | 22 exact proposed identities cover all 25; expected multiplicities agree; no unmatched or ambiguous identity |
| Frontend | 61 warnings | 0 errors; 0 fatal errors | 57 exact existing spans; four explained relocations, no unexplained additions |

No new REAL defect is established by this inventory comparison. The previous
source-review classifications remain candidates: Java FALSE POSITIVE=4,
DESIGN CHOICE=21; frontend FALSE POSITIVE=31, DESIGN CHOICE=30. These are not
blanket security guarantees. No active manifest or source fingerprints changed.

## Commands and raw evidence

Backend (existing cache, offline, no tests):

```bash
cd backend/springreactdemo
timeout 240s ./mvnw -o -B -Pstatic-analysis -DskipTests compile spotbugs:check
```

Exit 1; 14.676 seconds; completed 2026-11-07 19:50:40 +05:30. Compiler reported
application classes up to date. Max effort/Low threshold/production-only settings,
FindSecBugs and strict failure behavior remain unchanged. Maven's offline mode
permits no resolution downloads. No Spring application or test was launched.

Native application report: [spotbugsXml.xml](../../backend/springreactdemo/target/spotbugsXml.xml).
SpotBugs version 4.10.5; report SHA-256:
`89d4d48363cd450c3f83a71eb96dc18dfc94b731a0a0c99a2bad69946853d916`.
The report's Errors counters are both zero and its 25 direct BugInstance elements
agree with the check log and total_bugs. However, the plugin-produced summary
reports total_classes=0; it is not usable as proof of full analyzed-class coverage.
The generated spotbugs/spotbugs.xml is a separate presentation report and lacks
these native BugInstance elements. Future native gate integration must explicitly
verify report provenance/completeness rather than infer coverage from these totals.
No native filter-engine test or complete acceptance adapter is claimed here.

Frontend (installed dependencies only):

```bash
cd frontend
timeout 180s npm run lint:security -- --format json --output-file ../docs/qa/h1-frontend-raw-20261107.json
```

Initial sandbox invocation produced stream-descriptor permission warnings; reran
the identical command with approval outside the sandbox. Final exit 1 for the
61 warnings; no final permission/tool error. ESLint 10.14.0 and
eslint-plugin-security 4.2.1; 45 files in the final JSON.
Raw report: [frontend JSON](h1-frontend-raw-20261107.json).
SHA-256: `36323e93391b2f5d581c0aa97d1a3d9949a7b70a2e760e2d24e6367f771baac0`.

The JSON also retains one pre-existing suppressed **non-security** diagnostic:
react-refresh/only-export-components in frontend/src/auth/AuthContext.tsx, line 74,
from the existing line-1 directive. No security diagnostic is suppressed. No new
suppression was introduced or removed. The review-guard and security-analyzer
supporting modules/tests appear in the scan with zero diagnostics; the new
canonical helper carries the relocated F54 warning, not a new accepted exception.

## Pattern classifications

| Tool / pattern | Count | Classification | Reason / condition |
| --- | ---: | --- | --- |
| Java EI_EXPOSE_REP2 | 4 | FALSE POSITIVE | Exact intentional Spring collaborator fields, not mutable API DTO exposure |
| Java SPRING_ENDPOINT | 11 | DESIGN CHOICE | Expected endpoints; authorization remains a separately tested responsibility |
| Java COOKIE_USAGE | 4 | DESIGN CHOICE | Intentional cookie JWT/CSRF strategy; preserve flags, expiry, duplicate and blank-pair checks |
| Java PREDICTABLE_RANDOM | 2 | DESIGN CHOICE | Deterministic dev-only product data, not authentication material; 16 new isolated seeder cases supply supporting evidence |
| Java SERVLET_PARAMETER | 1 | DESIGN CHOICE | Typed/allowlisted/bounded product search handling |
| Java SERVLET_HEADER | 1 | DESIGN CHOICE | Read and validate CSRF header as untrusted input |
| Java THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION | 2 | DESIGN CHOICE | Supported checked security-builder contract; fail-fast configuration preserved |
| Frontend security/detect-unsafe-regex | 31 | FALSE POSITIVE | Existing controlled-label/bounded reporter/price rationale and tests; not arbitrary-input regex safety |
| Frontend security/detect-object-injection | 26 | DESIGN CHOICE | Existing bounded arrays/allowlists/own-key handling; canonicalizer prototype-key regressions now exist |
| Frontend security/detect-non-literal-fs-filename | 3 | DESIGN CHOICE | Fixed module-relative QA paths, not arbitrary client-selected files |
| Frontend security/detect-non-literal-regexp | 1 | DESIGN CHOICE | Escaped literal label helper with regression coverage |

## Java exact identity membership

Compared pattern, class, method/constructor, decoded erased parameters, return
type and field identity against the 22 documentation-only XML matches. Reported
locations are retained below, including each paired warning. This is independent
metadata reconciliation, not application of the XML or native-engine filtering.
All four injected-field candidates match their exact field. Each native finding
matches exactly one proposed scope; no candidate has zero or excess membership.

| Original IDs | Pattern | Class/member/field | Expected | Actual | Source lines |
| --- | --- | --- | ---: | ---: | --- |
| J08 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.product.ProductController.<init>`; field `productService` | 1 | 1 | 42 |
| J16 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.product.ProductSeeder.<init>`; field `mongoTemplate` | 1 | 1 | 56 |
| J19 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.product.ProductService.<init>`; field `mongoTemplate` | 1 | 1 | 41 |
| J39 | `EI_EXPOSE_REP2` | `com.vaibhav.springreactdemo.security.AuthService.<init>`; field `rateLimiter` | 1 | 1 | 36 |
| J01 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.AppTestController.appTest` | 1 | 1 | 17–18 |
| J10 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.create` | 1 | 1 | 47–52 |
| J11 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.delete` | 1 | 1 | 67–68 |
| J12 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.getById` | 1 | 1 | 57 |
| J13 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.getStats` | 1 | 1 | 85 |
| J14 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.search` | 1 | 1 | 79–80 |
| J15 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.product.ProductController.update` | 1 | 1 | 62 |
| J34 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.csrf` | 1 | 1 | 39 |
| J35 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.login` | 1 | 1 | 45–53 |
| J36 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.logout` | 1 | 1 | 60–67 |
| J37 | `SPRING_ENDPOINT` | `com.vaibhav.springreactdemo.security.AuthController.me` | 1 | 1 | 72–73 |
| J42/J43 | `COOKIE_USAGE` | `com.vaibhav.springreactdemo.security.CookieBearerTokenResolver.resolve` | 2 | 2 | 24, 28 |
| J44/J45 | `COOKIE_USAGE` | `com.vaibhav.springreactdemo.security.CookieCsrfHeaderFilter.csrfCookieValue` | 2 | 2 | 60, 64 |
| J17/J18 | `PREDICTABLE_RANDOM` | `com.vaibhav.springreactdemo.product.ProductSeeder.run` | 2 | 2 | 71, 72 |
| J09 | `SERVLET_PARAMETER` | `com.vaibhav.springreactdemo.product.ProductController.search` | 1 | 1 | 79 |
| J46 | `SERVLET_HEADER` | `com.vaibhav.springreactdemo.security.CookieCsrfHeaderFilter.doFilterInternal` | 1 | 1 | 39 |
| J49 | `THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION` | `com.vaibhav.springreactdemo.security.SecurityConfiguration.devApiDocumentationSecurityFilterChain` | 1 | 1 | 60–64 |
| J50 | `THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION` | `com.vaibhav.springreactdemo.security.SecurityConfiguration.securityFilterChain` | 1 | 1 | 136–164 |

## Frontend exact span reconciliation and explicit drift

The old proposal contains 61 entries. 57 still match file, rule, start/end lines
and start/end columns exactly. Four no longer match the old coordinates:

| ID | Prior coordinate | Observed coordinate | Existing rationale |
| --- | --- | --- | --- |
| F54 | `frontend/e2e/restart-idempotence.mjs:26:84–94` | `frontend/e2e/support/canonical.mjs:5:84–94` | D4 |
| F55 | `frontend/e2e/restart-idempotence.mjs:75:31–68` | `frontend/e2e/restart-idempotence.mjs:68:31–68` | D7 |
| F56 | `frontend/e2e/restart-idempotence.mjs:85:21–45` | `frontend/e2e/restart-idempotence.mjs:78:21–45` | D7 |
| F57 | `frontend/e2e/restart-idempotence.mjs:86:19–39` | `frontend/e2e/restart-idempotence.mjs:79:19–39` | D7 |

F54 is the unchanged canonical implementation moved to a pure tested helper.
F55–F57 shifted by seven lines following that extraction. Columns/rules remain
unchanged. After explicitly accounting for these four relocations there are no
unexplained diagnostic locations. F13/F14/F38/F39 remain absent; no counter finding
was recreated. Relocations are **observations for review**, not newly approved
manifest entries or permission to bypass drift checks.

Of 26 source fingerprints captured in the proposal, 25 match and one differs:

- frontend/e2e/restart-idempotence.mjs prior:
  `f8c9ad343e588e7f3689671bb9e9696cb43e2b8fa359c9f4a760e3c1bd24b282`.
- Current observed hash:
  `adba372f6dd5080dce14e1bc2bbd9c6bbf4f17e728871d25e8dd58f9b0ffb163`.
- Newly extracted frontend/e2e/support/canonical.mjs observed hash:
  `9201f005122fc6bdd7e8decaaf02ce8ad1d9ffb96a1e83d4076fa7f7ab505015`.

The previous proposal remains unchanged/stale for these coordinates and the
changed source hash. No automated baseline refresh, active review manifest,
statement/AST anchor reconstruction or trusted native report adapter was added.
The pure guard cannot itself prove provenance, inventory completeness or test
validity. Those remain prerequisites for any future acceptance-gate proposal.

## Observed control-input fingerprints (evidence only)

These hashes record this run's local control inputs, not approval data and not a
complete future adapter inventory. No environment/configuration secret files were
read. Exact cached analyzer versions are recorded above/in the unchanged POM.

| Input | SHA-256 |
| --- | --- |
| `backend/springreactdemo/pom.xml` | `3575b7c2ca52b1ad377f4adb8173ea8dd57f55c874afaf1b2963656bf37fb359` |
| `frontend/eslint.config.js` | `49a399e466edbb391d0abfcd6d5b47e5678f35b7b2cb9e08ae3979dcaed49fc3` |
| `frontend/eslint.security.config.js` | `257509a2327b2a9fa38cd52983b885c80a741ddb7d8a049c4eb226bf4c12abfc` |
| `frontend/package.json` | `04504a63241242286539ce6eccfb34b2f3c73201e051d1d41150c0ea322377b5` |
| `frontend/package-lock.json` | `84e3fc08ebe31180896120a2f74327152eb8b308501381b4dcac9005b3304675` |
| `frontend/node_modules/eslint/package.json` | `a78ce8b6e726e4b1a9b6d776d77a28abee85e9fb3f40be9984e1b62f14c001db` |
| `frontend/node_modules/eslint-plugin-security/package.json` | `2e04d8a6cbc0a94c0161e188d9133bb4497eadde47668bb3aee070eb8cde6a5b` |
| `frontend/node_modules/typescript-eslint/package.json` | `f99f98b1b71a1dbaf1ba235efa336e4c5649e58e4514134829babe8c4bbe6be3` |

## Safety, documentation and next decision

Only ignored QA evidence/report documents and generated scanner/build reports
were written. No tracked source/config/test, dependency, active filter, manifest,
Git setting or service changed. No .env, credential value, runtime request/log body,
database record, live runner or remote endpoint was accessed. No network, install,
service restart, database traffic or Git mutation occurred. Initial and final
tracked working trees are clean on showcase-app; QA documents are ignored.

Supporting verification remains the recorded 217 focused backend tests and 173
frontend cases, not rerun by this scan. A new full clean verify/coverage report
remains user-owned/pending; no new functional/runtime pass is claimed.

H1 remains FAILED on raw gates, with explained but unapplied review candidates.
Proposed next step requiring approval: update the documentation-only proposal for
the four relocated frontend entries and source provenance, then design/implement
trusted exact-match reviewed-gate adapters with a shown diff and separate
activation approval. Preserve raw commands and all raw failures; no blanket
exclusions, security rule disables or automatic candidate expansion. Do not start
H2/H3 or apply fixes without their appropriate approval.
