"""Offline native SpotBugs XML adapter; preparation only, with no gate wiring.

The caller supplies bytes, the *complete* independently obtained application
class inventory, the pinned core version, exact Project/Jar path and actual raw
exit code. This module performs no filesystem, environment or process I/O.
``healthy`` describes report consistency, never absence/acceptance of findings.
No pattern allowlist, suppression, fingerprint update or coverage inference is
performed. XML cannot prove its own provenance: callers must also establish the
unfiltered invocation and input integrity. A coherently rewritten report cannot
be distinguished from an authentic report using these bytes alone.

``report`` follows review-guard.mjs's report shape when identity is representable.
Class-only/field-only or malformed identities remain in nativeFindings, occupy
their original findings slot with null unavailable values, and BLOCK the result;
never invent a method/signature/location to make the guard accept them. Every
BugInstance is retained in order, including duplicate and unknown patterns.
Only a ready result may be handed to a downstream reconciler. This adapter does
not activate or implement acceptance; the raw gate and exit code stay unchanged.
"""

import re
from collections import Counter
from xml.etree.ElementTree import Element, SubElement
from xml.parsers import expat


MAX_REPORT_BYTES = 8 * 1024 * 1024
MAX_ELEMENTS = 100_000
MAX_DEPTH = 64
MAX_DESCRIPTOR_LENGTH = 4096
_MAX_NUMBER = (1 << 31) - 1
_IDENTIFIER = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*\Z")
_PATTERN = re.compile(r"[A-Za-z0-9_/-]{1,200}\Z")
_NUMBER = re.compile(r"(?:0|[1-9][0-9]{0,9})\Z")
_PRIMITIVES = dict(B="byte", C="char", D="double", F="float", I="int",
                   J="long", S="short", Z="boolean")


class _Rejected(ValueError):
    """Only fixed reason codes, never parser messages or report contents."""


def _require(condition, code):
    if not condition:
        raise _Rejected(code)


def _class_name(value):
    return (isinstance(value, str) and len(value) <= 1024
            and all(_IDENTIFIER.fullmatch(part) for part in value.split(".")))


def _path(value, absolute=False):
    if not isinstance(value, str) or not value or len(value) > 4096:
        return False
    if absolute:
        if not value.startswith("/"):
            return False
        value = value[1:]
    elif value.startswith("/"):
        return False
    return (not any(ord(char) < 32 or char in "\\:" for char in value)
            and all(part not in ("", ".", "..") for part in value.split("/")))


def _number(element, name, default=None):
    value = element.get(name)
    if value is None and default is not None:
        return default
    _require(isinstance(value, str) and _NUMBER.fullmatch(value), "INVALID_NUMBER")
    number = int(value)
    _require(number <= _MAX_NUMBER, "INVALID_NUMBER")
    return number


def _descriptor_type(descriptor, offset, allow_void=False):
    start = offset
    while offset < len(descriptor) and descriptor[offset] == "[":
        offset += 1
    dimensions = offset - start
    _require(dimensions <= 255 and offset < len(descriptor), "INVALID_DESCRIPTOR")
    token = descriptor[offset]
    offset += 1
    if token == "V":
        _require(allow_void and dimensions == 0, "INVALID_DESCRIPTOR")
        return "void", offset, 0
    if token in _PRIMITIVES:
        base = _PRIMITIVES[token]
    elif token == "L":
        end = descriptor.find(";", offset)
        _require(end > offset, "INVALID_DESCRIPTOR")
        internal = descriptor[offset:end]
        _require("." not in internal and _class_name(internal.replace("/", ".")),
                 "INVALID_DESCRIPTOR")
        base = internal.replace("/", ".")
        offset = end + 1
    else:
        raise _Rejected("INVALID_DESCRIPTOR")
    slots = 2 if dimensions == 0 and token in "JD" else 1
    return base + "[]" * dimensions, offset, slots


