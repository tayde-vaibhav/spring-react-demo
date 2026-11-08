/** Explicit JSON-only offline adapter input; no discovery or analyzer execution. */
export interface NativeFrontendSpan {
  /** One-based UTF-16 coordinates; exclusive endpoint. */
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export interface NativeFrontendSource {
  /** Exact relative inventory identity, without dot segments. */
  file: string;
  sha256: string;
  parser: 'espree' | 'typescript-eslint';
  sourceType: 'module' | 'script';
  jsx: boolean;
  /** Exact native filePath (including absolute paths), defaults to file.
   * No normalization or filesystem resolution is performed. */
  reportPath?: string;
}
export interface NativeFrontendWarning {
  file: string;
  ruleId: string;
  /** Exactly one active severity-1 diagnostic must match each entry. */
  span: NativeFrontendSpan;
  snippetSha256: string;
  anchor: {
    /** Smallest enclosing parsed Statement/Declaration node, including blocks. */
    nodeType: string;
    span: NativeFrontendSpan;
    sha256: string;
  };
}
export interface NativeFrontendFix { range: [number, number]; text: string }
export interface NativeFrontendMessage {
  ruleId: string | null;
  severity: 0 | 1 | 2;
  message: string;
  messageId?: string | null;
  nodeType?: string | null;
  fatal?: boolean;
  line?: number | null;
  column?: number | null;
  endLine?: number | null;
  endColumn?: number | null;
  fix?: NativeFrontendFix;
  suggestions?: {
    desc: string;
    fix: NativeFrontendFix;
    messageId?: string;
    data?: Record<string, string | number>;
  }[];
}
export interface NativeFrontendSuppressedMessage extends NativeFrontendMessage {
  suppressions: { kind: string; justification: string }[];
}
export interface NativeFrontendResult {
  filePath: string;
  messages: NativeFrontendMessage[];
  suppressedMessages: NativeFrontendSuppressedMessage[];
  errorCount: number;
  warningCount: number;
  fatalErrorCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  source?: string;
  /** Autofixed output is retained but always blocks this audit. */
  output?: string;
  usedDeprecatedRules?: { ruleId: string; replacedBy: string[]; info?: Record<string, unknown> }[];
}
export interface NativeFrontendInput {
  expected: {
    toolId: string;
    version: string;
    parserVersions: { espree: string; 'typescript-eslint': string };
    /** Complete expected source inventory, including clean files. */
    sources: NativeFrontendSource[];
    /** Complete caller-discovered relevant config/lock/control inventory. */
    controls: { file: string; sha256: string }[];
    warnings: NativeFrontendWarning[];
  };
  sources: { file: string; content: string }[];
  controls: { file: string; content: string }[];
  version: string;
  /** Strict ESLint CLI contract: --max-warnings 0, default fatal-error behavior. */
  exitCode: number | null;
  results: NativeFrontendResult[];
}
export interface NativeFrontendAudit {
  /** Supplied consistency only; never acceptance, approval or provenance. */
  adapterConsistent: boolean;
  exclusionsActive: false;
  blockers: string[];
  /** Complete lossless detached native diagnostics, including blocked messages. */
  diagnostics: {
    file: string;
    suppressed: boolean;
    native: NativeFrontendMessage | NativeFrontendSuppressedMessage;
    span: NativeFrontendSpan | null;
  }[];
  rawResults: NativeFrontendResult[];
  /** Active native match count per expected warning. */
  matches: number[];
  /** Guard-compatible projection: never consume this without blockers and raw
   * diagnostics. Unrepresentable messages explicitly make it unhealthy. */
  report: {
    toolId: string;
    version: string;
    reportPresent: boolean;
    complete: boolean;
    unfiltered: boolean;
    healthy: boolean;
    exitCode: number | null;
    analysisErrors: string[];
    missingClasses: string[];
    findings: {
      kind: 'frontend'; file: string; ruleId: string;
      severity: 'warning' | 'error'; span: NativeFrontendSpan;
    }[];
  };
}
/** Throws TypeError('FRONTEND_NATIVE_INVALID_SCHEMA') for malformed schema or
 * non-JSON data, including getters/proxies. No I/O, runner, or gate activation.
 * Caller obligations: provenance and complete source/control discovery. */
export function normalizeFrontendNativeReport(input: unknown): NativeFrontendAudit;
export function frontendNativeVersions(): {
  eslint: string; espree: string; 'typescript-eslint': string;
};
/** UTF-16 text units include every string value and property key. All budgets
 * cover the entire input; TypeError('FRONTEND_NATIVE_INPUT_LIMIT') on overflow. */
export const FRONTEND_NATIVE_LIMITS: Readonly<{
  maxDepth: 64; maxNodes: 100000; maxTextUnits: number;
}>;
