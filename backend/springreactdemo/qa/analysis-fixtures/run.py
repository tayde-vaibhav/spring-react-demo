#!/usr/bin/env python3
"""Opt-in, cached-only compiler/analyzer. Never loads or executes fixture classes."""

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from zipfile import ZipFile


HERE = Path(__file__).resolve().parent
MODULE = HERE.parents[1]
PACKAGE = "com.vaibhav.springreactdemo.analysis.fixtures."
CLASSES = ("MutableAlias", "PredictableSecurityToken", "RequestHotspots", "ThrowingConstructor")
# Candidates, not an approved findings baseline. Counts are measured, never assumed.
CANDIDATES = (
    ("EI_EXPOSE_REP2", "MutableAlias", "<init>"),
    ("EI_EXPOSE_REP", "MutableAlias", "permissions"),
    ("PREDICTABLE_RANDOM", "PredictableSecurityToken", "passwordResetToken"),
    ("SPRING_ENDPOINT", "RequestHotspots", "endpoint"),
    ("COOKIE_USAGE", "RequestHotspots", "cookieValue"),
    ("SERVLET_HEADER", "RequestHotspots", "header"),
    ("SERVLET_PARAMETER", "RequestHotspots", "parameter"),
    ("CT_CONSTRUCTOR_THROW", "ThrowingConstructor", "<init>"),
)
SPOTBUGS = "com.github.spotbugs:spotbugs:4.10.5"
FINDSECBUGS = "com.h3xstream.findsecbugs:findsecbugs-plugin:1.14.0"
# Exact cached runtime coordinates from SpotBugs 4.10.5's POM/manifest.
# Logging uses the installed Maven plugin 4.10.5.0's declared providers:
# Log4j API -> SLF4J bridge -> Simple (logging remains enabled).
# No repository traversal, version selection, Maven invocation, or resolution.
RUNTIME = (
    SPOTBUGS,
    *(f"org.ow2.asm:{name}:9.11" for name in
      ("asm", "asm-analysis", "asm-commons", "asm-tree", "asm-util")),
    "org.apache.bcel:bcel:6.13.0",
    "com.github.stephenc.jcip:jcip-annotations:1.0-1",
    "org.dom4j:dom4j:2.2.0",
    "com.google.code.gson:gson:2.14.0",
    "org.apache.commons:commons-lang3:3.21.0",
    "org.apache.commons:commons-text:1.15.0",
    "org.jspecify:jspecify:1.0.1",
    "org.slf4j:slf4j-api:2.0.20",
    "com.github.spotbugs:spotbugs-annotations:4.10.5",
    "jaxen:jaxen:2.0.6",
    "net.sf.saxon:Saxon-HE:12.10",
    "org.apache.logging.log4j:log4j-api:2.26.1",
    "org.apache.logging.log4j:log4j-to-slf4j:2.26.1",
    "org.slf4j:slf4j-simple:2.0.20",
    "commons-io:commons-io:2.22.0",
    "com.google.errorprone:error_prone_annotations:2.48.0",
    "com.google.code.findbugs:jsr305:3.0.2",
    "org.xmlresolver:xmlresolver:5.3.3",
    "org.xmlresolver:xmlresolver:5.3.3:data",
)
AUXILIARY = (
    *(f"org.springframework:{name}:7.0.10" for name in
      ("spring-web", "spring-context", "spring-core", "spring-beans", "spring-expression")),
    "org.apache.tomcat.embed:tomcat-embed-core:11.0.27",
    "org.jspecify:jspecify:1.0.1",
)


class Blocked(RuntimeError):
    """Incomplete or unhealthy evidence; cannot claim a control passed."""


def jar_path(repository, coordinate):
    group, artifact, version, *classifier = coordinate.split(":")
    suffix = "-" + classifier[0] if classifier else ""
    path = repository / group.replace(".", "/") / artifact / version / f"{artifact}-{version}{suffix}.jar"
    if not path.is_file():
        raise Blocked(f"Required cached artifact unavailable: {coordinate}; no download attempted")
    return path.resolve()


def plugin_patterns(path, entry):
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read(entry))
    return {item.attrib["type"] for item in root.findall("BugPattern")}