def parse_method_descriptor(descriptor):
    """Parse one complete JVM method descriptor; do not erase overload identity."""
    _require(isinstance(descriptor, str) and 0 < len(descriptor) <= MAX_DESCRIPTOR_LENGTH
             and descriptor.startswith("("), "INVALID_DESCRIPTOR")
    parameters = []
    offset, slots = 1, 0
    while offset < len(descriptor) and descriptor[offset] != ")":
        parameter, offset, width = _descriptor_type(descriptor, offset)
        parameters.append(parameter)
        slots += width
        _require(slots <= 255, "INVALID_DESCRIPTOR")
    _require(offset < len(descriptor) and descriptor[offset] == ")", "INVALID_DESCRIPTOR")
    returns, end, _ = _descriptor_type(descriptor, offset + 1, allow_void=True)
    _require(end == len(descriptor), "INVALID_DESCRIPTOR")
    return {"parameters": parameters, "returns": returns}


def parse_field_descriptor(descriptor):
    """Parse one complete non-void JVM field descriptor."""
    _require(isinstance(descriptor, str) and 0 < len(descriptor) <= MAX_DESCRIPTOR_LENGTH,
             "INVALID_DESCRIPTOR")
    result, end, _ = _descriptor_type(descriptor, 0)
    _require(end == len(descriptor), "INVALID_DESCRIPTOR")
    return result


def _parse(xml):
    # Expat callbacks reject DTD/entity syntax regardless of input encoding;
    # external references are never resolved. Built-in XML escapes remain legal.
    parser = expat.ParserCreate()
    stack, roots = [], []
    count = 0

    def forbidden(*_args):
        raise _Rejected("FORBIDDEN_XML_DECLARATION")

    def start(name, attributes):
        nonlocal count
        count += 1
        _require(count <= MAX_ELEMENTS and len(stack) < MAX_DEPTH, "XML_RESOURCE_LIMIT")
        _require(":" not in name and not any(
            key == "xmlns" or ":" in key for key in attributes), "XML_NAMESPACE")
        element = SubElement(stack[-1], name, attributes) if stack else Element(name, attributes)
        if not stack:
            roots.append(element)
        stack.append(element)

    def end(_name):
        stack.pop()

    def data(value):
        if stack:
            # Preserve native annotation text without quadratic string concatenation.
            texts.setdefault(stack[-1], []).append(value)

    texts = {}
    parser.StartElementHandler = start
    parser.EndElementHandler = end
    parser.CharacterDataHandler = data
    parser.StartDoctypeDeclHandler = forbidden
    parser.EntityDeclHandler = forbidden
    parser.ExternalEntityRefHandler = forbidden
    parser.SkippedEntityHandler = forbidden
    parser.ProcessingInstructionHandler = forbidden
    try:
        parser.Parse(xml, True)
    except expat.ExpatError:
        raise _Rejected("MALFORMED_XML") from None
    _require(len(roots) == 1, "MALFORMED_XML")
    for element, chunks in texts.items():
        element.text = "".join(chunks)
    return roots[0]


def _native(element):
    return {"tag": element.tag, "attributes": dict(element.attrib),
            "text": element.text, "children": [_native(child) for child in element]}


def _only(root, tag):
    elements = list(root.iter(tag))
    _require(len(elements) == 1 and elements[0] in list(root), "INVALID_" + tag.upper())
    return elements[0]


def _primary(bug, tag, required=True):
    elements = bug.findall(tag)
    for element in elements:
        _require(element.get("primary", "false") in ("true", "false"), "INVALID_PRIMARY")
    marked = [element for element in elements if element.get("primary") == "true"]
    _require(len(marked) <= 1, "AMBIGUOUS_PRIMARY_" + tag.upper())
    if marked:
        return marked[0]
    # Native SpotBugs often emits a single SourceLine without primary=true.
    if len(elements) == 1 and "primary" not in elements[0].attrib:
        return elements[0]
    _require(not required and not elements, "MISSING_PRIMARY_" + tag.upper())
    return None


