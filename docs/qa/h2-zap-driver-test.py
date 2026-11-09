"""Synthetic only: no ZAP process, application traffic or filesystem writes."""
import copy
import importlib.util
import unittest
from unittest.mock import patch, mock_open, MagicMock

spec = importlib.util.spec_from_file_location("driver", "/qa/driver.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def har():
    return {"log": {"entries": [
        {"request": {"url": url, "method": "GET", "headers": [], "cookies": []},
         "response": {"status": 200, "cookies": [], "headers": [], "content": {"text": "hello"}}}
        for url in driver.TARGETS
    ]}}


class DriverTests(unittest.TestCase):
    def test_valid_har(self):
        self.assertEqual(len(driver.validate_har(har())), 8)

    def test_bad_count_scope_method_credentials_cookie_and_size(self):
        for change in ("count", "scope", "method", "headers", "cookie", "size"):
            with self.subTest(change=change):
                data = har()
                entry = data["log"]["entries"][0]
                if change == "count":
                    data["log"]["entries"].pop()
                elif change == "scope":
                    entry["request"]["url"] = "http://evil.example/"
                elif change == "method":
                    entry["request"]["method"] = "POST"
                elif change == "headers":
                    entry["request"]["headers"] = [{"name": "Cookie", "value": "synthetic"}]
                elif change == "cookie":
                    entry["response"]["headers"] = [{"name": "Set-Cookie", "value": "synthetic=synthetic"}]
                else:
                    entry["response"]["content"]["text"] = "a" * (1024 * 1024 + 1)
                with self.assertRaises(ValueError):
                    driver.validate_har(data)

    def test_imported_message_url_forms(self):
        for header in ("GET http://localhost:5173/ HTTP/1.1\r\n", "GET / HTTP/1.1\r\nHost: localhost:5173\r\n"):
            self.assertEqual(driver.message_url({"requestHeader": header}), driver.TARGETS[0])
        with self.assertRaises(ValueError):
            driver.message_url({"requestHeader": "POST / HTTP/1.1\r\nHost: localhost:5173\r\n"})

    def test_alert_numeric_and_named_enums_and_privacy(self):
        source = {"url": driver.TARGETS[0], "alert": "Synthetic\r\nname", "pluginId": "10001",
                  "risk": "Low", "confidence": "Medium", "evidence": "SYNTHETIC_PRIVATE_DETAIL"}
        result = driver.sanitized_alert(source)
        self.assertEqual(result["risk"], 1)
        self.assertEqual(result["confidence"], 2)
        self.assertEqual(result["name"], "Synthetic  name")
        self.assertNotIn("evidence", result)
        source.update(riskcode="2", confidence="3")
        self.assertEqual(driver.sanitized_alert(source)["risk"], 2)

    def test_alert_rejects_unknown_scope_and_credentials(self):
        source = {"url": driver.TARGETS[0], "alert": "Synthetic", "pluginId": "10001", "risk": "Low", "confidence": "High"}
        for change in ({"url": "http://evil.example/"}, {"alert": "eyJSYNTHETIC"}, {"pluginId": "bad"}, {"risk": "unknown"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                driver.sanitized_alert({**copy.deepcopy(source), **change})

    def test_validation_precedes_any_zap_process(self):
        with patch.object(driver.subprocess, "Popen") as process:
            with self.assertRaises(ValueError):
                driver.scan({"log": {"entries": []}})
            process.assert_not_called()

    def test_full_driver_disables_replay_checks_membership_and_worker_completion(self):
        calls = []
        def api(component, kind, operation, **params):
            calls.append((component, kind, operation, params))
            if operation == "version":
                return {"version": "2.17.0"}
            if operation == "installedAddons":
                return {"installedAddons": [{"id": "exim"}]}
            if operation == "scanners":
                return {"scanners": [{"enabled": "true"}]}
            if operation == "importHar":
                return {"Result": "OK"}
            if operation == "recordsToScan":
                return {"recordsToScan": "0"}
            if operation == "currentTasks":
                return {"currentTasks": []}
            if operation == "alerts":
                return {"alerts": []}
            if operation == "messages":
                if sum(call[2] == "messages" for call in calls) == 1:
                    return {"messages": []}
                return {"messages": [{"type": "15", "requestHeader": "GET " + url + " HTTP/1.1\r\n",
                                     "responseHeader": "HTTP/1.1 200 OK\r\n", "responseBody": "hello"} for url in driver.TARGETS]}
            self.fail("unapproved operation")
        with patch.object(driver, "api", side_effect=api), patch.object(driver.os, "mkdir"), \
             patch("builtins.open", mock_open()), patch.object(driver.subprocess, "Popen", return_value=MagicMock()), \
             patch.object(driver.time, "sleep"):
            result = driver.scan(har())
        self.assertTrue(result["complete"])
        imports = [call for call in calls if call[2] == "importHar"]
        self.assertEqual(len(imports), 1)
        self.assertEqual(imports[0][3]["sendRequests"], "false")
        self.assertEqual(imports[0][3]["maxMessages"], 8)
        self.assertEqual(sum(call[2] == "currentTasks" for call in calls), 3)

    def test_only_native_empty_ancestor_placeholders_are_distinguished(self):
        entries = har()["log"]["entries"]
        records = [{"type": "15", "requestHeader": "GET " + url + " HTTP/1.1\r\n",
                    "responseHeader": "HTTP/1.1 200 OK\r\n", "responseBody": "hello"} for url in driver.TARGETS]
        placeholder = {"type": "0", "requestHeader": "GET http://localhost:8080/api HTTP/1.1\r\n",
                       "responseHeader": "HTTP/1.1 0\r\n", "responseBody": "", "requestBody": ""}
        actual, count = driver.imported_messages(records + [placeholder], entries)
        self.assertEqual(len(actual), 8)
        self.assertEqual(count, 1)
        for change in ({"type": "1"}, {"responseHeader": "HTTP/1.1 200 OK\r\n"},
                       {"responseBody": "unexpected"}, {"requestBody": "unexpected"},
                       {"requestHeader": "GET http://evil.example/ HTTP/1.1\r\n"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                driver.imported_messages(records + [{**placeholder, **change}], entries)
        for change in ({"responseBody": "changed"}, {"responseHeader": "HTTP/1.1 201 OK\r\n"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                driver.imported_messages([{**records[0], **change}] + records[1:], entries)
        with self.assertRaises(ValueError):
            driver.imported_messages(records + [records[0]], entries)


if __name__ == "__main__":
    unittest.main(verbosity=1)
