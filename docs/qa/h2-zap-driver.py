"""QA-only ZAP import driver. Never replay requests or expose raw diagnostics."""
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter
from urllib.parse import urlencode
from urllib.request import ProxyHandler, Request, build_opener

TARGETS = (
    "http://localhost:5173/", "http://localhost:5173/login",
    "http://localhost:8080/actuator/health", "http://localhost:8080/app-test",
    "http://localhost:8080/api/v1/products?page=0&size=1",
    "http://localhost:8080/api/v1/products/stats",
    "http://localhost:8080/api/v1/auth/me", "http://localhost:8080/qa-h2-not-found",
)
API = "http://127.0.0.1:8090/JSON/"  # Scanner-private loopback, not a host application.
LIMIT = 16 * 1024 * 1024
OPENER = build_opener(ProxyHandler({}))
SAFE_ERRORS = {"SCANNER_STARTUP", "SCANNER_VERSION", "NO_IMPORT_ADDON", "NO_PASSIVE_RULES",
               "PREEXISTING_MESSAGES", "IMPORT_REJECTED", "PASSIVE_TIMEOUT", "IMPORTED_MEMBERSHIP",
               "ALERT_LIMIT", "API_FAILURE", "API_SIZE"}
DIAGNOSTICS = {}


def validate_har(har):
    entries = har["log"]["entries"]
    if len(entries) != 8:
        raise ValueError("HAR_COUNT")
    if [entry["request"]["url"] for entry in entries] != list(TARGETS):
        raise ValueError("HAR_SCOPE")
    for entry in entries:
        request = entry["request"]
        if request["method"] != "GET" or request["headers"] or request["cookies"] or request.get("postData"):
            raise ValueError("HAR_METHOD_OR_CREDENTIALS")
        if entry["response"]["cookies"]:
            raise ValueError("HAR_COOKIES")
        if len(entry["response"]["content"]["text"].encode("utf-8")) > 1024 * 1024:
            raise ValueError("HAR_SIZE")
        for header in entry["response"]["headers"]:
            if header["name"].lower() == "set-cookie" and not re.match(
                r"^(?:ACCESS_TOKEN|XSRF-TOKEN|JSESSIONID|qa-cookie)=qa-redacted(?:;|$)", header["value"]
            ):
                raise ValueError("HAR_COOKIE_VALUE")
    return entries


def api(component, kind, operation, **params):
    # Components/operations are literals at call sites; no target URLs accepted here.
    url = API + component + "/" + kind + "/" + operation + "/"
    if params:
        url += "?" + urlencode(params)
    with OPENER.open(Request(url), timeout=3) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("API_SIZE")
    result = json.loads(data)
    if isinstance(result, dict) and "code" in result:
        raise ValueError("API_FAILURE")
    return result


def message_url(message):
    line = message["requestHeader"].split("\r\n", 1)[0]
    parts = line.split(" ")
    if len(parts) != 3 or parts[0] != "GET":
        raise ValueError("IMPORTED_METHOD")
    if parts[1].startswith("http://"):
        return parts[1]
    headers = message["requestHeader"].split("\r\n")[1:]
    hosts = [line.split(":", 1)[1].strip() for line in headers if line.lower().startswith("host:")]
    if len(hosts) != 1:
        raise ValueError("IMPORTED_HOST")
    return "http://" + hosts[0] + parts[1]


def imported_messages(messages, entries):
    """Validate type-15 HAR responses separately from native type-0 tree ancestors.

    Pinned HarImporter.persistMessage writes type 15; SiteMap.createReference
    writes type 0. ApiResponseConversionUtils exposes the native type. No other
    history or unexpected response content may silently disappear from coverage.
    """
    if len(messages) >= 100:
        raise ValueError("IMPORTED_MEMBERSHIP")
    expected = {entry["request"]["url"]: entry["response"] for entry in entries}
    imported = []
    placeholders = 0
    for message in messages:
        url = message_url(message)
        match = re.match(r"^HTTP/\S+\s+(\d+)", message.get("responseHeader", ""))
        status = int(match.group(1)) if match else 0
        if str(message.get("type")) == "15":
            if url not in expected or status != expected[url]["status"] or message["responseBody"] != expected[url]["content"]["text"]:
                raise ValueError("IMPORTED_MEMBERSHIP")
            imported.append(message)
        elif str(message.get("type")) == "0" and status == 0 and not message.get("responseBody") and not message.get("requestBody"):
            ancestor = url.rstrip("/")
            if not any(target.startswith(ancestor + "/") or target.startswith(ancestor + "?") for target in TARGETS):
                raise ValueError("IMPORTED_MEMBERSHIP")
            placeholders += 1
        else:
            raise ValueError("IMPORTED_MEMBERSHIP")
    if len(imported) > 8:
        raise ValueError("IMPORTED_MEMBERSHIP")
    return imported, placeholders