def _finding(bug):
    pattern = bug.get("type")
    _require(isinstance(pattern, str) and _PATTERN.fullmatch(pattern), "INVALID_PATTERN")
    priority = _number(bug, "priority")
    _require(1 <= priority <= 5, "INVALID_PRIORITY")
    owner = _primary(bug, "Class")
    class_name = owner.get("classname")
    _require(_class_name(class_name), "INVALID_CLASS_NAME")
    method = _primary(bug, "Method")
    member = method.get("name")
    _require(method.get("classname") == class_name, "PRIMARY_OWNER_MISMATCH")
    _require(isinstance(member, str) and (
        _IDENTIFIER.fullmatch(member) or member in ("<init>", "<clinit>")), "INVALID_MEMBER")
    signature = parse_method_descriptor(method.get("signature"))
    _require(method.get("isStatic") in ("true", "false"), "MISSING_STATIC_METADATA")
    # The JVM's 255 parameter-slot limit includes the receiver for instance methods.
    slots = sum(2 if item in ("long", "double") else 1 for item in signature["parameters"])
    _require(slots + (method.get("isStatic") == "false") <= 255, "INVALID_DESCRIPTOR")
    if member in ("<init>", "<clinit>"):
        _require(signature["returns"] == "void", "INVALID_SPECIAL_METHOD")
        _require(method.get("isStatic") == ("true" if member == "<clinit>" else "false"),
                 "INVALID_SPECIAL_METHOD")
    if member == "<clinit>":
        _require(not signature["parameters"], "INVALID_SPECIAL_METHOD")
    field = _primary(bug, "Field", required=False)
    if field is not None:
        _require(_class_name(field.get("classname")) and isinstance(field.get("name"), str)
                 and _IDENTIFIER.fullmatch(field.get("name")), "INVALID_FIELD")
        parse_field_descriptor(field.get("signature"))
        # review-guard's scope has no field-owner/signature slots. Do not project
        # a foreign primary field onto the primary class and accidentally match it.
        _require(field.get("classname") == class_name, "PRIMARY_OWNER_MISMATCH")
    source = _primary(bug, "SourceLine")
    file = source.get("sourcepath")
    _require(source.get("classname") == class_name, "PRIMARY_OWNER_MISMATCH")
    _require(_path(file) and file.endswith(".java"), "INVALID_SOURCE_PATH")
    start, end = _number(source, "start"), _number(source, "end")
    _require(0 < start <= end, "INVALID_LOCATION")
    return {"kind": "java", "file": file, "severity": "warning", "pattern": pattern,
            "className": class_name, "member": member, "signature": signature,
            "field": None if field is None else field.get("name"),
            "startLine": start, "endLine": end}


def _totals(element, total_key, bugs):
    _require(_number(element, total_key) == len(bugs), "INCONSISTENT_BUG_TOTAL")
    priorities = Counter(bug.get("priority") for bug in bugs)
    for priority in range(1, 6):
        _require(_number(element, "priority_" + str(priority), default=0)
                 == priorities[str(priority)], "INCONSISTENT_PRIORITY_TOTAL")
    _require(all(not key.startswith("priority_") or key in {
        "priority_1", "priority_2", "priority_3", "priority_4", "priority_5"}
                 for key in element.attrib), "INVALID_PRIORITY")


