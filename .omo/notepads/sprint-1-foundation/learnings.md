## 2026-09-21 - Task 1 foundation

- Next.js 16.3.5 uses Turbopack by default and requires direct ESLint CLI usage; `next lint` is removed and `next build` does not lint.
- Tailwind CSS 4.3.3 uses `@tailwindcss/postcss` and CSS-first `@import "tailwindcss"`; no `tailwind.config` file or Autoprefixer dependency is required.
- Bound Tailwind automatic source detection to `src/` with `source("../")` from `src/app/globals.css`. The preserved `.codegraph` junction resolves outside the project and otherwise triggers a Turbopack filesystem-root panic.
- pnpm 12 build-script policy belongs in `pnpm-workspace.yaml`; `allowBuilds` replaced the removed `onlyBuiltDependencies` setting. Only `unrs-resolver` is approved.
- On this Windows/pnpm 12 setup, pass Next CLI options as `pnpm dev --hostname 127.0.0.1`; inserting a literal `--` is forwarded as a directory argument.
- shadcn 4.21.0 defaults to the `base-nova` style and Base UI, with Tailwind v4 configuration represented by an empty `tailwind.config` value in `components.json`.

## 2026-09-21 - Independent verification fix

- Treat shadcn `components.json` icon-library selection as generator metadata, not as justification for installing the icon package. Add the package only when generated or authored Wave-scoped source imports it.
- Audit every direct dependency against a current runtime import, CSS import, generated primitive, or required tool command; a plausible future use is not a current dependency requirement.
