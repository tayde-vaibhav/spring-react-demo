"""Synthetic offline tests only: no analyzer, application or real manifest.

Run only after the implementation diff has been shown by the main reviewer:
    python3 -B -m unittest discover -s tools/qa/reviewed -p test_java_report.py
"""

import copy
import unittest
from unittest.mock import patch
from xml.etree.ElementTree import Element, SubElement, tostring

from java_report import (
    MAX_DEPTH, MAX_ELEMENTS, MAX_REPORT_BYTES,
    normalize_spotbugs, parse_field_descriptor, parse_method_descriptor,
)


CLASSES = ["example.Owner", "example.Owner$Inner", "example.Unreported"]
OUTPUT = "/synthetic/build/classes"
VERSION = "4.10.5"


def bug(pattern="UNKNOWN_FUTURE_PATTERN", descriptor="(I[[Ljava/lang/String;J)Ljava/lang/Object;",
        member="overloaded", field=True):
    element = Element("BugInstance", type=pattern, priority="2", rank="15")
    owner = SubElement(element, "Class", classname=CLASSES[0], primary="true")
    SubElement(owner, "SourceLine", classname=CLASSES[0], start="1", end="99",
               sourcepath="example/Owner.java")
    method = SubElement(element, "Method", classname=CLASSES[0], name=member,
                        signature=descriptor, isStatic="false", primary="true")
    SubElement(method, "SourceLine", classname=CLASSES[0], start="10", end="60",
               sourcepath="example/Owner.java")
    if field:
        SubElement(element, "Field", classname=CLASSES[0], name="values",
                   signature="[Ljava/lang/String;", primary="true")
    SubElement(element, "SourceLine", classname=CLASSES[0], start="42", end="43",
               sourcepath="example/Owner.java", startBytecode="7", endBytecode="19")
    return element


def report(bugs=None):
    if bugs is None:
        bugs = [bug()]
    root = Element("BugCollection", version=VERSION, sequence="0")
    project = SubElement(root, "Project", projectName="synthetic")
    SubElement(project, "Jar").text = OUTPUT
    SubElement(project, "AuxClasspathEntry").text = "/synthetic/dependency.jar"
    SubElement(project, "SrcDir").text = "/synthetic/src"
    root.extend(bugs)
    SubElement(root, "Errors", errors="0", missingClasses="0")
    summary = SubElement(root, "FindBugsSummary", total_classes="3", num_packages="1",
                         total_size="30", total_bugs=str(len(bugs)))
    package = SubElement(summary, "PackageStats", package="example", total_types="3",
                         total_size="30", total_bugs=str(len(bugs)))
    for owner in CLASSES:
        owned = [b for b in bugs if b.find("Class").get("classname") == owner]
        stats = SubElement(package, "ClassStats", {"class": owner, "bugs": str(len(owned)),
                            "size": "10", "interface": "false", "sourceFile": "Owner.java"})
        for priority in range(1, 6):
            count = sum(b.get("priority") == str(priority) for b in owned)
            if count:
                stats.set("priority_" + str(priority), str(count))
    for priority in range(1, 6):
        count = sum(b.get("priority") == str(priority) for b in bugs)
        if count:
            summary.set("priority_" + str(priority), str(count))
            package.set("priority_" + str(priority), str(count))
    SubElement(root, "History")
    return root


def normalize(value, **kwargs):
    options = dict(expected_classes=CLASSES, expected_version=VERSION,
                   class_output_path=OUTPUT, exit_code=1)
    options.update(kwargs)
    xml = tostring(value) if isinstance(value, Element) else value
    return normalize_spotbugs(xml, **options)