def _coverage(summary, bugs, expected_classes):
    total = _number(summary, "total_classes")
    _require(total > 0, "EMPTY_COVERAGE")
    packages = summary.findall("PackageStats")
    classes = summary.findall("./PackageStats/ClassStats")
    _require(bool(classes), "MISSING_CLASS_INVENTORY")
    _require(len(list(summary.iter("ClassStats"))) == len(classes)
             and len(list(summary.iter("PackageStats"))) == len(packages), "INVALID_COVERAGE_STRUCTURE")
    inventory = [element.get("class") for element in classes]
    _require(all(_class_name(name) for name in inventory), "INVALID_CLASS_NAME")
    _require(len(set(inventory)) == len(inventory), "DUPLICATE_COVERAGE_CLASS")
    _require(set(inventory) == set(expected_classes) and len(inventory) == total,
             "COVERAGE_MISMATCH")
    _require(_number(summary, "num_packages") == len(packages), "INCONSISTENT_PACKAGE_TOTAL")
    names = [package.get("package") for package in packages]
    _require(all(name == "" or _class_name(name) for name in names)
             and len(set(names)) == len(names), "INVALID_PACKAGE_INVENTORY")
    _totals(summary, "total_bugs", bugs)
    inventory_set = set(inventory)
    by_class = {}
    by_file = Counter()
    for bug in bugs:
        owner = _primary(bug, "Class").get("classname")
        _require(owner in inventory_set, "FINDING_OUTSIDE_COVERAGE")
        by_class.setdefault(owner, []).append(bug)
        by_file[_primary(bug, "SourceLine").get("sourcepath")] += 1
    for package in packages:
        contained = package.findall("ClassStats")
        prefix = package.get("package")
        _require(len(contained) == _number(package, "total_types"), "INCONSISTENT_CLASS_TOTAL")
        package_bugs = []
        for element in contained:
            name = element.get("class")
            _require(name.rpartition(".")[0] == prefix, "CLASS_PACKAGE_MISMATCH")
            _require(element.get("interface") in ("true", "false"), "MISSING_CLASS_METADATA")
            _require(_path(element.get("sourceFile")), "MISSING_CLASS_METADATA")
            class_bugs = by_class.get(name, [])
            _totals(element, "bugs", class_bugs)
            package_bugs.extend(class_bugs)
        _totals(package, "total_bugs", package_bugs)
        _require(_number(package, "total_size") == sum(_number(c, "size") for c in contained),
                 "INCONSISTENT_SIZE_TOTAL")
    _require(_number(summary, "total_size") == sum(_number(c, "size") for c in classes),
             "INCONSISTENT_SIZE_TOTAL")
    # FileStats is optional native metadata, never a replacement class inventory.
    files = summary.findall("FileStats")
    file_names = [element.get("path") for element in files]
    _require(len(set(file_names)) == len(file_names), "DUPLICATE_FILE_STATS")
    for element in files:
        path = element.get("path")
        _require(_path(path), "INVALID_SOURCE_PATH")
        _require(_number(element, "bugCount") == by_file[path], "INCONSISTENT_FILE_TOTAL")
    return sorted(inventory), total


