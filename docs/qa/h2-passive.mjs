// Opt-in QA only. Importing this module never contacts services or starts Docker.
import http from 'node:http';
import { lookup } from 'node:dns/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const IMAGE = 'ghcr.io/zaproxy/zaproxy@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af';
export const TARGETS = Object.freeze([
  'http://localhost:5173/', 'http://localhost:5173/login',
  'http://localhost:8080/actuator/health', 'http://localhost:8080/app-test',
  'http://localhost:8080/api/v1/products?page=0&size=1',
  'http://localhost:8080/api/v1/products/stats',
  'http://localhost:8080/api/v1/auth/me', 'http://localhost:8080/qa-h2-not-found',
]);
export const BODY_LIMIT = 1024 * 1024;
const OUTPUT_LIMIT = 1024 * 1024;
const HERE = new URL('./', import.meta.url);
const SAFE_SCANNER_ERRORS = new Set(['SCANNER_STARTUP', 'SCANNER_VERSION', 'NO_IMPORT_ADDON', 'NO_PASSIVE_RULES',
  'PREEXISTING_MESSAGES', 'IMPORT_REJECTED', 'PASSIVE_TIMEOUT', 'IMPORTED_MEMBERSHIP',
  'ALERT_LIMIT', 'API_FAILURE', 'API_SIZE', 'SCANNER_INCOMPLETE']);

export function scannerFailure(output) {
  try {
    const parsed = JSON.parse(output);
    if (parsed.complete === false && SAFE_SCANNER_ERRORS.has(parsed.reason)) return parsed.reason;
  } catch { /* No child output or parsing exception is exposed. */ }
  return 'DOCKER_EXECUTION_FAILED';
}

export function assertTarget(url, method = 'GET') {
  if (method !== 'GET' || !TARGETS.includes(url)) throw new Error('SCOPE_REJECTED');
}

export function assertLoopback(addresses) {
  if (!addresses.length || addresses.some(({ address }) => address !== '::1' && address !== '127.0.0.1')) {
    throw new Error('DNS_SCOPE_REJECTED');
  }
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}

export function rejectSensitive(text) {
  // Do not inspect credential env vars. Never include matched content in errors.
  if (/\beyJ[A-Za-z0-9_-]+|\bBearer\s+[^\s",;]+|"(?:password|jwt_secret|access_token|api_key)"\s*:\s*"[^"\s]+"/i.test(text)) {
    throw new Error('SENSITIVE_MATERIAL_DETECTED');
  }
}

export function sanitizeHeaders(raw) {
  const headers = [];
  if (raw.length % 2) throw new Error('INVALID_HEADERS');
  for (let i = 0; i < raw.length; i += 2) {
    const name = raw[i];
    let value = raw[i + 1];
    if (name.toLowerCase() === 'set-cookie') {
      const segments = value.split(';');
      const cookieName = segments[0].split('=', 1)[0].trim();
      const publicName = ['ACCESS_TOKEN', 'XSRF-TOKEN', 'JSESSIONID'].includes(cookieName) ? cookieName : 'qa-cookie';
      value = `${publicName}=qa-redacted`;
      for (const attribute of segments.slice(1)) {
        const trimmed = attribute.trim();
        if (/^(?:secure|httponly)$/i.test(trimmed)
          || /^samesite=(?:strict|lax|none)$/i.test(trimmed)
          || /^max-age=-?\d{1,12}$/i.test(trimmed)
          || /^path=\/[A-Za-z0-9/_-]*$/i.test(trimmed)
          || /^domain=\.?localhost$/i.test(trimmed)
          || /^expires=[A-Za-z0-9,: -]{1,64}$/i.test(trimmed)) value += `; ${trimmed}`;
      }
    } else if (['cookie', 'authorization', 'proxy-authorization'].includes(name.toLowerCase())) {
      throw new Error('UNEXPECTED_CREDENTIAL_HEADER');
    }
    rejectSensitive(name + ': ' + value);
    headers.push({ name, value });
  }
  return headers;
}

export function captureOne(url, pinned, request = http.request) {
  assertTarget(url);
  return new Promise((resolve, reject) => {
    let finished = false;
    let req;
    const timer = setTimeout(() => fail('CAPTURE_TIMEOUT'), 5000);
    const fail = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      req?.destroy();
      reject(new Error(code));
    };
    try {
      req = request(url, {
        method: 'GET', agent: false,
        headers: { Accept: 'text/html,application/json,text/plain', 'Accept-Encoding': 'identity' },
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
      }, (response) => {
        let size = 0;
        const chunks = [];
        response.on('error', () => fail('CAPTURE_RESPONSE_ERROR'));
        response.on('aborted', () => fail('CAPTURE_RESPONSE_ABORTED'));
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > BODY_LIMIT) fail('CAPTURE_BODY_LIMIT');
          else chunks.push(chunk);
        });
        response.on('end', () => {
          if (finished) return;
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            rejectSensitive(text);
            const headers = sanitizeHeaders(response.rawHeaders);
            if (!Number.isInteger(response.statusCode) || response.statusCode < 100 || response.statusCode > 599) {
              throw new Error('INVALID_STATUS');
            }
            finished = true;
            clearTimeout(timer);
            resolve({
              startedDateTime: new Date().toISOString(), time: 0,
              request: { method: 'GET', url, httpVersion: 'HTTP/1.1', headers: [], cookies: [], queryString: [], headersSize: -1, bodySize: 0 },
              response: { status: response.statusCode, statusText: '', httpVersion: 'HTTP/1.1',
                headers, cookies: [], content: { size, mimeType: response.headers['content-type'] ?? 'text/plain', text },
                redirectURL: '', headersSize: -1, bodySize: size },
              cache: {}, timings: { send: 0, wait: 0, receive: 0 },
            });
          } catch { fail('CAPTURE_PRIVACY_OR_SCHEMA_REJECTED'); }
        });
      });
      req.on('error', () => fail('CAPTURE_REQUEST_FAILED'));
      req.end();
    } catch { fail('CAPTURE_REQUEST_FAILED'); }
  });
}

