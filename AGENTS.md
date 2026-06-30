# Codex Instructions

## Source Of Truth

Read `PROJECT_BRIEF.md` before starting any task in this project. It is the authoritative brief for product, architecture, workflow, naming and guardrails.

`CLAUDE.md` is only a compatibility entrypoint for the DEV workspace convention and points back to `PROJECT_BRIEF.md`.

## Shared Workspace Context

- Workspace guidance: `../../AGENTS.md`.
- Workspace index: `../../DEV-INDEX.md`.
- AI context: `../../_workspace/AIContext/`.
- For UI, visual design, layout, component, token or frontend polish tasks, consult:
  - `../../_systems/0.design-system/CLAUDE.md`
  - `../../_systems/0.design-system/docs/playbook.md`

Prefer reusing or adapting shared design-system references before creating new patterns.

## Codex Skill Routing

Use the workspace skill rules from `../../_workspace/AIContext/09_SKILL_ROUTING.md`.

## Codex Finish Signal

Use `../../_workspace/AIContext/11_CODEX_FINISH_SIGNAL.md` when the user asks to use the Codex jingle at the end.

## Next Phase Prompting

When the user asks for a "prompt siguiente fase" or equivalent, propose a manageable executable cut, not a one-checkbox prompt by default and not a megablock.

- Group related tasks only when they share module, evidence, verification and risk profile.
- Keep the prompt small enough to preserve context quality and avoid mixing unrelated domains.
- Include objective, context, scope, out of scope, verification and expected summary.
- Prefer real local/runtime evidence over repeated documentation.
- Be efficient, but do not reduce quality, tenant safety, guardrails or verification depth.

Relevant defaults for this project:

- New visible UI or app surface: `frontend-design`.
- Layout, spacing or dense admin screens: `arrange`.
- Final visible UI pass: `polish`.
- Accessibility/responsive/theming check: `audit`.
- Operational copy, labels, validation errors: `clarify`.
- Empty states, edge cases, permissions or tenant boundaries: `harden`.
- Next.js implementation: `vercel:nextjs` when the task involves framework behavior.
- shadcn/ui work: `vercel:shadcn`.

## Project Guardrails

- Decision 2026-06-29: BoxOps and BoxWod are separate apps inside the same hub and share the hub Supabase project for Auth, organizations, centers, base person/profile identity and tenant access.
- Do not create a second user/profile system for BoxWod users who already exist in BoxOps/hub. A coach, owner or admin should reuse the same hub identity across both apps.
- Sharing Supabase does not mean sharing operational permissions blindly. BoxWod is included for BoxOps tenants in MVP, but BoxWod capabilities must go through `boxwod_*` helpers and BoxOps operational access must keep excluding athlete-only users.
- Keep BoxOps product tables and workflows operational. BoxWod owns reservations, WOD, athlete results, athlete profile/progress and athlete community surfaces.
- Do not hardcode STL in product names, routes, components, permissions or database rules.
- Treat STL as tenant data/configuration only.
- Keep the tenant hierarchy explicit: `Organization/Tenant -> Centers -> Users/Coaches -> Schedules -> Classes/Blocks -> Events`.
- Do not implement application code until the stack and schema tasks in `TASKS.md` are started.
- Multi-tenant data must include an organization boundary from the first migration.
- Document architecture decisions in project docs when they affect future work.
- Treat the operational schedule block as the first modelling candidate. Not every block in a box is a class.
- Do not prioritize AI, payroll, native mobile or advanced geolocation before MVP 1 scheduling and coverage.

## Priority

If instructions conflict:

1. `PROJECT_BRIEF.md`
2. `AGENTS.md`
3. Workspace `../../AGENTS.md`