class DescriptorTests(unittest.TestCase):
    def test_method_arrays_primitives_objects_and_inner_classes(self):
        self.assertEqual(parse_method_descriptor("(BCDFIJSZ[[I[Lp/Outer$Inner;)[[Lp/Result;"), {
            "parameters": ["byte", "char", "double", "float", "int", "long", "short",
                           "boolean", "int[][]", "p.Outer$Inner[]"],
            "returns": "p.Result[][]"})

    def test_void_and_no_parameters(self):
        self.assertEqual(parse_method_descriptor("()V"), {"parameters": [], "returns": "void"})

    def test_field_descriptors(self):
        for raw, expected in [("I", "int"), ("[[D", "double[][]"),
                              ("Ljava/lang/String;", "java.lang.String"),
                              ("[Lexample/Owner$Inner;", "example.Owner$Inner[]")]:
            with self.subTest(raw=raw):
                self.assertEqual(parse_field_descriptor(raw), expected)

    def test_invalid_method_descriptors(self):
        values = [None, b"()V", "", "I", "(V)V", "([V)V", "(I", "(I)", "()",
                  "()VV", "()Vjunk", "(I))V", "()Q", "(L;)V", "(Lp.Owner;)V",
                  "(Lp//Owner;)V", "(Lp/Owner)V", "(L/p/Owner;)V", "(Lp/Owner<;)V",
                  "(Ljava/lang/String;)Ljava/lang/String", "([)V", "() V",
                  "(" + "[" * 256 + "I)V", "(" + "I" * 256 + ")V",
                  "(" + "J" * 128 + ")V", "(" + "I" * 4096 + ")V"]
        for value in values:
            with self.subTest(value=repr(value)[:60]), self.assertRaises(ValueError):
                parse_method_descriptor(value)

    def test_invalid_field_descriptors(self):
        for value in [None, "", "V", "[V", "()I", "II", "L;", "Lp.Owner;", "Igarbage"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_field_descriptor(value)

    def test_exact_dimension_and_parameter_slot_limits(self):
        self.assertEqual(parse_field_descriptor("[" * 255 + "I"), "int" + "[]" * 255)
        self.assertEqual(len(parse_method_descriptor("(" + "I" * 255 + ")V")["parameters"]), 255)
        self.assertEqual(len(parse_method_descriptor("(" + "J" * 127 + "I)V")["parameters"]), 128)


class NativeReportTests(unittest.TestCase):
    def assertBlocked(self, root, code=None, **options):
        result = normalize(root, **options)
        self.assertEqual(result["status"], "blocked")
        self.assertFalse(result["report"]["healthy"])
        self.assertFalse(result["report"]["complete"])
        self.assertFalse(result["report"]["unfiltered"])
        self.assertTrue(result["issues"])
        if code is not None:
            self.assertIn(code, result["issues"])
        return result

    def test_valid_unknown_pattern_exact_identity_and_native_descriptors(self):
        result = normalize(report())
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["issues"], [])
        self.assertTrue(result["report"]["healthy"])
        self.assertEqual(result["report"]["exitCode"], 1)
        self.assertEqual(result["report"]["findings"], [{
            "kind": "java", "file": "example/Owner.java", "severity": "warning",
            "pattern": "UNKNOWN_FUTURE_PATTERN", "className": CLASSES[0], "member": "overloaded",
            "signature": {"parameters": ["int", "java.lang.String[][]", "long"],
                          "returns": "java.lang.Object"},
            "field": "values", "startLine": 42, "endLine": 43}])
        native = result["nativeFindings"][0]["children"]
        self.assertEqual(native[1]["attributes"]["signature"], "(I[[Ljava/lang/String;J)Ljava/lang/Object;")
        self.assertEqual(native[2]["attributes"]["signature"], "[Ljava/lang/String;")
        self.assertEqual(native[3]["attributes"]["startBytecode"], "7")
        self.assertEqual(result["coverage"]["analyzedClasses"], sorted(CLASSES))
        self.assertNotIn("accepted", result)

    def test_empty_findings_require_real_coverage_and_zero_raw_exit(self):
        result = normalize(report([]), exit_code=0)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["coverage"]["totalClasses"], 3)
        self.assertEqual(result["report"]["findings"], [])

    def test_unavailable_empty_and_wrong_input_types(self):
        self.assertBlocked(None, "REPORT_UNAVAILABLE")
        for value in [b"", "<BugCollection/>", bytearray(b"x"), 123, b" " * (MAX_REPORT_BYTES + 1)]:
            with self.subTest(kind=type(value).__name__):
                self.assertBlocked(value, "INVALID_REPORT_BYTES")

    def test_raw_exit_is_never_inferred_or_rewritten(self):
        for code in [None, -1, 2, 4, 127]:
            result = self.assertBlocked(report(), exit_code=code)
            self.assertEqual(result["report"]["exitCode"], code)
        self.assertBlocked(report(), "RAW_EXIT_MISMATCH", exit_code=0)
        self.assertBlocked(report([]), "RAW_EXIT_MISMATCH", exit_code=1)

    def test_explicit_zero_total_classes_with_findings_is_blocked(self):
        root = report([bug() for _ in range(25)])
        summary = root.find("FindBugsSummary")
        summary.set("total_classes", "0")
        summary.remove(summary.find("PackageStats"))
        result = self.assertBlocked(root, "EMPTY_COVERAGE")
        self.assertEqual(len(result["nativeFindings"]), 25)
        self.assertEqual(len(result["report"]["findings"]), 25)
        self.assertEqual(result["coverage"]["analyzedClasses"], [])

    def test_missing_class_inventory_is_not_inferred_from_findings(self):
        root = report()
        summary = root.find("FindBugsSummary")
        summary.remove(summary.find("PackageStats"))
        SubElement(summary, "FileStats", path="example/Owner.java", bugCount="1")
        result = self.assertBlocked(root, "MISSING_CLASS_INVENTORY")
        self.assertEqual(result["coverage"]["analyzedClasses"], [])

    def test_wrong_root_and_version(self):
        root = report()
        root.tag = "FindBugsSummary"
        self.assertBlocked(root, "WRONG_ROOT")
        for version in ["4.10.4", "4.10.5.0", "4.10.5 ", ""]:
            root = report()
            root.set("version", version)
            self.assertBlocked(root, "VERSION_MISMATCH")
        root.attrib.pop("version")
        self.assertBlocked(root, "VERSION_MISMATCH")

    def test_missing_duplicate_or_nested_required_sections(self):
        for tag in ["Project", "Errors", "FindBugsSummary"]:
            for mode in ["missing", "duplicate", "nested"]:
                with self.subTest(tag=tag, mode=mode):
                    root = report()
                    child = root.find(tag)
                    if mode == "missing":
                        root.remove(child)
                    elif mode == "duplicate":
                        root.append(copy.deepcopy(child))
                    else:
                        root.remove(child)
                        SubElement(root, "Wrapper").append(child)
                    self.assertBlocked(root, "INVALID_" + tag.upper())

    def test_project_requires_exact_single_application_output(self):
        for mutation in ["different", "extra", "missing", "whitespace", "nested"]:
            with self.subTest(mutation=mutation):
                root = report()
                project = root.find("Project")
                jar = project.find("Jar")
                if mutation == "different":
                    jar.text = "/other/classes"
                elif mutation == "extra":
                    SubElement(project, "Jar").text = OUTPUT
                elif mutation == "missing":
                    project.remove(jar)
                elif mutation == "whitespace":
                    jar.text = OUTPUT + " "
                else:
                    SubElement(jar, "Unexpected")
                self.assertBlocked(root, "PROJECT_OUTPUT_MISMATCH")

    def test_errors_and_missing_classes_even_with_false_zero_counters(self):
        for key in ["errors", "missingClasses"]:
            root = report()
            root.find("Errors").set(key, "1")
            self.assertBlocked(root, "ANALYSIS_INCOMPLETE")
        for tag in ["Error", "MissingClass", "Unexpected"]:
            root = report()
            SubElement(root.find("Errors"), tag).text = "synthetic"
            self.assertBlocked(root, "ANALYSIS_INCOMPLETE")
        root = report()
        SubElement(root.find("Project"), "MissingClass").text = "example.Absent"
        self.assertBlocked(root, "ANALYSIS_INCOMPLETE")

    def test_unsigned_bounded_canonical_counters_required(self):
        for value in [None, "", "-1", "+1", " 0", "0 ", "01", "0.0", "2147483648", "9" * 100]:
            for tag, attribute in [("Errors", "errors"), ("FindBugsSummary", "total_classes")]:
                with self.subTest(value=value, tag=tag):
                    root = report()
                    element = root.find(tag)
                    if value is None:
                        element.attrib.pop(attribute)
                    else:
                        element.set(attribute, value)
                    self.assertBlocked(root, "INVALID_NUMBER")

    def test_totals_and_priority_mutations_fail_at_every_level(self):
        for path, key in [("FindBugsSummary", "total_bugs"),
                          ("FindBugsSummary", "priority_2"),
                          ("FindBugsSummary", "num_packages"),
                          ("FindBugsSummary", "total_classes"),
                          ("FindBugsSummary", "total_size"),
                          (".//PackageStats", "total_types"),
                          (".//PackageStats", "total_bugs"),
                          (".//PackageStats", "priority_2"),
                          (".//PackageStats", "total_size"),
                          (".//ClassStats", "bugs"),
                          (".//ClassStats", "priority_2"),
                          (".//ClassStats", "size")]:
            with self.subTest(path=path, key=key):
                root = report()
                element = root.find(path)
                element.set(key, str(int(element.get(key, "0")) + 1))
                self.assertBlocked(root)

    def test_crop_one_bug_but_leave_native_totals(self):
        root = report([bug(), bug()])
        root.remove(root.find("BugInstance"))
        result = self.assertBlocked(root, "INCONSISTENT_BUG_TOTAL")
        self.assertEqual(len(result["nativeFindings"]), 1)

    def test_missing_extra_duplicate_or_unreported_coverage_class(self):
        for mode in ["missing", "extra", "duplicate", "wrong-package", "unknown-finding-owner"]:
            root = report()
            package = root.find(".//PackageStats")
            if mode == "missing":
                package.remove(package[-1])
            elif mode == "extra":
                extra = copy.deepcopy(package[-1])
                extra.set("class", "example.Extra")
                package.append(extra)
            elif mode == "duplicate":
                package.append(copy.deepcopy(package[-1]))
            elif mode == "wrong-package":
                package.set("package", "elsewhere")
            else:
                root.find("BugInstance/Class").set("classname", "example.Absent")
            with self.subTest(mode=mode):
                self.assertBlocked(root)

    def test_no_finding_class_is_not_treated_as_missing_coverage(self):
        self.assertEqual(normalize(report())["status"], "ready")
        self.assertBlocked(report(), "COVERAGE_MISMATCH", expected_classes=CLASSES[:-1])

    def test_coverage_metadata_and_structure_required(self):
        for key in ["interface", "sourceFile", "bugs", "size"]:
            root = report()
            root.find(".//ClassStats").attrib.pop(key)
            self.assertBlocked(root)
        root = report()
        package = root.find(".//PackageStats")
        stats = package[0]
        package.remove(stats)
        root.find("FindBugsSummary").append(stats)
        self.assertBlocked(root, "INVALID_COVERAGE_STRUCTURE")

    def test_file_stats_are_cross_checked_when_present(self):
        root = report()
        summary = root.find("FindBugsSummary")
        file = SubElement(summary, "FileStats", path="example/Owner.java", bugCount="1")
        self.assertEqual(normalize(root)["status"], "ready")
        file.set("bugCount", "0")
        self.assertBlocked(root, "INCONSISTENT_FILE_TOTAL")
        file.set("bugCount", "1")
        summary.append(copy.deepcopy(file))
        self.assertBlocked(root, "DUPLICATE_FILE_STATS")

    def test_filter_suppression_cropped_and_historical_markers(self):
        for tag in ["SuppressionFilter", "FindBugsFilter", "IncludeFilter", "ExcludeFilter"]:
            root = report()
            SubElement(root.find("Project"), tag)
            self.assertBlocked(root, "FILTERED_REPORT")
        for key in ["filtered", "suppressed", "truncated", "cropped", "abridged"]:
            root = report()
            root.set(key, "true")
            self.assertBlocked(root, "FILTERED_REPORT")
        root = report()
        root.set("sequence", "1")
        self.assertBlocked(root, "HISTORICAL_REPORT")
        root = report()
        root.find("BugInstance").set("last", "1")
        self.assertBlocked(root, "HISTORICAL_REPORT")
        root = report()
        SubElement(root.find("History"), "AppVersion", sequence="0")
        self.assertBlocked(root, "HISTORICAL_REPORT")

    def test_nonprimary_annotations_do_not_replace_exact_primary(self):
        root = report()
        element = root.find("BugInstance")
        SubElement(element, "Class", classname="elsewhere.Other")
        SubElement(element, "Method", classname="elsewhere.Other", name="wrong", signature="()V")
        SubElement(element, "Field", classname="elsewhere.Other", name="wrong", signature="I")
        element.find("SourceLine").set("primary", "true")
        SubElement(element, "SourceLine", classname="elsewhere.Other", start="1", end="1",
                   sourcepath="elsewhere/Other.java")
        result = normalize(root)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["report"]["findings"][0]["member"], "overloaded")
        self.assertEqual(len(result["nativeFindings"][0]["children"]), 8)

    def test_multiple_or_missing_primary_never_uses_first_annotation(self):
        for tag in ["Class", "Method", "Field", "SourceLine"]:
            for mode in ["double-primary", "unmarked", "false", "bad-flag"]:
                root = report()
                element = root.find("BugInstance")
                annotation = element.find(tag)
                if mode == "double-primary":
                    annotation.set("primary", "true")
                    element.append(copy.deepcopy(annotation))
                elif mode == "unmarked":
                    annotation.attrib.pop("primary", None)
                    element.append(copy.deepcopy(annotation))
                else:
                    annotation.set("primary", "false" if mode == "false" else "TRUE")
                with self.subTest(tag=tag, mode=mode):
                    self.assertBlocked(root)

    def test_class_or_field_only_findings_are_retained_but_blocked(self):
        for field_only in [False, True]:
            root = report()
            element = root.find("BugInstance")
            element.remove(element.find("Method"))
            if not field_only:
                element.remove(element.find("Field"))
            result = self.assertBlocked(root, "MISSING_PRIMARY_METHOD")
            self.assertEqual(len(result["nativeFindings"]), 1)
            self.assertEqual(len(result["report"]["findings"]), 1)
            self.assertIsNone(result["report"]["findings"][0]["member"])

    def test_primary_owner_descriptor_and_static_metadata_mutations(self):
        mutations = [("Method", "classname", "example.Other"),
                     ("Field", "classname", "example.Other"),
                     ("SourceLine", "classname", "example.Other"),
                     ("Method", "signature", "(V)V"),
                     ("Field", "signature", "V"),
                     ("Method", "isStatic", "unknown"),
                     ("Method", "name", "a.b"),
                     ("Field", "name", "a.b"),
                     ("Class", "classname", "example..Owner")]
        for tag, key, value in mutations:
            root = report()
            root.find("BugInstance/" + tag).set(key, value)
            with self.subTest(tag=tag, key=key):
                self.assertBlocked(root)

    def test_constructor_static_initializer_and_receiver_slot_rules(self):
        for member, static in [("<init>", "false"), ("<clinit>", "true")]:
            root = report([bug(descriptor="()V", member=member, field=False)])
            method = root.find("BugInstance/Method")
            method.set("isStatic", static)
            self.assertEqual(normalize(root)["status"], "ready")
            method.set("signature", "()I")
            self.assertBlocked(root, "INVALID_SPECIAL_METHOD")
            method.set("signature", "(I)V")
            if member == "<clinit>":
                self.assertBlocked(root, "INVALID_SPECIAL_METHOD")
            method.set("isStatic", "false" if static == "true" else "true")
            self.assertBlocked(root, "INVALID_SPECIAL_METHOD")
        root = report([bug(descriptor="(" + "I" * 255 + ")V", field=False)])
        self.assertBlocked(root, "INVALID_DESCRIPTOR")
        root.find("BugInstance/Method").set("isStatic", "true")
        self.assertEqual(normalize(root)["status"], "ready")

    def test_overloads_duplicates_and_all_priorities_remain_distinct(self):
        bugs = [bug(descriptor="(I)V"), bug(descriptor="(J)V"), bug(descriptor="(I)V")]
        for priority in range(1, 6):
            extra = bug(pattern="PATTERN_" + str(priority), field=False)
            extra.set("priority", str(priority))
            bugs.append(extra)
        result = normalize(report(bugs))
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(result["report"]["findings"]), 8)
        self.assertEqual(result["report"]["findings"][0], result["report"]["findings"][2])
        self.assertNotEqual(result["report"]["findings"][0], result["report"]["findings"][1])

    def test_sourcepath_and_exact_location_never_fallback_to_method(self):
        for key, value in [("sourcepath", "../Owner.java"), ("sourcepath", "/abs/Owner.java"),
                           ("sourcepath", "example\\Owner.java"), ("sourcepath", "example/./Owner.java"),
                           ("sourcepath", "example/Owner.class"), ("start", "0"),
                           ("start", "44"), ("end", "-1")]:
            root = report()
            root.find("BugInstance/SourceLine").set(key, value)
            with self.subTest(key=key, value=value):
                self.assertBlocked(root)
        root = report()
        element = root.find("BugInstance")
        element.remove(element.find("SourceLine"))
        self.assertBlocked(root, "MISSING_PRIMARY_SOURCELINE")

    def test_bad_priority_unknown_metadata_and_nested_findings(self):
        for priority in ["0", "6", "-1", "normal"]:
            root = report()
            root.find("BugInstance").set("priority", priority)
            self.assertBlocked(root)
        root = report()
        root.find("FindBugsSummary").set("priority_6", "0")
        self.assertBlocked(root, "INVALID_PRIORITY")
        root = report()
        element = root.find("BugInstance")
        root.remove(element)
        root.find("Project").append(element)
        result = self.assertBlocked(root, "NESTED_FINDING")
        self.assertEqual(len(result["nativeFindings"]), 1)
        root = report()
        SubElement(root, "UnrecognizedReportMode")
        self.assertBlocked(root, "UNEXPECTED_ROOT_ELEMENT")

    def test_invalid_expectations_raise_without_consulting_other_inputs(self):
        for options in [dict(expected_classes=[]), dict(expected_classes=[CLASSES[0]] * 2),
                        dict(expected_classes=["bad..Class"]), dict(expected_classes="example.Owner"),
                        dict(expected_classes=[{}]), dict(expected_version=""),
                        dict(class_output_path="../classes"), dict(class_output_path="/a/../classes"),
                        dict(exit_code=True), dict(exit_code="1"), dict(tool_id="bad id")]:
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, "INVALID_EXPECTATIONS"):
                normalize(report(), **options)

    def test_result_has_no_shared_mutable_state_or_input_mutation(self):
        root = report()
        before = tostring(root)
        first = normalize(root)
        first["report"]["findings"][0]["signature"]["parameters"].append("bad")
        first["nativeFindings"][0]["attributes"]["type"] = "changed"
        self.assertEqual(normalize(root)["status"], "ready")
        self.assertEqual(tostring(root), before)

    def test_adapter_does_not_open_files_read_environment_or_spawn_processes(self):
        xml = tostring(report())
        with patch("builtins.open", side_effect=AssertionError("I/O forbidden")), \
             patch("os.getenv", side_effect=AssertionError("environment forbidden")), \
             patch("os.environ", {}), \
             patch("subprocess.Popen", side_effect=AssertionError("process forbidden")):
            self.assertEqual(normalize(xml)["status"], "ready")


