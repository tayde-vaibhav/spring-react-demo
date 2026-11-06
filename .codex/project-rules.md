# Project Rules for Codex

These repository-specific rules supplement the root `AGENTS.md`. Keep
instructions here concise and follow the user's task-specific instructions
when they are more specific.

## General workflow and Git safety

- Inspect the project structure and `git status --short` before editing. Check
  status again before finishing.
- For broad or cross-cutting work, state the plan and likely files first.
- Prefer small, focused, reversible changes. Preserve unrelated user changes;
  never reset, discard, stash, or overwrite them without explicit approval.
- Review the relevant diffs. Do not stage, commit, push, deploy, rebase, amend,
  or change Git remotes unless explicitly requested.
- Never expose, print, commit, or transmit secrets, tokens, or credentials.
  Never commit `.env` files, local credentials, or generated build output.
- Do not run destructive commands, install system packages, or use `sudo`
  without explicit approval.
- Run relevant tests, builds, and linters; report exactly what ran, what did
  not run, results, changed files, assumptions, and known risks.
- Ask a focused question if an ambiguity could materially change the scope or
  result.
- For approved behavior changes that warrant documentation, get approval for
  documentation work unless it was already part of the approved scope.

## Java and Spring Boot

- Follow the repository's Java version, build tool, and package structure.
- Keep responsibilities layered: Controller -> Service -> Repository.
- Prefer constructor injection; validate request input and use suitable HTTP
  status codes.
- Use DTOs at API boundaries rather than exposing persistence entities.
- Keep secrets out of source and committed configuration.
- Add or update tests for behavior changes and run the relevant project tests.
- Add dependencies only when needed, and explain their purpose.
- Preserve existing API contracts unless the task explicitly changes them.

## React

- Follow the existing frontend conventions; use focused functional components
  and hooks.
- Handle relevant loading, empty, success, and error states.
- Keep credentials out of source; follow the documented environment-variable
  pattern. Do not persist authentication tokens in `localStorage` or
  `sessionStorage`.
- Use accessible semantic markup, labels, keyboard behavior, and alternative
  text where applicable.
- Run the relevant lint and build commands after meaningful changes.