def parse_report(path, classes_dir, declared):
    """Fail closed on health, analysis scope, version, and incomplete XML."""
    data = path.read_bytes()
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise Blocked("Unexpected XML declarations")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as error:
        raise Blocked("Malformed analyzer XML") from error
    if root.tag != "BugCollection" or root.get("version") != "4.10.5":
        raise Blocked("Wrong report root or SpotBugs version")
    errors = root.findall("Errors")
    if len(errors) != 1 or errors[0].get("errors") != "0" or errors[0].get("missingClasses") != "0":
        raise Blocked("Analyzer health counters absent or nonzero")
    if list(errors[0]) or root.findall(".//Error") or root.findall(".//MissingClass"):
        raise Blocked("Analyzer reported errors or missing classes")
    projects = root.findall("Project")
    if len(projects) != 1:
        raise Blocked("Missing or ambiguous analyzed project")
    analyzed = [item.text for item in projects[0].findall("Jar")]
    if analyzed != [str(classes_dir)]:
        raise Blocked("Analyzer inputs differ from isolated fixture directory")
    summaries = root.findall("FindBugsSummary")
    if len(summaries) != 1 or summaries[0].get("total_classes") != str(len(CLASSES)):
        raise Blocked("Missing or unexpected analyzed class count")
    plugins = projects[0].findall("Plugin")
    if not any(p.get("id") == "com.h3xstream.findsecbugs" and p.get("enabled") == "true" for p in plugins):
        raise Blocked("FindSecBugs plugin not enabled in report")
    findings = []
    expected_classes = {PACKAGE + name for name in CLASSES}
    for bug in root.findall("BugInstance"):
        methods = bug.findall("Method")
        primary = [m for m in methods if m.get("primary") == "true"]
        method = primary[0] if len(primary) == 1 else (methods[0] if len(methods) == 1 else None)
        pattern = bug.get("type")
        if pattern not in declared or method is None or method.get("classname") not in expected_classes:
            raise Blocked("Unknown diagnostic identity or non-fixture finding")
        if not method.get("name") or not method.get("signature"):
            raise Blocked("Incomplete diagnostic method identity")
        findings.append({"pattern": pattern, "class": method.get("classname"),
                         "method": method.get("name"), "signature": method.get("signature"),
                         "priority": bug.get("priority")})
    try:
        count = int(summaries[0].attrib["total_bugs"])
    except (KeyError, ValueError) as error:
        raise Blocked("Missing diagnostic total") from error
    if count != len(findings):
        raise Blocked("Diagnostic count disagrees with summary")
    return findings


def controls(findings, declared):
    counts = Counter((f["pattern"], f["class"], f["method"]) for f in findings)
    return [{"pattern": pattern, "class": PACKAGE + name, "method": method,
             "count": counts[(pattern, PACKAGE + name, method)],
             "status": ("UNSUPPORTED" if pattern not in declared else
                        "OBSERVED" if counts[(pattern, PACKAGE + name, method)] else "UNDETECTED")}
            for pattern, name, method in CANDIDATES]


def validate_exit(returncode, findings):
    # Verified against installed SpotBugs 4.10.5 ExitCodes constants:
    # BUGS_FOUND_FLAG=1, MISSING_CLASS_FLAG=2, ERROR_FLAG=4.
    if returncode not in (0, 1):
        raise Blocked(f"Unhealthy analyzer exit: {returncode}")
    if returncode != (1 if findings else 0):
        raise Blocked("Analyzer exit status disagrees with report findings")


