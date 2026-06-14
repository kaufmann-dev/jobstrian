# Jobstrian

> Automated job search for gastronomy / service positions in Vienna.

Jobstrian searches Austrian job portals for openings (barista, waiter/waitress,
service staff, service assistant …), finds gastronomy businesses near your home
for speculative applications, and rates each job / business using a
user-configured OpenAI-compatible LLM.

## Features

- **Portal scraping** via interchangeable adapters:
  - `hokify`, `willhaben` Jobs (embedded JSON), `karriere.at` (HTML), and
    `AMS eJob-Room` (browser-driven, because the search API requires an SPA
    token).
- **Nearby businesses**: OpenStreetMap (Overpass) finds gastronomy within a
  radius; missing e-mail addresses are extracted from the respective website
  (imprint / contact page). If Overpass is temporarily overloaded, the update
  skips this business sync and still completes the job scraping / ranking run.
  Phone numbers and e-mail addresses can be manually added, edited, or deleted;
  manual changes remain authoritative during later updates.
- **LLM ranking**: jobs receive a score + verdict + reasoning; for businesses
  without a listing a score is generated, and every business receives a German
  e-mail draft even when no contact address was found. Unchanged jobs /
  businesses are skipped using content and ranking-context fingerprints.
- **Structured CV profile**: maintain skills, employment, education and
  certifications manually, or upload a PDF and selectively apply an editable
  AI-extracted preview.
- **Update button**: one run scrapes, deduplicates, closes vanished listings,
  synchronizes businesses and rates new or changed entries. Structured progress
  is shown live with per-phase counts, LLM queue metrics and cancellation.
- Login-protected (Better Auth), German UI, light / dark mode.

## Tech Stack

| Area         | Tools                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Framework    | SvelteKit, `@sveltejs/adapter-node`                                      |
| UI           | Tailwind CSS, shadcn-svelte, `@lucide/svelte`, mode-watcher              |
| Data & Auth  | PostgreSQL, Drizzle ORM, Better Auth                                     |
| Forms        | Superforms, Zod                                                          |
| Scraping     | `cheerio` (HTML), Playwright (browser adapter), OSM Overpass / Nominatim |
| i18n / Tests | Paraglide, Vitest                                                        |

## Setup

### 1. Dependencies

```bash
pnpm install
pnpm exec playwright install chromium   # for browser-backed adapters
```

### 2. Environment variables (`.env`)

```bash
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="jobstrian"
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobstrian"
ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="…"                   # openssl rand -hex 32
BODY_SIZE_LIMIT="10M"                    # allows CV uploads up to the app's 10 MB limit
```

### 3. Database (Podman)

```bash
podman run --name postgres-sveltekit --env-file .env \
  --publish 5432:5432 \
  --volume postgres-sveltekit-data:/var/lib/postgresql/data \
  --detach postgres:18-alpine

pnpm drizzle-kit migrate
```

### 4. Start & first login

```bash
pnpm dev
```

Open `http://localhost:5173` and create the first user on the setup screen.
The setup screen disables itself permanently once that single user exists.
Afterwards log in at `/login`, enter your address, search terms and the
OpenAI-compatible LLM (base URL including `/v1`, model, API key) in **Settings**,
Upload an optional PDF CV and trigger the AI profile import manually in
**Settings**. Then click **Update** on the dashboard.

## Development

```bash
pnpm dev        # development
pnpm check      # type check (svelte-check)
pnpm build      # production build
pnpm lint       # Prettier + ESLint
```

Generate migration files with `pnpm drizzle-kit generate` after schema changes.
Pending migrations are applied automatically when the server starts (both `pnpm dev`
and production); `pnpm drizzle-kit migrate` remains available to apply them manually.

## Coolify Deployment

| Setting        | Value    |
| -------------- | -------- |
| Build Pack     | Nixpacks |
| Base Directory | `/`      |

`nixpacks.toml` installs Chromium during the build with
`pnpm exec playwright install --with-deps chromium` so browser-backed portal
adapters work in production.

Pending migrations are applied automatically at server startup, so no
post-deployment migration command is needed.

### Environment Variables

#### Required

| Variable             | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string.                                          |
| `BETTER_AUTH_SECRET` | Auth secret — generate with `openssl rand -hex 32`.                    |
| `ORIGIN`             | Public URL of the deployed app (e.g. `https://jobstrian.example.com`). |
| `BODY_SIZE_LIMIT`    | Request body limit for CV uploads. Use `10M` or higher.                |

#### Optional

| Variable         | Default | Purpose                                    |
| ---------------- | ------- | ------------------------------------------ |
| `RESEND_API_KEY` | —       | Only needed if sending e-mails via Resend. |

## Notes

- Portal scrapers are inherently fragile: adapters prefer internal JSON
  endpoints, are isolated from each other (a broken adapter does not stop the
  run) and occasionally need maintenance when markup changes.
- LLM configuration and your profile live in the database (`settings` table) and
  are maintained inside the app – not in `.env`.
