import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { assertTarget, assertLoopback, sanitizeHeaders, rejectSensitive,
  captureOne, dockerArgs, validateSummary, scannerFailure, TARGETS, BODY_LIMIT, IMAGE } from './h2-passive.mjs';

for (const url of TARGETS) test(`fixed GET allowed: ${url}`, () => assertTarget(url));
for (const url of ['http://evil.example/', 'http://127.0.0.1:5173/',
  'http://localhost:9090/', 'http://localhost:8080/api/v1/auth/csrf',
  'http://localhost:8080/api/v1/products?page=0&size=2',
  'http://localhost:5173/login#extra', 'http://localhost:5173/login?extra=1']) {
  test(`other target rejected: ${url}`, () => assert.throws(() => assertTarget(url), /SCOPE_REJECTED/));
}
for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
  test(`${method} rejected`, () => assert.throws(() => assertTarget(TARGETS[0], method), /SCOPE/));
}
test('loopback addresses pinned; non-loopback and empty answers rejected', () => {
  assert.equal(assertLoopback([{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }]).family, 4);
  assert.throws(() => assertLoopback([]));
  assert.throws(() => assertLoopback([{ address: '203.0.113.1', family: 4 }]));
});
test('cookie values removed while public attributes remain', () => {
  const result = sanitizeHeaders(['Set-Cookie', 'ACCESS_TOKEN=synthetic-cookie; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900']);
  assert.equal(result[0].value, 'ACCESS_TOKEN=qa-redacted; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900');
  assert(!JSON.stringify(result).includes('synthetic-cookie'));
});
test('unknown cookie names and unapproved attributes do not escape', () => {
  assert.deepEqual(sanitizeHeaders(['Set-Cookie', 'synthetic-name=synthetic-cookie; secret=synthetic-other']),
    [{ name: 'Set-Cookie', value: 'qa-cookie=qa-redacted' }]);
});
test('credential header, JWT-looking body and named credential body rejected without echo', () => {
  assert.throws(() => sanitizeHeaders(['Authorization', 'synthetic']), /^Error: UNEXPECTED_CREDENTIAL_HEADER$/);
  assert.throws(() => rejectSensitive('eyJSYNTHETIC'), /^Error: SENSITIVE_MATERIAL_DETECTED$/);
  assert.throws(() => rejectSensitive('{"password":"synthetic"}'), /^Error: SENSITIVE_MATERIAL_DETECTED$/);
});

function fakeRequest({ body = 'hello', status = 200, error = false, wait = false, headers = [] } = {}) {
  const calls = [];
  const request = (url, options, callback) => {
    calls.push({ url, options });
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = () => {
      if (wait) return;
      if (error) { queueMicrotask(() => req.emit('error', new Error('SYNTHETIC_PRIVATE_DETAIL'))); return; }
      const response = Readable.from([Buffer.from(body)]);
      response.rawHeaders = headers;
      response.headers = {};
      response.statusCode = status;
      callback(response);
    };
    return req;
  };
  return { request, calls };
}
const pinned = { address: '127.0.0.1', family: 4 };
test('capture is one anonymous GET with no redirects or cookies', async () => {
  const fake = fakeRequest({ status: 302, headers: ['Location', 'https://evil.example/'] });
  const entry = await captureOne(TARGETS[0], pinned, fake.request);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].options.method, 'GET');
  assert(!('Cookie' in fake.calls[0].options.headers));
  assert(!('Authorization' in fake.calls[0].options.headers));
  assert.equal(entry.response.status, 302);
  assert.equal(entry.response.redirectURL, '');
});
test('exact body cap accepted', async () => {
  const fake = fakeRequest({ body: 'a'.repeat(BODY_LIMIT) });
  assert.equal((await captureOne(TARGETS[0], pinned, fake.request)).response.bodySize, BODY_LIMIT);
});
test('oversized body rejected, never returned', async () => {
  const fake = fakeRequest({ body: 'a'.repeat(BODY_LIMIT + 1) });
  await assert.rejects(captureOne(TARGETS[0], pinned, fake.request), /^Error: CAPTURE_BODY_LIMIT$/);
});
test('request errors withhold original error detail', async () => {
  await assert.rejects(captureOne(TARGETS[0], pinned, fakeRequest({ error: true }).request), /^Error: CAPTURE_REQUEST_FAILED$/);
});
test('privacy failures withhold body', async () => {
  await assert.rejects(captureOne(TARGETS[0], pinned, fakeRequest({ body: 'eyJSYNTHETIC' }).request), /^Error: CAPTURE_PRIVACY_OR_SCHEMA_REJECTED$/);
});
test('request times out without retries', async () => {
  const fake = fakeRequest({ wait: true });
  await assert.rejects(captureOne(TARGETS[0], pinned, fake.request), /^Error: CAPTURE_TIMEOUT$/);
  assert.equal(fake.calls.length, 1);
});
test('container command pins isolation, no extra mounts or environment secrets', () => {
  const args = dockerArgs('qa-h2-synthetic', '/synthetic/driver.py');
  for (const control of ['--rm', '--pull=never', '--network=none', '--read-only', '--log-driver=none', '--cap-drop=ALL', IMAGE]) assert(args.includes(control));
  assert.equal(args.filter((value) => value === '--mount').length, 1);
  assert.equal(args.filter((value) => value === '--env').length, 1);
  assert(!args.includes('--network=host'));
  assert(!args.includes('-p'));
  assert(args.includes('type=bind,source=/synthetic/driver.py,target=/qa/driver.py,readonly'));
});
function validSummary() {
  return { schema: 'h2-passive-v1', complete: true, imported: 8, queueRemaining: 0, coreVersion: '2.17.0', enabledRules: 10, placeholders: 0,
    alerts: [{ pluginId: '10001', name: 'Synthetic finding', risk: 1, confidence: 2, url: TARGETS[0], evidence: 'SYNTHETIC_PRIVATE_DETAIL' }] };
}
test('report drops evidence/unknown fields, preserving finding count and identity', () => {
  const result = validateSummary(validSummary());
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].pluginId, '10001');
  assert(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_DETAIL'));
});
for (const change of [{ complete: false }, { imported: 0 }, { queueRemaining: 1 }, { enabledRules: 0 }, { coreVersion: 'other' }]) {
  test(`incomplete result rejected: ${JSON.stringify(change)}`, () => {
    assert.throws(() => validateSummary({ ...validSummary(), ...change }));
  });
}
test('out-of-scope alert and unsafe rule name rejected', () => {
  for (const change of [{ url: 'http://evil.example/' }, { name: 'bad\r\nname' }, { name: 'eyJSYNTHETIC' }, { risk: 9 }]) {
    const input = validSummary();
    Object.assign(input.alerts[0], change);
    assert.throws(() => validateSummary(input));
  }
});
test('child failure output is never echoed; only fixed error codes survive', () => {
  assert.equal(scannerFailure('SYNTHETIC_PRIVATE_DETAIL'), 'DOCKER_EXECUTION_FAILED');
  assert.equal(scannerFailure('{"complete":false,"reason":"SYNTHETIC_PRIVATE_DETAIL"}'), 'DOCKER_EXECUTION_FAILED');
  assert.equal(scannerFailure('{"complete":false,"reason":"PASSIVE_TIMEOUT","body":"SYNTHETIC_PRIVATE_DETAIL"}'), 'PASSIVE_TIMEOUT');
});
