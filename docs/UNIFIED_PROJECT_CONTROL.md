# Unified Project Control Center

StagePilot now keeps the complete project workflow on `/projects/:id`. The former
`/planning` and `/chat` routes redirect to the matching in-page tab so old links
remain valid.

## Included controls

- Project-specific ChatGPT account, regular chat, ChatGPT Project link, new chat,
  and browser-driven ChatGPT Project creation.
- Site GitHub defaults with an optional per-project owner, username, fine-grained
  token, visibility, and repository name. Secret values remain in protected files
  and credential records and are never returned to the browser.
- AJAX tabs for connections, chat and execution tree, proposal, automation status,
  and the project event log.
- Native drag-and-drop Stage/Work ordering plus manual insert, edit, and delete.
  Nodes that have started or have execution attempts cannot be deleted.
- Per-node inspector tabs for prompts, AI responses, commands, run output, tests,
  errors, and Git commit evidence.
- Sandboxed proposal HTML preview and editable HTML source.
- Project-list controls for view, safe pause, edit, delete, completed/total Works,
  and progress percentage.

## Deployment

`ops/unified-project-install.sh` performs a database backup, dependency install,
production build, Worker contract tests, migration 015, service restart, health
checks, migration verification, and heartbeat verification. It writes only to
`/root/runlog.txt` by default and does not print to the terminal.