def normalize_spotbugs(xml, *, expected_classes, expected_version, class_output_path,
                       exit_code=None, tool_id="spotbugs"):
    """Return a ready or blocked data record; invalid caller expectations raise.

    None means unavailable, never a fabricated empty clean report. Missing exit
    status blocks even a coherent XML document. Rejected XML/data returns fixed
    issue codes with healthy/complete/unfiltered false. On parseable but invalid
    metadata, every BugInstance's native tree is still available for inspection.
    """
    _require(type(expected_classes) in (list, tuple, set, frozenset)
             and len(expected_classes) > 0 and len(expected_classes) <= MAX_ELEMENTS
             and all(_class_name(name) for name in expected_classes)
             and len(set(expected_classes)) == len(expected_classes), "INVALID_EXPECTATIONS")
    _require(isinstance(expected_version, str)
             and re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}(?:[-.][A-Za-z0-9]+)*", expected_version)
             and _path(class_output_path, absolute=True)
             and isinstance(tool_id, str) and _PATTERN.fullmatch(tool_id), "INVALID_EXPECTATIONS")
    _require(exit_code is None or type(exit_code) is int and -_MAX_NUMBER <= exit_code <= _MAX_NUMBER,
             "INVALID_EXPECTATIONS")
    report = {"toolId": tool_id, "version": expected_version, "reportPresent": xml is not None,
              "complete": False, "unfiltered": False, "healthy": False, "exitCode": exit_code,
              "analysisErrors": [], "missingClasses": [], "findings": []}
    result = {"status": "blocked", "issues": [], "report": report, "nativeFindings": [],
              "coverage": {"expectedClasses": sorted(expected_classes), "analyzedClasses": [],
                           "totalClasses": None, "classOutputPath": class_output_path}}
    issues = result["issues"]

    def check(operation):
        try:
            return operation()
        except _Rejected as error:
            code = str(error)
            if code not in issues:
                issues.append(code)
            return None

    if xml is None:
        issues.append("REPORT_UNAVAILABLE")
        return result
    if type(xml) is not bytes or not xml or len(xml) > MAX_REPORT_BYTES:
        issues.append("INVALID_REPORT_BYTES")
        return result
    root = check(lambda: _parse(xml))
    if root is None:
        return result
    # Preserve every parsed diagnostic before checking metadata or identities.
    bugs = list(root.iter("BugInstance"))
    result["nativeFindings"] = [_native(bug) for bug in bugs]
    for bug in bugs:
        finding = check(lambda bug=bug: _finding(bug))
        if finding is None:
            finding = {"kind": "java", "file": None, "severity": "error", "pattern": bug.get("type"),
                       "className": None, "member": None, "signature": None, "field": None,
                       "startLine": None, "endLine": None}
        report["findings"].append(finding)

    def structure():
        _require(root.tag == "BugCollection", "WRONG_ROOT")
        _require(root.get("version") == expected_version, "VERSION_MISMATCH")
        direct = set(root)
        _require(all(bug in direct for bug in bugs), "NESTED_FINDING")
        allowed = {"Project", "BugInstance", "Errors", "FindBugsSummary", "BugCategory",
                   "BugPattern", "BugCode", "ClassFeatures", "History"}
        _require(all(child.tag in allowed for child in root), "UNEXPECTED_ROOT_ELEMENT")
        # Native saved-filter, suppression and differential/history state cannot
        # establish a fresh unfiltered current report, even with coherent totals.
        for element in root.iter():
            _require(not any(term in element.tag.lower() for term in
                             ("filter", "suppression", "missingclass", "error"))
                     or element.tag in ("Errors", "Error", "ErrorMessage", "MissingClass"),
                     "FILTERED_REPORT")
            for attribute in element.attrib:
                _require(not any(term in attribute.lower() for term in
                                 ("filter", "suppress", "truncat", "crop", "abridg")), "FILTERED_REPORT")
        _require(root.get("sequence", "0") == "0", "HISTORICAL_REPORT")
        for bug in bugs:
            _require(not any(key in bug.attrib for key in
                             ("first", "last", "removed", "introducedByChange", "removedByChange")),
                     "HISTORICAL_REPORT")
        for history in root.findall("History"):
            _require(len(history) == 0, "HISTORICAL_REPORT")

    check(structure)
    if root.get("version") is not None:
        report["version"] = root.get("version")
    project = check(lambda: _only(root, "Project"))
    if project is not None:
        def project_check():
            jars = project.findall("Jar")
            _require(len(jars) == 1 and jars[0].text == class_output_path and len(jars[0]) == 0,
                     "PROJECT_OUTPUT_MISMATCH")
            _require(len(list(root.iter("Jar"))) == 1, "PROJECT_OUTPUT_MISMATCH")
        check(project_check)
    errors = check(lambda: _only(root, "Errors"))
    if errors is not None:
        def error_check():
            _require(_number(errors, "errors") == 0 and _number(errors, "missingClasses") == 0,
                     "ANALYSIS_INCOMPLETE")
            _require(not list(root.iter("Error")) and not list(root.iter("MissingClass"))
                     and len(errors) == 0, "ANALYSIS_INCOMPLETE")
        check(error_check)
        report["missingClasses"] = ["MISSING_CLASS" for _ in root.iter("MissingClass")]
    summary = check(lambda: _only(root, "FindBugsSummary"))
    if summary is not None:
        coverage = check(lambda: _coverage(summary, bugs, expected_classes))
        if coverage is not None:
            result["coverage"]["analyzedClasses"], result["coverage"]["totalClasses"] = coverage
    if exit_code not in (0, 1):
        issues.append("RAW_EXIT_UNAVAILABLE" if exit_code is None else "RAW_EXIT_ERROR")
    elif (exit_code == 0) != (len(bugs) == 0):
        issues.append("RAW_EXIT_MISMATCH")
    report["analysisErrors"] = list(issues)
    if not issues:
        result["status"] = "ready"
        report.update(complete=True, unfiltered=True, healthy=True)
    return result
