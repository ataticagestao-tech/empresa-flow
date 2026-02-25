# AGENTS.md

## Dev environment tips
- Install dependencies with `npm install` before running scaffolds.
- Use `npm run dev` for the interactive TypeScript session that powers local experimentation.
- Run `npm run build` to refresh the CommonJS bundle in `dist/` before shipping changes.
- Store generated artefacts in `.context/` so reruns stay deterministic.

## Testing instructions
- Execute `npm run test` for Vitest watch mode, or `npm run test:run` for a single run.
- Tests live under `src/**/*.{test,spec}.{ts,tsx}`; setup in `src/test/setup.ts`.
- Trigger `npm run build && npm run test:run` before opening a PR to mimic CI.
- Add or update tests alongside any generator or CLI changes.

## PR instructions
- Follow Conventional Commits (for example, `feat(scaffolding): add doc links`).
- Cross-link new scaffolds in `docs/README.md` and `agents/README.md` so future agents can find them.
- Attach sample CLI output or generated markdown when behaviour shifts.
- Confirm the built artefacts in `dist/` match the new source changes.

## Repository map
- `0/` — explain what lives here and when agents should edit it.
- `app_update.zip/` — explain what lives here and when agents should edit it.
- `app.tar/` — explain what lives here and when agents should edit it.
- `app.zip/` — explain what lives here and when agents should edit it.
- `apply_delete_func.cjs/` — explain what lives here and when agents should edit it.
- `apply_fix.cjs/` — explain what lives here and when agents should edit it.
- `apply_monitor_rpc.cjs/` — explain what lives here and when agents should edit it.
- `ataticagestao_nocache.conf/` — explain what lives here and when agents should edit it.

## AI Context References
- Documentation index: `.context/docs/README.md`
- Agent playbooks: `.context/agents/README.md`
- Contributor guide: `CONTRIBUTING.md`

## Execution Protocol (Global)
- Use planning mode for non-trivial work (3+ steps, architecture decisions, migration, or production risk).
- If execution drifts from plan, stop and replan before continuing.
- Include verification steps in the plan, not only build steps.
- Prefer parallel research/exploration with subagents or equivalent parallel workers when available.
- Use one focused objective per subagent/worker and consolidate findings before implementation.

## Task And Lessons Workflow
- For non-trivial tasks, register checklist items in `tasks/todo.md` before implementation.
- Keep `tasks/todo.md` updated while executing, and include a short review section at the end.
- After any user-reported correction, record root cause and prevention rule in `tasks/lessons.md`.
- Review `tasks/lessons.md` at the start of relevant follow-up work.

## Completion And Quality Gate
- Never mark work as done without objective verification evidence.
- When relevant, compare behavior between `main` and current changes.
- Run tests/typecheck/log checks before completion claims.
- For non-trivial changes, challenge the solution for elegance and minimal impact before presenting.
- For simple obvious fixes, avoid over-engineering.

## Bugfix Autonomy
- On bug reports, proceed directly to diagnosis and fix with minimal user back-and-forth.
- Ask for user input only when blocked by missing credentials, missing environment access, or product decisions.
