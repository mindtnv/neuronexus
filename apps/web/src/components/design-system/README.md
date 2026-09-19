# Reomi UI foundation

Production React components, shared by `/design` and the existing app screens.

```tsx
import { Field, TextInput, SegmentedControl, ReadingText, Surface } from '@/components/design-system/primitives';
import { NNBtn, NNCard } from '@/components/ui';

<Field label="Название" error={error}>
  <TextInput value={title} onChange={e => setTitle(e.target.value)} />
</Field>
<NNBtn variant="primary" loading={saving} onClick={save}>Сохранить</NNBtn>
<Surface level="floating">...</Surface>
```

- `Button` accepts native button props, icons as React nodes, loading, sizes and semantic variants. `NNBtn` adapts existing icon names without changing callers.
- `Surface` defines content/subtle/floating surfaces. `NNCard` uses the same component. Clickable surfaces support keyboard activation.
- `Field` connects labels, hints and errors to the child control. `TextInput` and `TextArea` preserve native form behavior.
- `SegmentedControl` is a controlled radio group with arrow/Home/End navigation. Used by the notebook's actual dock tabs.
- `ReadingText` assigns Literata to long-form content. Used by actual notebook notes and overview. UI remains Golos Text; code remains monospace.
- `NNSelect`, `DialogProvider`, `NNBadge`, `NNTag`, skeletons, load errors and toasts are the existing production implementations shown in the lab.

Styles live in `components.css`, imported once in the root layout. They consume existing theme variables; no independent hardcoded palette and no Tailwind/shadcn migration. Mode and palette are independent. The versioned `nn:theme` preference migrates legacy strings; shared theme tokens cover both modes for every palette.

## Local service

The design environment runs the existing Next.js frontend and Bun API against a dedicated PostgreSQL database named `reomi_design`, with local MinIO storage. Normal authentication, CRUD, reviews and uploads are used. There is no fixture API or copied screen.

An ignored `.env.design` holds local URLs, database and storage settings. Start PostgreSQL/MinIO with Docker Compose, create `reomi_design` once, then apply migrations with `bun --env-file=.env.design packages/db/src/migrate.ts`.

```sh
bun run dev:design
# With the API running, populate the demo account:
bun run db:seed:design
```

Open port 4311, sign in as `demo@neuronexus.local` / `demodemo123`, then use `/design`, `/notebooks`, `/cards` or `/library`. The seeder uses the existing card/review seed on the first run and adds notebooks, sources, notes and study-guide examples. Re-running preserves populated cards and existing notebooks. Edits persist in PostgreSQL across service restarts. Do not run the ordinary destructive `db:seed` again to refresh this environment.

AI chat and embeddings need real provider configuration in `.env.design`; without keys the application's normal setup notices apply and imported sources remain parsed but awaiting indexing. There are no canned AI responses.

`/design` returns 404 in production. The application uses normal authentication in every environment.

Current integration: shared buttons and cards throughout existing callers, notebook list search, notebook dock selectors, note fields, overview and note reading. Other screen-specific styling is migrated incrementally.
