# Gated Repository QA Protocol

Use this protocol when executing the repository's user-defined QA checklist.
It supplements `AGENTS.md` and `.codex/project-rules.md`; task-specific user
instructions take precedence.

## Approval and sequencing

- Before starting a checklist, present its full item list with each item's
  purpose and side effects, then stop for approval.
- Run items strictly one at a time and in order. Before each, briefly describe
  the command/action and side effects, ask `Run <ID>? (yes / skip / stop)`, and
  wait for the user's answer.
- After an item, report its ID, title, status (`PASSED`, `FAILED`, `BLOCKED`,
  or `SKIPPED`), what ran, and concise evidence. For failures or blocks,
  include likely cause and a proposed fix without applying it.
- Append the same item summary to `docs/qa/test-report.md` when authorized by
  the checklist. Do not include secrets, tokens, or cookie values.
- Ask before installing packages or browsers, pulling images, starting,
  stopping, or resetting services, waiting out a rate-limit window, or doing
  work expected to take more than five minutes.
- If a needed application is not running, propose how to start it and wait for
  approval. Never stop a service the user started without explicit approval.
- Do not batch items unless the user explicitly approves a range.

## Scope and data safety

- Send test traffic only to this project's localhost services and ports named
  in the approved checklist. Do not contact other hosts.
- Access credentials only through environment variables explicitly permitted
  by the user. Never inspect `.env` files or print credentials.
- Never put passwords, tokens, cookie values, or sensitive request bodies in
  commands, logs, reports, screenshots, traces, videos, or test artifacts.
- Any test that creates, edits, or deletes application data must use
  `qa-`-prefixed records (or a separately approved E2E database), clean up its
  records, and verify the original data count is restored.
- Keep browser/test artifacts out of Git and ensure they cannot capture
  credentials.
- Do not change production code, commit, or push as part of verification unless
  the user separately approves that work.

## Reporting

- Report evidence without exposing matching log lines or secret values.
- Be explicit about skipped, blocked, and unrun checks; do not imply they
  passed.
- After the final checklist item, provide status counts, prioritized proposed
  fixes, and ask which fixes the user wants implemented.
