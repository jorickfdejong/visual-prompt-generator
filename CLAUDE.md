# Working together

Three people work on this project, each with their own clone and their own Claude.
They are not developers: explain Git steps in plain language and do the Git work for them when asked.
There are no fixed roles; anyone can work on anything.

## Starting work
- Never commit to `main`. Before editing, fetch, check `git status`, and make a new branch from the latest `origin/main`, named after the feature (e.g. `add-lamp-prop`).
- If there are already uncommitted changes, ask what they are for. Never discard them.
- List the open pull requests (`gh pr list`) and the files they change. If they overlap with this work, tell the user before editing.
- Remind the user to tell the group chat what they are working on.

## While working
- One feature per branch, small enough to merge the same day if possible.
- Change only what the feature needs. Do not reformat, rename, move or reorganize other code.
- Prefer putting a new feature in its own file under `js/`.
- These shared files conflict most often, so keep edits in them small and ask the user to mention it in the group chat first:
  `js/main.js`, `js/state.js`, `js/selection.js`, `js/left-panel.js`, `index.html`, `styles.css`.
- Commit and push only when the user asks, and only to their feature branch.

## Finishing
1. Fetch and merge the latest `origin/main` into the feature branch (do not rebase).
2. Check that the app still works.
3. Push and open a pull request that says in plain language what changed and how to try it.
4. Ask the user to have a teammate try it. Only merge when the user explicitly asks.
5. After merging, remind the user to tell the group to get the latest `main`, and start the next feature on a new branch.

## Conflicts
- Explain in plain language what each side changed, and keep both changes where possible.
- If they contradict each other, ask the user. Do not pick a side yourself.
- Test the app after resolving.
- Never force-push or use `git reset --hard` to get out of a conflict.
