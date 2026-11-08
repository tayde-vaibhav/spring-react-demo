"""Offline parser controls only. Does not invoke Java, compile, or analyze."""

from pathlib import Path
import tempfile
import unittest

import run


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.report = Path(self.directory.name) / "report.xml"
        self.classes = Path(self.directory.name) / "classes"
        self.valid = f'''<BugCollection version="4.10.5">
          <Project><Jar>{self.classes}</Jar>
            <Plugin id="com.h3xstream.findsecbugs" enabled="true"/>
          </Project>
          <BugInstance type="EI_EXPOSE_REP2" priority="2">
            <Method classname="{run.PACKAGE}MutableAlias" name="&lt;init&gt;"
                    signature="(Ljava/util/List;)V" primary="true"/>
          </BugInstance>
          <Errors errors="0" missingClasses="0"/>
          <FindBugsSummary total_classes="4" total_bugs="1"/>
        </BugCollection>'''

    def parse(self, content):
        self.report.write_text(content)
        return run.parse_report(self.report, self.classes, {"EI_EXPOSE_REP2"})

    def test_preserves_measured_identity(self):
        findings = self.parse(self.valid)
        self.assertEqual(findings, [{"pattern": "EI_EXPOSE_REP2",
                                    "class": run.PACKAGE + "MutableAlias",
                                    "method": "<init>", "signature": "(Ljava/util/List;)V",
                                    "priority": "2"}])

    def test_rejects_unhealthy_incomplete_or_wrong_scope_report(self):
        mutations = {
            "malformed": self.valid[:-10],
            "wrong_version": self.valid.replace('version="4.10.5"', 'version="4.10.4"'),
            "missing_health": self.valid.replace('<Errors errors="0" missingClasses="0"/>', ""),
            "duplicate_health": self.valid.replace('<Errors ', '<Errors errors="0" missingClasses="0"/><Errors '),
            "errors": self.valid.replace('errors="0"', 'errors="1"'),
            "missing_classes": self.valid.replace('missingClasses="0"', 'missingClasses="1"'),
            "hidden_error": self.valid.replace('/>\n          <FindBugsSummary', '><Error/></Errors>\n          <FindBugsSummary'),
            "hidden_missing_class": self.valid.replace('</BugCollection>', '<MissingClass>synthetic</MissingClass></BugCollection>'),
            "wrong_scope": self.valid.replace(str(self.classes), str(self.classes.parent / "test-classes")),
            "extra_scope": self.valid.replace('</Jar>', '</Jar><Jar>target/classes</Jar>'),
            "wrong_count": self.valid.replace('total_classes="4"', 'total_classes="5"'),
            "wrong_total": self.valid.replace('total_bugs="1"', 'total_bugs="2"'),
            "missing_total": self.valid.replace(' total_bugs="1"', ''),
            "disabled_plugin": self.valid.replace('enabled="true"', 'enabled="false"'),
            "unknown_pattern": self.valid.replace('type="EI_EXPOSE_REP2"', 'type="UNKNOWN"'),
            "nonfixture_class": self.valid.replace(run.PACKAGE + 'MutableAlias', 'example.Application'),
            "missing_signature": self.valid.replace('signature="(Ljava/util/List;)V"', ''),
            "dtd": '<!DOCTYPE BugCollection>' + self.valid,
        }
        for label, content in mutations.items():
            with self.subTest(label=label), self.assertRaises(run.Blocked):
                self.parse(content)

    def test_reports_unsupported_and_undetected_candidates_without_success(self):
        findings = self.parse(self.valid)
        controls = run.controls(findings, {"EI_EXPOSE_REP2", "PREDICTABLE_RANDOM"})
        self.assertEqual(controls[0]["status"], "OBSERVED")
        self.assertEqual(controls[0]["count"], 1)
        self.assertEqual(controls[1]["status"], "UNSUPPORTED")
        self.assertEqual(controls[2]["status"], "UNDETECTED")
        self.assertFalse(all(c["status"] == "OBSERVED" for c in controls))

    def test_counts_multiple_observations_instead_of_assuming_one(self):
        findings = self.parse(self.valid)
        controls = run.controls(findings + findings, {"EI_EXPOSE_REP2"})
        self.assertEqual(controls[0]["count"], 2)

    def test_native_exit_flags_fail_closed(self):
        run.validate_exit(0, [])
        run.validate_exit(1, [{"pattern": "synthetic"}])
        for code in (2, 3, 4, 5, 6, 7, -1, 99):
            with self.subTest(code=code), self.assertRaises(run.Blocked):
                run.validate_exit(code, [{"pattern": "synthetic"}])
        with self.assertRaises(run.Blocked):
            run.validate_exit(0, [{"pattern": "synthetic"}])
        with self.assertRaises(run.Blocked):
            run.validate_exit(1, [])


if __name__ == "__main__":
    unittest.main()
