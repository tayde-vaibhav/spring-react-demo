import assert from 'node:assert/strict';
import test from 'node:test';
import { checkXml } from './check-report.mjs';

const prefix = 'org.example.qa.fixtures.JavaAnalyzerFixtures$';
const cases = [
  ['EI_EXPOSE_REP2', 'AliasedList', '&lt;init&gt;', '<Field classname="' + prefix + 'AliasedList" name="values"/>'],
  ['PREDICTABLE_RANDOM', 'PredictableCode', 'securityCode'],
  ['CT_CONSTRUCTOR_THROW', 'ThrowingConstructor', '&lt;init&gt;'],
  ['SPRING_ENDPOINT', 'Endpoint', 'endpoint'],
  ['SERVLET_HEADER', 'RequestReads', 'header'],
  ['SERVLET_PARAMETER', 'RequestReads', 'parameter'],
  ['COOKIE_USAGE', 'RequestReads', 'cookieValue'],
  ['THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION', 'BroadThrows', 'broad'],
];
const controls = ['CopiedList', 'SecureCode', 'FinalThrowingConstructor', 'LiteralValues', 'NarrowThrows'];
const bug = ([type, owner, method, field = '']) => `<BugInstance type="${type}"><Class classname="${prefix}${owner}"/><Method classname="${prefix}${owner}" name="${method}"/>${field}</BugInstance>`;
function report(entries = cases, errors = '<Errors errors="0" missingClasses="0"/>') {
  return `<BugCollection>${entries.map(bug).join('')}${errors}<FindBugsSummary total_bugs="${entries.length}" total_classes="12">${controls.map(owner => `<ClassStats class="${prefix}${owner}"/>`).join('')}</FindBugsSummary></BugCollection>`;
}

test('complete native report passes and every extra finding remains counted', () => {
  const result = checkXml(report([...cases, ['EXTRA_FINDING', 'Endpoint', 'endpoint']]));
  assert.equal(result.status, 0);
  assert.match(result.output, /EXTRA_FINDING=1/);
  assert.match(result.output, /findings=9 missing=0 controls=0/);
});

test('missing required member and missing analyzed control both fail', () => {
  assert.equal(checkXml(report(cases.slice(1))).status, 1);
  assert.equal(checkXml(report().replace('name="endpoint"', 'name="different"')).status, 1);
  assert.equal(checkXml(report().replace(`<ClassStats class="${prefix}SecureCode"/>`, '')).status, 1);
});

test('a detector finding on a control fails', () => {
  const result = checkXml(report([...cases, ['PREDICTABLE_RANDOM', 'SecureCode', 'securityCode']]));
  assert.equal(result.status, 1);
  assert.match(result.output, /controls=1/);
});

test('analysis errors, missing classes and inconsistent summaries fail closed', () => {
  for (const errors of [
    '<Errors errors="1" missingClasses="0"/>',
    '<Errors errors="0" missingClasses="1"/>',
    '<Errors errors="0" missingClasses="0"><Error/></Errors>',
    '<Errors errors="0" missingClasses="0"><MissingClass/></Errors>',
  ]) assert.equal(checkXml(report(cases, errors)).status, 1);
  assert.equal(checkXml(report().replace('total_bugs="8"', 'total_bugs="0"')).status, 1);
});

test('DTDs, entities, external content and malformed XML are rejected without echoing input', () => {
  for (const xml of [
    '<!DOCTYPE BugCollection>' + report(),
    '<!DOCTYPE BugCollection [<!ENTITY marker "private-marker">]>' + report(),
    '<!DOCTYPE BugCollection SYSTEM "file:///nonexistent-fixture-marker">' + report(),
    report().replace('</BugCollection>', '&undefined;</BugCollection>'),
    report() + '<broken>',
    '<BugCollection>',
  ]) {
    const result = checkXml(xml);
    assert.equal(result.status, 1);
    assert.equal(result.output, 'reportRejected=1\n');
  }
});
