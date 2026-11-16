# Working on this repository

- Keep ChatGPT work on the existing `main` branch; do not create a separate branch for each task.
- For every important player-facing update, add a concise entry to `CHANGELOG` in `src/js/17-screens-misc.js`. Put the newest entry first and use the player's local release date.
- Describe useful changes and fixes in plain language. Leave infrastructure, logging configuration, refactoring, tests, branch management, and other changes players will not notice out of the in-game update log. Do not present existing features as newly added.
- Keep admin tools and admin-related changes out of the in-game changelog, including future entries.
- Run `node build.mjs` after client changes and commit the generated HTML and service-worker updates.

## Syncing, building and deploying

More than one person and agent pushes to `main`. A build or deploy from an out-of-date checkout silently removes everyone else's work from the live game.

- Before you start work, and again before you build, run `git fetch origin` and bring your branch up to date with `origin/main` (`git pull --ff-only origin main`, or merge `origin/main` if you have diverged). Never build or deploy from a checkout that is behind `origin/main`.
- Never deploy from a side branch, worktree or unmerged commit. Production only ever runs a commit that is already on `origin/main`.
- Before `pnpm run deploy` / `wrangler deploy`, check all of the following, and stop if any fails:
  1. `git status` is clean.
  2. `git fetch origin && git rev-list --count HEAD..origin/main` prints `0` (you are not missing anyone's commits).
  3. `git rev-list --count origin/main..HEAD` prints `0` (your commits are pushed, so what is deployed matches `main`).
  4. You ran `node build.mjs` on that exact tree and committed any generated changes.
- When merging, keep every `CHANGELOG` entry from both sides. Do not resolve conflicts in `index.html`, `public/index.html` or `public/sw.js` by picking a side; resolve the source files, then rerun `node build.mjs`.
- If a merge brings in other people's changes, rebuild and redeploy promptly so the live game does not stay on a version that is missing them.
- `wrangler preview` does not update production; use it for previews only.
