# Jobstrian

> Automated job search for gastronomy / service positions in Vienna.

Jobstrian searches Austrian job portals for openings (barista, waiter/waitress,
service staff, service assistant …), finds gastronomy businesses near your home
for speculative applications, and rates each job / business using a
user-configured OpenAI-compatible LLM.

## Features

- **Portal scraping** via interchangeable adapters:
  - `willhaben` Jobs (embedded JSON), `karriere.at` (HTML), `AMS eJob-Room`
    (browser-driven, because the search API requires an SPA token).
  - `hokify` is available as an adapter but disabled by default – its search
    results are not reliably accessible without a login / app.
- **Nearby businesses**: OpenStreetMap (Overpass) finds gastronomy within a
  radius; missing e-mail addresses are extracted from the respective website
  (imprint / contact page).
- **LLM ranking**: every job receives a score + verdict + reasoning; for
  businesses without a listing a German e-mail draft is generated in addition.
- **Update button**: one run scrapes, deduplicates, closes vanished listings,
  synchronizes businesses and rates new entries. Progress is shown live.
- Login-protected (Better Auth), German UI, light / dark mode.

## Tech Stack

| Area           | Tools |
| -------------- | ----- |
| Framework      | SvelteKit, `@sveltejs/adapter-node` |
| UI             | Tailwind CSS, shadcn-svelte, `@lucide/svelte`, mode-watcher |
| Data & Auth    | PostgreSQL, Drizzle ORM, Better Auth |
| Forms          | Superforms, Zod |
| Scraping       | `cheerio` (HTML), Playwright (browser adapter), OSM Overpass / Nominatim |
| i18n / Tests   | Paraglide, Vitest |

## Setup

### 1. Dependencies

```bash
pnpm install
pnpm exec playwright install chromium   # for the AMS adapter (browser)
```

### 2. Environment variables (`.env`)

```bash
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="jobstrian"
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobstrian"
ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="…"                   # openssl rand -hex 32
BOOTSTRAP_EMAIL="you@example.com"        # one-time first user
BOOTSTRAP_PASSWORD="min-8-chars"
BOOTSTRAP_NAME="Your Name"
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
# create the first user once (self-deactivates as soon as a user exists):
curl -X POST http://localhost:5173/api/bootstrap
```

Afterwards log in at `/login`, enter your address, search terms and the
OpenAI-compatible LLM (base URL including `/v1`, model, API key) in **Settings**,
and click **Update** on the dashboard.

## Development

```bash
pnpm dev        # development
pnpm check      # type check (svelte-check)
pnpm build      # production build
pnpm lint       # Prettier + ESLint
```

Always run migrations via Drizzle Kit: `pnpm drizzle-kit generate` /
`pnpm drizzle-kit migrate`.

## Deployment (Coolify)

### 1. Prerequisites

- A running [Coolify](https://coolify.io) instance.
- A Git repository containing this project.

### 2. Create a PostgreSQL database

In Coolify:
1. Go to **Databases → New** and choose **PostgreSQL**.
2. Pick a version (e.g. `18-alpine`) and save.
3. Copy the generated **Internal Connection String** (or external URL if the app
   runs outside Coolify) – you will need it for `DATABASE_URL`.

### 3. Create the SvelteKit service

1. In Coolify go to **Projects → Add Resource → Application**.
2. Connect your Git repository and select the branch you want to deploy.

The included `nixpacks.toml` automatically configures the build (`pnpm build`),
runs database migrations before each deploy, and starts the app (`node build`).
No manual build-pack settings are needed.

### 4. Environment variables

Add the following variables in the Coolify UI under **Environment**:

| Variable              | Example / note                                                               |
| --------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`        | Connection string from the PostgreSQL database created above.                |
| `BETTER_AUTH_SECRET`  | `openssl rand -hex 32`                                                       |
| `ORIGIN`              | Public URL of the deployed app, e.g. `https://jobstrian.example.com`.        |
| `BOOTSTRAP_EMAIL`     | E-mail address of the first user (created on first start).                   |
| `BOOTSTRAP_PASSWORD`  | Password for the first user (**min. 8 characters**).                         |
| `BOOTSTRAP_NAME`      | Display name of the first user.                                              |
| `RESEND_API_KEY`      | *(optional)* Only required if you want to send e-mails via Resend.           |

### 5. Bootstrap the first user

After the first successful deployment, create the initial admin account with an
HTTP request (replace the origin with your public URL):

```bash
curl -X POST https://jobstrian.example.com/api/bootstrap
```

The bootstrap endpoint disables itself as soon as at least one user exists.

## Notes

- Portal scrapers are inherently fragile: adapters prefer internal JSON
  endpoints, are isolated from each other (a broken adapter does not stop the
  run) and occasionally need maintenance when markup changes.
- LLM configuration and your profile live in the database (`settings` table) and
  are maintained inside the app – not in `.env`.
