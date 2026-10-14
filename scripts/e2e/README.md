# Client request browser check

Run `pnpm --filter @workspace/scripts run test:e2e` while the API server and both
web apps are running. The default target is the local Replit preview proxy at
`http://localhost:80`; `E2E_BASE_URL` can point to another local or `.replit.dev`
development URL. Production hosts and `NODE_ENV=production` are rejected.

The public test submits a uniquely tagged request through the client form,
checks that the server reference is shown, verifies that missing consent and an
invalid email are rejected, and confirms that the operator endpoint refuses an
anonymous session. Its temporary database row is deleted in teardown, including
after the authenticated inbox test is skipped.

The inbox test uses a real Clerk browser session; it does not disable or mock
authentication. After enabling development Clerk, sign in as an operator in a
browser and save that browser's authenticated storage state outside version
control, for example at `scripts/.auth/operator.json`. Then set
`E2E_OPERATOR_STORAGE_STATE=scripts/.auth/operator.json` before running the
suite. The test will find the submitted request in the inbox, update its status
and internal note, reload the page, and verify both values persisted.

Keep the storage-state file private. It contains an active sign-in session and
must not be committed or copied to production.