class XmlSafetyTests(unittest.TestCase):
    assertBlocked = NativeReportTests.assertBlocked

    def test_malformed_duplicate_attributes_and_trailing_data(self):
        for xml in [b"<", b"<BugCollection>", b"<a x='1' x='2'/>",
                    tostring(report()) + b"junk", tostring(report())[:-12],
                    b"<BugCollection>&unknown;</BugCollection>"]:
            with self.subTest(xml=xml[:30]):
                self.assertBlocked(xml, "MALFORMED_XML")

    def test_dtd_and_internal_external_parameter_entities_all_encodings(self):
        declarations = [
            '<!DOCTYPE BugCollection>',
            '<!DOCTYPE BugCollection SYSTEM "file:///synthetic/must-not-open">',
            '<!DOCTYPE BugCollection [<!ENTITY x "expanded">]>',
            '<!DOCTYPE BugCollection [<!ENTITY x SYSTEM "https://invalid.example/no-network">]>',
            '<!DOCTYPE BugCollection [<!ENTITY % x SYSTEM "file:///synthetic/no-read">%x;]>',
        ]
        body = tostring(report(), encoding="unicode")
        for declaration in declarations:
            for encoding in ["utf-8", "utf-16", "utf-32"]:
                xml = ('<?xml version="1.0" encoding="' + encoding + '"?>' + declaration + body).encode(encoding)
                with self.subTest(declaration=declaration[:40], encoding=encoding):
                    self.assertBlocked(xml)

    def test_namespaces_processing_instructions_and_xinclude_rejected(self):
        for xml in [b'<BugCollection xmlns="urn:test"/>', b'<x:BugCollection xmlns:x="urn:test"/>',
                    b'<?xml-stylesheet href="file:///synthetic/no-read"?><BugCollection/>',
                    b'<BugCollection xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="x"/></BugCollection>']:
            self.assertBlocked(xml)

    def test_builtin_escapes_and_utf8_or_utf16_native_xml(self):
        root = report([bug(member="<init>", descriptor="()V")])
        SubElement(root.find("BugInstance"), "LongMessage").text = 'escaped < > & " text'
        for encoding in ["utf-8", "utf-16"]:
            result = normalize(tostring(root, encoding=encoding, xml_declaration=True))
            self.assertEqual(result["status"], "ready")
            self.assertEqual(result["report"]["findings"][0]["member"], "<init>")

    def test_depth_and_element_resource_limits(self):
        deep = b"<a>" * (MAX_DEPTH + 1) + b"</a>" * (MAX_DEPTH + 1)
        self.assertBlocked(deep, "XML_RESOURCE_LIMIT")
        many = b"<a>" + b"<b/>" * MAX_ELEMENTS + b"</a>"
        self.assertBlocked(many, "XML_RESOURCE_LIMIT")

    def test_error_output_never_echoes_parser_input(self):
        marker = "SYNTHETIC_DO_NOT_ECHO"
        result = self.assertBlocked(('<broken secret="' + marker + '">').encode())
        self.assertNotIn(marker, repr(result))


if __name__ == "__main__":
    unittest.main()
