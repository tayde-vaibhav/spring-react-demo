/** UTF-16 columns are one-based; end coordinates are exclusive. */
export interface ReviewSpan {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export interface ReviewAnchor extends ReviewSpan { sha256: string }
export interface JavaReviewScope {
  pattern: string;
  className: string;
  member: string;
  /** Exact erased Java type names, including array suffixes, without generics. */
  signature: { parameters: string[]; returns: string };
  /** null matches only a diagnostic with no primary field, never any field. */
  field: string | null;
}
interface ReviewEntryBase {
  id: string;
  toolId: string;
  file: string;
  expectedCount: number;
  classification: 'false-positive' | 'design-choice';
  rationale: string;
  evidence: string[];
  /** Explicit reviewed member/statement text; no AST extraction is performed. */
  anchor: ReviewAnchor;
}
export interface JavaReviewEntry extends ReviewEntryBase, JavaReviewScope {
  kind: 'java';
  locations: { startLine: number; endLine: number; count: number }[];
}
export interface FrontendReviewEntry extends ReviewEntryBase {
  kind: 'frontend';
  ruleId: string;
  span: ReviewSpan;
  snippetSha256: string;
}
export type ReviewEntry = JavaReviewEntry | FrontendReviewEntry;
interface FindingBase { file: string; severity: 'warning' | 'error' }
export interface JavaReviewFinding extends FindingBase, JavaReviewScope {
  kind: 'java';
  startLine: number;
  endLine: number;
}
export interface FrontendReviewFinding extends FindingBase {
  kind: 'frontend';
  ruleId: string;
  span: ReviewSpan;
}
export interface ReviewRawReport {
  toolId: string;
  version: string;
  reportPresent: boolean;
  complete: boolean;
  unfiltered: boolean;
  healthy: boolean;
  /** Raw status retained verbatim; only healthy exits 0/1 are reconcilable. */
  exitCode: number | null;
  analysisErrors: string[];
  missingClasses: string[];
  findings: (JavaReviewFinding | FrontendReviewFinding)[];
}
export interface ReviewCandidate {
  schemaVersion: 1;
  /** Full supplied inventories, including files with no candidate diagnostics. */
  sources: Map<string, string>;
  controls: Map<string, string>;
  tools: Map<string, { kind: 'java' | 'frontend'; version: string }>;
  entries: ReviewEntry[];
}
export interface ReviewGuardInput {
  candidate: ReviewCandidate;
  /** Exact UTF-8 text, with no normalization or filesystem access. */
  sources: Map<string, string>;
  controls: Map<string, string>;
  reports: ReviewRawReport[];
}
export interface ReviewCandidateResult {
  /** Consistency of supplied data only; never approval or an acceptance gate. */
  candidateReconciled: boolean;
  exclusionsActive: false;
  issues: string[];
  matches: Map<string, number>;
  rawExitCodes: Map<string, number | null>;
  /** Detached, complete copies; matched findings are never removed. */
  rawReports: ReviewRawReport[];
}
export function hashReviewText(value: string): string;
/** Throws TypeError('REVIEW_GUARD_INVALID_SCHEMA') for malformed input.
 * Caller obligations: report provenance, full input/report inventories and valid
 * evidence. No native XML/evidence adapter or acceptance gate is provided.
 */
export function reconcileReviewCandidate(input: unknown): ReviewCandidateResult;