def sanitized_alert(alert):
    url = alert["url"]
    if url not in TARGETS:
        raise ValueError("ALERT_SCOPE")
    name = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", str(alert["alert"]))[:160]
    if re.search(r"eyJ|Bearer\s+\S+", name, re.I):
        raise ValueError("ALERT_PRIVACY")
    plugin = str(alert["pluginId"])
    risks = {"Informational": 0, "Low": 1, "Medium": 2, "High": 3}
    confidences = {"False Positive": 0, "Low": 1, "Medium": 2, "High": 3, "Confirmed": 4}
    raw_risk = alert.get("riskcode", alert.get("risk"))
    raw_confidence = alert["confidence"]
    risk = risks[raw_risk] if raw_risk in risks else int(raw_risk)
    confidence = confidences[raw_confidence] if raw_confidence in confidences else int(raw_confidence)
    if not re.fullmatch(r"\d{1,8}", plugin) or risk not in range(4) or confidence not in range(5):
        raise ValueError("ALERT_SCHEMA")
    return {"pluginId": plugin, "name": name, "risk": risk, "confidence": confidence, "url": url}


def scan(har):
    entries = validate_har(har)
    os.mkdir("/tmp/h2-zap")
    filename = "/tmp/h2-input.har"
    with open(filename, "w", encoding="utf-8") as handle:
        json.dump(har, handle)
    command = ["/zap/zap.sh", "-Xmx512m", "-daemon", "-silent", "-dir", "/tmp/h2-zap",
               "-host", "127.0.0.1", "-port", "8090", "-config", "database.recoverylog=false",
               "-config", "api.disablekey=true", "-config", "api.addrs.addr.name=127.0.0.1",
               "-config", "api.addrs.addr.regex=false"]
    with open("/tmp/h2-zap-process.log", "wb") as log:
        process = subprocess.Popen(command, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 90
            while True:
                try:
                    version = api("core", "view", "version")["version"]
                    break
                except Exception:
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise ValueError("SCANNER_STARTUP") from None
                    time.sleep(1)
            if version != "2.17.0":
                raise ValueError("SCANNER_VERSION")
            addons = api("autoupdate", "view", "installedAddons")["installedAddons"]
            if not any(addon["id"] == "exim" for addon in addons):
                raise ValueError("NO_IMPORT_ADDON")
            # Inspect enabled rules; do not suppress rules or truncate findings.
            scanners = api("pscan", "view", "scanners")["scanners"]
            enabled = sum(str(rule["enabled"]).lower() == "true" for rule in scanners)
            if not enabled:
                raise ValueError("NO_PASSIVE_RULES")
            if api("core", "view", "messages", start=0, count=9)["messages"]:
                raise ValueError("PREEXISTING_MESSAGES")
            imported = api("exim", "action", "importHar", filePath=filename,
                           sendRequests="false", maxMessages=8)
            if "Result" not in imported or str(imported["Result"]).upper() != "OK":
                raise ValueError("IMPORT_REJECTED")
            deadline = time.monotonic() + 60
            stable = 0
            while stable < 3:
                if time.monotonic() > deadline:
                    raise ValueError("PASSIVE_TIMEOUT")
                remaining = int(api("pscan", "view", "recordsToScan")["recordsToScan"])
                tasks = api("pscan", "view", "currentTasks")["currentTasks"]
                messages = api("core", "view", "messages", start=0, count=100)["messages"]
                DIAGNOSTICS.update(imported=len(messages), queued=remaining, active=len(tasks))
                imported_records, placeholders = imported_messages(messages, entries)
                DIAGNOSTICS.update(imported=len(imported_records), placeholders=placeholders)
                stable = stable + 1 if remaining == 0 and not tasks and len(imported_records) == 8 else 0
                time.sleep(1)
            if Counter(message_url(message) for message in imported_records) != Counter(TARGETS):
                raise ValueError("IMPORTED_MEMBERSHIP")
            alerts = api("core", "view", "alerts", start=0, count=10001)["alerts"]
            if len(alerts) > 10000:
                raise ValueError("ALERT_LIMIT")
            return {"schema": "h2-passive-v1", "complete": True, "coreVersion": version,
                    "imported": len(imported_records), "placeholders": placeholders,
                    "queueRemaining": 0, "enabledRules": enabled,
                    "alerts": [sanitized_alert(alert) for alert in alerts]}
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def main():
    try:
        data = sys.stdin.buffer.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError("INPUT_LIMIT")
        result = scan(json.loads(data))
        print(json.dumps(result))
    except Exception as error:
        # No exception repr, stdout/stderr log dump, raw headers, bodies or API output.
        reason = str(error) if isinstance(error, ValueError) and str(error) in SAFE_ERRORS else "SCANNER_INCOMPLETE"
        print(json.dumps({"complete": False, "reason": reason, "diagnostics": DIAGNOSTICS}))
        sys.exit(3)


if __name__ == "__main__":
    main()