export function dockerArgs(name, driverPath) {
  return ['run', '--rm', '-i', '--name', name, '--pull=never', '--network=none',
    '--read-only', '--log-driver=none', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=256', '--memory=1536m', '--cpus=2', '--user=1000:1000',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=805306368,mode=1777',
    '--env', 'JAVA_TOOL_OPTIONS=-Djava.awt.headless=true -XX:-UsePerfData',
    '--mount', `type=bind,source=${driverPath},target=/qa/driver.py,readonly`,
    '--entrypoint=python3', IMAGE, '-B', '/qa/driver.py'];
}

function childEnv() {
  // Local Unix daemon only, no inherited credentials, proxies or Docker context.
  return { PATH: '/usr/bin:/bin', DOCKER_HOST: 'unix:///var/run/docker.sock' };
}

export function privateDocker(args, input = '', timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let size = 0;
    const chunks = [];
    let failed = false;
    const fail = () => { failed = true; child.kill('SIGKILL'); };
    const timer = setTimeout(fail, timeout);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > OUTPUT_LIMIT) fail();
      else chunks.push(chunk);
    });
    // Never dump scanner/daemon stderr, even on failure.
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('DOCKER_EXECUTION_FAILED')); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed || code !== 0) {
        const output = Buffer.concat(chunks).toString('utf8');
        const error = new Error(scannerFailure(output));
        try {
          const parsed = JSON.parse(output);
          error.diagnostics = Object.fromEntries(['imported', 'queued', 'active', 'placeholders']
            .filter((key) => Number.isSafeInteger(parsed.diagnostics?.[key]) && parsed.diagnostics[key] >= 0)
            .map((key) => [key, parsed.diagnostics[key]]));
        } catch { /* Withhold non-JSON output entirely. */ }
        reject(error);
      }
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(input);
  });
}

