# Isolated Java analyzer controls

**Intentionally unsafe source. Compile/analyze only. Never run these classes,
register the controller, or copy bytecode into application/test outputs.**

This opt-in harness is independent of Maven lifecycle/profile configuration.
It uses Python's standard library, JDK 25, and exact existing cached JARs only.
It has no download/resolution fallback. The application's raw `static-analysis`
profile, application sources, dependencies, and test-analysis settings are
unchanged. No exclusion, suppression, or reviewed acceptance data is installed.

From the repository root, after the diff has been shown and verification has
been authorized:

```sh
# Parser tests only; no compiler/analyzer/fixture execution.
python3 -B -m unittest discover -s backend/springreactdemo/qa/analysis-fixtures -p test_report.py

# Optional preparation: compile the four sources, but do not run SpotBugs.
python3 -B backend/springreactdemo/qa/analysis-fixtures/run.py prepare

# Fresh compilation followed by fixture-only positive analysis.
python3 -B backend/springreactdemo/qa/analysis-fixtures/run.py analyze
```

The `analyze` phase also compiles; running `prepare` first is optional. Both
require a readable local cache and matched Java/javac 25. If needed, pass an
explicit `--jdk /absolute/path/to/jdk-25` or `--repository /absolute/cache/path`.
The repository argument is a filesystem cache root, never a URL. A sandbox that
hides the cache requires narrowly approved local read access; no dependency
installation, Maven wiring change, or network access is a substitute.

Every invocation creates a unique directory beneath the module's
`target/analysis-fixtures/`, prints its location, and preserves older evidence.
Outputs include exact compiler/analyzer logs and exit codes, an input SHA-256
inventory and explicit analyzer command, raw XML, and (on healthy analysis)
`summary.json`. Nothing is written into `target/classes` or
`target/test-classes`. The CLI's only analyzed input is that invocation's
isolated `classes` directory. Spring 7.0.10 and Tomcat 11.0.27 cached JARs are
compile/auxiliary inputs, never analyzed targets. Fixture classes are absent
from the analyzer's JVM runtime classpath. Annotation processing and implicit
source compilation are disabled. There is no fixture `main`, class loading,
reflection, Spring context, service start, or fixture execution step.

The runner drops inherited credential variables, JVM options/agents, and
`CLASSPATH` from child processes, and gives the analyzer a fresh `user.home`.
It uses explicit cached SpotBugs 4.10.5 runtime and FindSecBugs 1.14.0 plugin
paths. Runtime coordinates come from the cached SpotBugs POM/manifest, with
logging providers matching the cached Maven plugin 4.10.5.0 descriptor:
Log4j API 2.26.1 -> `log4j-to-slf4j` 2.26.1 -> `slf4j-simple` 2.0.20. These
cached providers replace the unavailable Log4j Core/binding from the standalone
manifest and keep logging enabled. Missing JARs block execution without
searching alternate versions or downloading. Health checks are unchanged.

The cached Maven plugin 4.10.5.0 descriptor was inspected read-only:
`classFilesDirectory` is editable with default `${project.build.outputDirectory}`
but has no command-line property expression; `onlyAnalyze` binds to
`${spotbugs.onlyAnalyze}` but does not select an external class directory.
The CLI avoids relying on an invented `-DclassFilesDirectory` override or
changing the application's POM/output directory/profile.

Candidate identities are outside all proposed accepted application members:

| Fixture/member | Candidate pattern |
| --- | --- |
| `MutableAlias.<init>` / `permissions` | `EI_EXPOSE_REP2` / `EI_EXPOSE_REP` |
| `PredictableSecurityToken.passwordResetToken` | `PREDICTABLE_RANDOM` |
| `RequestHotspots.endpoint` | `SPRING_ENDPOINT` |
| `RequestHotspots.cookieValue` | `COOKIE_USAGE` |
| `RequestHotspots.header` | `SERVLET_HEADER` |
| `RequestHotspots.parameter` | `SERVLET_PARAMETER` |
| `ThrowingConstructor.<init>` | `CT_CONSTRUCTOR_THROW` |

These candidate definitions are not an approved findings baseline. Counts are
measured from installed outputs. A candidate is `UNSUPPORTED` if its pattern is absent
from installed detector declarations, `UNDETECTED` if declared but not reported
for the exact fixture member, or `OBSERVED` with its measured count. Undetected
does not prove that code is safe. Endpoint/request reports are hotspots, not
proof of exploitability. Constructor detection may depend on JDK/detector
behavior; do not claim coverage without a matching actual diagnostic.

The harness rejects malformed/wrong-version XML, absent/nonzero error or
missing-class counters, error/missing-class elements, disabled FindSecBugs,
unexpected analyzed paths/class totals, incomplete or non-fixture diagnostic
identities, and inconsistent bug totals/exit codes. Unknown stdout/stderr is
also treated as unhealthy rather than silently ignoring possible errors.
Review local synthetic-only tool logs if a harmless tool warning blocks a run;
do not weaken health checks to obtain a passing result.

Harness exit codes:

- `0`: preparation succeeded, or healthy analysis observed every candidate.
- `1`: healthy analysis has unsupported/undetected candidate controls; review
  the summary and report the limitation.
- `2`: prerequisite, compilation, analyzer, or report-health block; no detector
  coverage claim is valid.

SpotBugs's original `-exitcode` is retained separately: `1` means findings,
`4` analysis errors, `2` missing classes (flags may combine). Finding-only `1`
is expected for positive controls. This harness does not run or reclassify any
raw application gate. It does not validate a future review guard or active
filter; those require separate evidence and activation approval.

Verified on 2026-11-07 after diff approval: all five parser/exit-code tests
passed. The final `analyze` command compiled exactly four fixture classes with
Java 25.0.1 and analyzed only their isolated output directory with SpotBugs
4.10.5 and FindSecBugs 1.14.0. All eight candidate identities were observed
once each; none was unsupported or undetected. The raw report contained nine
findings, including an additional `DMI_RANDOM_USED_ONLY_ONCE` diagnostic in
`passwordResetToken`, which is retained in the summary rather than discarded.
Analysis errors and missing classes were both zero, and analyzer stdout/stderr
were empty. The raw finding-only exit was `1`; the harness exited `0` with
`CONTROLS_OBSERVED`. No fixture code was executed and no application scan ran.

Initial attempts exposed an unavailable logging implementation, a deprecated
CLI output option, and an incorrect harness exit-code assumption. The final
run uses the cached logging providers documented above, the reporter-local
`-xml:withMessages=<path>` option, and exit flags confirmed from the installed
analyzer's `ExitCodes` bytecode constants. Errors/missing classes still block;
no diagnostics or logging were suppressed to obtain the result.
