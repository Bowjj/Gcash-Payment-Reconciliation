## 2026-09-21 - Task 1 foundation

- Resolved: Corepack could run pnpm but could not install shims into `C:\Program Files\nodejs` without elevation. `pnpm setup` installed pnpm 12.5.1 under the user-local pnpm home used for task commands.
- Resolved: pnpm 12 initially rejected the unreviewed `unrs-resolver@1.12.2` postinstall. Added an explicit `allowBuilds` entry instead of weakening dependency-build protections.
- Resolved: Tailwind's default working-directory scan followed preserved CodeGraph metadata outside Turbopack's root. Restricted scanning to `src/`, after which the original Turbopack build passed.
- Tooling limitation: the TypeScript language server is not installed, so editor LSP diagnostics were unavailable. Explicit `tsc --noEmit` and ESLint CLI gates are used instead.
- No unresolved Wave 1 implementation issue remains at this checkpoint.

## 2026-09-21 - Independent verification fix

- Resolved: `lucide-react@1.47.0` was installed even though no Wave 1 source imported it. Removed it through pnpm while retaining valid shadcn icon-generator metadata in `components.json`.
- Re-audited all remaining direct dependencies; no additional Wave 1 dependency bloat was found.