export function validateSummary(summary) {
  if (summary?.schema !== 'h2-passive-v1' || summary.complete !== true
    || summary.imported !== 8 || summary.queueRemaining !== 0 || summary.coreVersion !== '2.17.0'
    || !Array.isArray(summary.alerts) || summary.alerts.length > 10000
    || !Number.isInteger(summary.enabledRules) || summary.enabledRules < 1
    || !Number.isInteger(summary.placeholders) || summary.placeholders < 0 || summary.placeholders > 32) throw new Error('INVALID_SCAN_SUMMARY');
  const alerts = summary.alerts.map((alert) => {
    assertTarget(alert.url);
    if (!/^\d{1,8}$/.test(alert.pluginId) || !Number.isInteger(alert.risk) || alert.risk < 0 || alert.risk > 3
      || !Number.isInteger(alert.confidence) || alert.confidence < 0 || alert.confidence > 4
      || typeof alert.name !== 'string' || alert.name.length > 160 || /[\x00-\x1f\x7f-\x9f]/.test(alert.name)) throw new Error('INVALID_SCAN_ALERT');
    rejectSensitive(alert.name);
    return { pluginId: alert.pluginId, name: alert.name, risk: alert.risk, confidence: alert.confidence, url: alert.url };
  });
  return { schema: 'h2-passive-v1', complete: true, imported: 8, queueRemaining: 0,
    coreVersion: summary.coreVersion, enabledRules: summary.enabledRules, placeholders: summary.placeholders, alerts };
}

async function main() {
  const name = `qa-h2-${randomUUID()}`;
  let containerAttempted = false;
  let shuttingDown = false;
  const cleanup = async () => {
    if (containerAttempted) {
      // Only the exact randomly named container owned by this run can be removed.
      await privateDocker(['rm', '-f', name], '', 5000).catch(() => {});
    }
  };
  const abort = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await cleanup();
    console.log(JSON.stringify({ complete: false, reason: 'OVERALL_DEADLINE_OR_TERMINATION' }));
    process.exit(3);
  };
  const timer = setTimeout(abort, 240000);
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const pinned = assertLoopback(await lookup('localhost', { all: true }));
    const entries = [];
    for (const target of TARGETS) entries.push(await captureOne(target, pinned));
    const har = JSON.stringify({ log: { version: '1.2', creator: { name: 'qa-h2-fixed-capture', version: '1' }, entries } });
    if (Buffer.byteLength(har) > 16 * BODY_LIMIT) throw new Error('AGGREGATE_CAPTURE_LIMIT');
    const driverPath = fileURLToPath(new URL('h2-zap-driver.py', HERE));
    // Fail before container creation if the approved helper is unavailable.
    await readFile(driverPath);
    containerAttempted = true;
    const raw = await privateDocker(dockerArgs(name, driverPath), har);
    const summary = validateSummary(JSON.parse(raw));
    const counts = { informational: 0, low: 0, medium: 0, high: 0 };
    const levels = ['informational', 'low', 'medium', 'high'];
    for (const alert of summary.alerts) counts[levels[alert.risk]] += 1;
    const result = { ...summary, counts,
      captures: entries.map((entry) => ({ url: entry.request.url, status: entry.response.status })),
      scope: 'anonymous fixed-GET import-only; no crawl, authenticated bodies, SPA execution or TLS coverage' };
    const filename = `h2-passive-result-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(new URL(filename, HERE), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ complete: true, imported: 8, coreVersion: summary.coreVersion,
      enabledRules: summary.enabledRules, counts, report: filename, captures: result.captures }));
    // Findings are not automatically accepted, including informational findings.
    process.exitCode = summary.alerts.length ? 2 : 0;
  } catch (error) {
    const safeCodes = new Set([...SAFE_SCANNER_ERRORS, 'DNS_SCOPE_REJECTED', 'CAPTURE_TIMEOUT', 'CAPTURE_BODY_LIMIT',
      'CAPTURE_RESPONSE_ERROR', 'CAPTURE_RESPONSE_ABORTED', 'CAPTURE_PRIVACY_OR_SCHEMA_REJECTED',
      'CAPTURE_REQUEST_FAILED', 'AGGREGATE_CAPTURE_LIMIT', 'DOCKER_EXECUTION_FAILED',
      'INVALID_SCAN_SUMMARY', 'INVALID_SCAN_ALERT', 'SCOPE_REJECTED', 'SENSITIVE_MATERIAL_DETECTED']);
    console.log(JSON.stringify({ complete: false, reason: safeCodes.has(error?.message) ? error.message : 'ASSESSMENT_FAILED' }));
    process.exitCode = 3;
  } finally {
    await cleanup();
    clearTimeout(timer);
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