def run_tool(command, directory, name, timeout=180):
    # Drop inherited JVM options, agents, CLASSPATH, and credential variables.
    try:
        result = subprocess.run(command, cwd=directory, env={"PATH": os.defpath, "LANG": "C.UTF-8"},
                                capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as error:
        raise Blocked(f"{name} timed out; evidence incomplete") from error
    (directory / f"{name}.stdout").write_bytes(result.stdout)
    (directory / f"{name}.stderr").write_bytes(result.stderr)
    (directory / f"{name}.exit.json").write_text(json.dumps({"exitCode": result.returncode}) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prepare", "analyze"))
    parser.add_argument("--repository", type=Path, default=Path.home() / ".m2/repository")
    parser.add_argument("--jdk", type=Path, help="JDK 25 home; defaults to the resolved javac installation")
    args = parser.parse_args()
    if args.jdk is None:
        javac = shutil.which("javac")
        if javac is None:
            raise Blocked("JDK 25 javac unavailable")
        args.jdk = Path(javac).resolve().parents[1]
    java, javac = (str(args.jdk.resolve() / "bin" / name) for name in ("java", "javac"))
    runtime = [jar_path(args.repository, c) for c in RUNTIME]
    auxiliary = [jar_path(args.repository, c) for c in AUXILIARY]
    plugin = jar_path(args.repository, FINDSECBUGS)
    with ZipFile(runtime[0]) as archive:
        manifest = archive.read("META-INF/MANIFEST.MF").decode()
    if "Bundle-Version: 4.10.5\n" not in manifest.replace("\r\n", "\n"):
        raise Blocked("Unexpected SpotBugs runtime version")
    declared = plugin_patterns(runtime[0], "findbugs.xml") | plugin_patterns(plugin, "findbugs.xml")
    parent = MODULE / "target" / "analysis-fixtures"
    # Refuse symlink redirection outside module target; never clear existing output.
    if (MODULE / "target").is_symlink() or parent.is_symlink():
        raise Blocked("Output directories must not be symlinks")
    parent.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix="run-", dir=parent)).resolve()
    classes = directory / "classes"
    classes.mkdir()
    print(f"Fixture output: {directory}", flush=True)
    for name, executable in (("java-version", java), ("javac-version", javac)):
        result = run_tool([executable, "-version"], directory, name, timeout=10)
        version = (result.stdout + result.stderr).decode(errors="replace")
        if result.returncode or not re.search(r'(?:version \"|javac )25(?:[.\"\s]|$)', version):
            raise Blocked("Both java and javac must be JDK 25")
    source_dir = HERE / "src" / Path(PACKAGE.rstrip(".").replace(".", "/"))
    sources = [source_dir / f"{name}.java" for name in CLASSES]
    command = [javac, "--release", "25", "-proc:none", "-implicit:none", "-g",
               "-classpath", os.pathsep.join(map(str, auxiliary)), "-sourcepath", str(source_dir),
               "-d", str(classes), *map(str, sources)]
    result = run_tool(command, directory, "compile")
    if result.returncode or result.stderr:
        raise Blocked("Fixture-only compilation failed or emitted diagnostics; inspect local compile logs")
    expected = {Path(PACKAGE.replace(".", "/")) / f"{name}.class" for name in CLASSES}
    actual = {p.relative_to(classes) for p in classes.rglob("*.class")}
    if actual != expected:
        raise Blocked("Compiled classes differ from the exact four fixtures")
    report = directory / "spotbugs.xml"
    command = [java, f"-Duser.home={directory}", "-cp", os.pathsep.join(map(str, runtime)),
               "edu.umd.cs.findbugs.LaunchAppropriateUI", "-textui", "-effort:max", "-low",
               "-exitcode", f"-xml:withMessages={report}", "-pluginList", str(plugin),
               "-auxclasspath", os.pathsep.join(map(str, auxiliary)), str(classes)]
    inputs = [Path(__file__), *sources, *runtime, *auxiliary, plugin]
    metadata = {"schemaVersion": 1, "phase": args.phase,
                "analyzers": [SPOTBUGS, FINDSECBUGS], "command": command,
                "sha256": {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}}
    (directory / "inputs.json").write_text(json.dumps(metadata, indent=2) + "\n")
    if args.phase == "prepare":
        print("PREPARED ONLY: fixture bytecode compiled; analyzer and fixture code not executed.")
        return 0
    result = run_tool(command, directory, "analyzer")
    # Finding-only exit 1 is evidence, not a raw application gate pass.
    if result.returncode not in (0, 1) or result.stdout or result.stderr or not report.is_file():
        raise Blocked(f"Unhealthy analyzer result (exit {result.returncode}); inspect local analyzer logs")
    findings = parse_report(report, classes, declared)
    validate_exit(result.returncode, findings)
    summary = {"schemaVersion": 1, "analysisHealth": "HEALTHY", "rawExitCode": result.returncode,
               "controls": controls(findings, declared), "findings": findings}
    complete = all(c["status"] == "OBSERVED" for c in summary["controls"])
    summary["status"] = "CONTROLS_OBSERVED" if complete else "INCOMPLETE_CONTROLS"
    (directory / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    for control in summary["controls"]:
        print(f'{control["status"]}: {control["pattern"]} {control["class"]}.{control["method"]} count={control["count"]}')
    print(f'Raw fixture analyzer exit: {result.returncode}; {summary["status"]}')
    return 0 if complete else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (Blocked, OSError, ET.ParseError, KeyError, ValueError) as error:
        # Do not print arbitrary tool output, environment, or exception details.
        print(str(error) if isinstance(error, Blocked) else "BLOCKED: input/tool/report unavailable or invalid", file=sys.stderr)
        sys.exit(2)
