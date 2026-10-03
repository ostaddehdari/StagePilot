# StagePilot Core Automation Release

This release completes the missing runtime path between project creation, ChatGPT planning, approved Stage/Work execution, verification and GitHub delivery.

## User flow

1. The user creates a project from a simple idea.
2. StagePilot selects the most recently ready ChatGPT account, creates a pending conversation and queues the first planning request.
3. The persistent Worker opens ChatGPT with the stored browser profile, sends the correlated prompt once, waits for a stable response and stores both the raw response and validated plan.
4. The user can add comments and request another planning round as often as needed.
5. On final approval, the user confirms the GitHub repository name. StagePilot materializes all Stages and Works and queues automatic execution.
6. The Worker creates or binds the GitHub repository, initializes a local managed workspace and pushes the approved plan.
7. For each dependency-ready Work, the Worker sends a Git-backed prompt to ChatGPT, validates the JSON response, runs scripts under a constrained policy, captures logs, runs project tests, commits and pushes only after tests pass.
8. A failed Work is returned for another AI attempt, up to the configured attempt limit. A blocked or terminal failure is visible in the project console and can be resumed explicitly.
9. Long conversations roll over automatically; the next prompt reconstructs current state from the Git workspace and database ledger.

## Safety properties

- No `unsafe-eval` CSP relaxation is introduced.
- The invalid HTML `pattern` that blocked project submission was removed; the API remains authoritative for slug validation.
- Browser send operations use a persisted draft/click/confirmation state machine and never blindly retry an uncertain click.
- Generated scripts are syntax checked, limited to shell files, run with a reduced environment and blocked for known destructive/system-level operations.
- Tests must pass before Git commit and push.
- Every prompt, response, run, log, test result/evidence and commit reference is stored in the database.
- GitHub tokens remain file-backed secrets and are supplied to Git using `GIT_ASKPASS`, never embedded in remote URLs.
- No force-push, automatic hard reset, automatic clean, automatic merge or automatic stash is used.

## Deployment

Run `ops/core-automation-install.sh` as root after merging the release commit. The installer backs up the database and environment metadata, builds all workspaces, runs the full existing self-test suite and the new automation self-test, applies migrations 012 and 013, restarts all services, verifies HTTP health and requires a live Worker heartbeat.

The browser profile must already be authenticated through the ChatGPT Accounts screen. A fine-grained GitHub PAT with repository creation/content permissions must be configured in Settings.
