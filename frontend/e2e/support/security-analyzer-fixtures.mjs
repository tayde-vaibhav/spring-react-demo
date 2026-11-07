// Inert source text for ESLint.lintText only. Never execute or import these snippets.
export const securityAnalyzerFixtures = Object.freeze([
  Object.freeze({
    name: 'nested-quantifier regex',
    ruleId: 'security/detect-unsafe-regex',
    unsafe: 'export const pattern = /(a+)+$/',
    safe: 'export const pattern = /^[a-z]+$/',
  }),
  Object.freeze({
    name: 'dynamic property write',
    ruleId: 'security/detect-object-injection',
    unsafe: 'export function write(target, key, value) { target[key] = value }',
    safe: 'export function write(target, value) { target.name = value }',
  }),
  Object.freeze({
    name: 'unescaped dynamic RegExp',
    ruleId: 'security/detect-non-literal-regexp',
    unsafe: 'export function compile(pattern) { return new RegExp(pattern) }',
    safe: 'export function compile() { return new RegExp("^[a-z]+$") }',
  }),
  Object.freeze({
    name: 'node:fs untrusted read',
    ruleId: 'security/detect-non-literal-fs-filename',
    unsafe: 'import fs from "node:fs"\nexport function read(untrustedPath) { return fs.readFileSync(untrustedPath, "utf8") }',
    safe: 'import fs from "node:fs"\nexport function read() { return fs.readFileSync("qa-synthetic-fixture.txt", "utf8") }',
  }),
])
