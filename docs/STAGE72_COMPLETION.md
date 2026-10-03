# StagePilot completion package through S07/W02

This package closes the implementation gaps found in Stages 1–5, keeps the
verified Stage 6 GitHub lifecycle intact, and retains the accepted S07/W01 and
S07/W02 script-package safety flow.

## Delivered capability

- Professional responsive RTL dashboard with collapsible sidebar and complete
  navigation for projects, accounts, prompts, logs, Git, reports and settings.
- Hidden create forms opened by a clear “new” button.
- Project and ChatGPT account tables with view, edit and recoverable delete
  actions.
- Per-project ChatGPT registry for an existing ChatGPT Project/chat URL or a
  pending new conversation.
- Per-project repository name, chat mode and project status settings.
- Site GitHub owner, username, Fine-grained PAT, optional password field,
  default repository and visibility settings. Secret values are written to
  mode `0600` files outside Git and are never returned by the API.
- Chat-style idea discovery with repeated user comments and AI evaluation
  requests.
- Versioned `project_plan` JSON contract separated from executable
  `script_batch` responses.
- Plan validation for identifiers, acceptance criteria, dependency existence
  and dependency cycles.
- Plan revision history, JSON export, explicit final approval and atomic
  materialization into Stage/Work records.
- Soft deletion preserving audit history and evidence.
- Login origin validation and a five-attempt/15-minute login throttle.
- Global browser capacity guard in addition to the existing per-profile lock.
- Additive migration `012_stage72_completion.sql`.
- Deployment, backup, acceptance logging and safe fast-forward update script.

## Completion semantics

Code completeness and local deterministic tests may reach 100% before a server
deployment. A Work is only reported as live-accepted after the deployment
script passes all of these gates:

1. clean server working tree;
2. fast-forward-only Git update;
3. database backup;
4. clean dependency install and production build;
5. manager, GitHub, runner and quarantine self-tests;
6. migration application;
7. API, web and worker service restart;
8. API and web health checks;
9. durable acceptance event recorded in PostgreSQL.

The script prints `STAGEPILOT_STAGE72_COMPLETION=PASS` only after every gate
passes. It does not force-push, reset, clean, overwrite local changes or hide a
failed service.

## Server command

After the completion branch is merged to `main`:

```bash
cd /opt/stagepilot
chmod 700 ops/stage72-completion.sh
sudo STAGEPILOT_TARGET_REF=main ./ops/stage72-completion.sh
```

To test the completion branch before merge, set
`STAGEPILOT_TARGET_REF=codex/stage-7-2-completion` while the server is already
on a local branch that can fast-forward to it.

If service names or health ports differ, set the corresponding variables shown
at the top of `ops/stage72-completion.sh`; the script does not guess or replace
the existing Nginx virtual host.

For an offline Git Bundle handoff, first fast-forward the bundle commit into
the server repository, then run the acceptance script with
`STAGEPILOT_SKIP_GIT_FETCH=1`. This mode still requires a clean working tree,
builds and tests the exact checked-out commit, applies the migration and records
the durable acceptance event.
