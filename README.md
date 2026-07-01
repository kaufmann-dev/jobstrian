# Jobstrian

> Automated job search and business lead discovery for Austria.

Jobstrian searches Austrian job portals for configured role keywords and Austrian cities,
derives a portal city from your validated home address when no explicit cities are configured,
finds configured business categories near your home for speculative
applications, and rates each job / business using a user-configured
OpenAI-compatible LLM.

## Features

- **Portal scraping** via interchangeable adapters:
  - `hokify`, `willhaben` Jobs (embedded JSON), `karriere.at` (HTML), and
    `AMS eJob-Room` (browser-driven, because the search API requires an SPA
    token).
  - Job portal scraping requires configured role keywords plus either explicit
    search cities or a validated address with a city / municipality. If no city
    can be determined, portal scraping is skipped instead of using a default
    city.
- **Nearby businesses**: OpenStreetMap (Overpass) finds configured business
  categories within a radius; missing e-mail addresses are extracted from the
  respective website by scanning bounded same-origin contact, imprint and
  recruiting pages. Automatic e-mail candidates are filtered for clearly
  unusable technical / no-reply addresses and reviewed in batches by the
  configured LLM before they become eligible for application sending. If
  Overpass is temporarily overloaded, the update skips this business sync and
  still completes the job scraping / ranking run.
  Websites, phone numbers and e-mail addresses can be manually added, edited,
  or deleted; manual changes remain authoritative during later updates.
- **LLM ranking**: jobs and businesses are scored through configurable weighted
  criteria; the LLM scores each criterion from 0 to 5 and the app calculates the
  final score, verdict and reasoning. Every business also receives a German
  e-mail draft even when no contact address was found. Unchanged jobs /
  businesses are skipped using content and ranking-context fingerprints.
- **Structured CV profile**: maintain skills, employment, education and
  certifications manually, or upload a PDF and selectively apply an editable
  AI-extracted preview.
- **Automatic application e-mails**: after Resend DNS verification in
  **Settings**, the Betriebe page can queue one CV-backed application e-mail per
  eligible business. Sending is paced on weekdays between 09:00 and 18:00 with
  short randomized gaps and a configurable daily send limit.
- **Update button**: one run scrapes, deduplicates, closes vanished listings,
  synchronizes businesses and rates new or changed entries. Structured progress
  is shown live with per-phase counts, LLM queue metrics and cancellation.
- Login-protected (Better Auth), German UI, light / dark mode.

## Tech Stack

| Area         | Tools                                                        |
| ------------ | ------------------------------------------------------------ |
| Framework    | SvelteKit, `@sveltejs/adapter-node`                          |
| UI           | Tailwind CSS, shadcn-svelte, `@lucide/svelte`, mode-watcher  |
| Data & Auth  | PostgreSQL, Drizzle ORM, Better Auth                         |
| Forms        | Superforms, Zod                                              |
| Scraping     | `cheerio` (HTML), Playwright (browser adapter), OSM Overpass |
| i18n / Tests | Paraglide, Vitest                                            |

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
GEOAPIFY_API_KEY="…"                     # Geoapify Autocomplete API
```

Create the key in Geoapify and select **Autocomplete API**. The server uses it
for Austrian address and city suggestions.

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
Afterwards log in at `/login`, enter your address, role keywords, business
categories and the OpenAI-compatible LLM (base URL including `/v1`, model, API key) in **Settings**.
Then click **KI Status prüfen**: Jobstrian sends one live request to the endpoint and only
marks the connection **aktiviert** if it succeeds. AI-powered features (profile import, search
and criteria generation) and the **Aktualisieren** run on the overview stay disabled until the
check passes, and the status resets whenever the base URL, model or API key changes.
For automatic applications, also configure Resend in **Settings**:

1. In the Resend dashboard, create a full-access API key under **API Keys** and
   paste it into **Resend API-Key**. Jobstrian uses this key to create / read
   the sending domain and to send application e-mails.
2. Enter the sending domain, sender local part, sender name and reply-to
   address in **Settings**.
3. Click **Resend-Status prüfen**, add the shown DNS records at your domain
   provider, verify the domain in the Resend dashboard, then click
   **Resend-Status prüfen** again so Jobstrian can sync the verified status.
4. In the Resend dashboard, create a webhook endpoint for
   `https://your-domain.example/api/webhooks/resend`, replacing the host with
   the deployed Jobstrian URL. Enable at least `email.bounced` and
   `email.complained`.
5. Copy the webhook signing secret from Resend (usually `whsec_…`) into
   **Webhook Secret**. Jobstrian uses it to verify that incoming bounce /
   complaint events really came from Resend.
6. Click **Test-E-Mail senden** to send a CV-backed test e-mail to the saved
   reply-to address before starting automatic applications.

For local development, Resend cannot call `localhost` directly; expose the app
with a tunnel and use that public tunnel URL as the webhook endpoint.

Upload a PDF CV and trigger the AI profile import manually in **Settings**. Then
click **Update** on the dashboard.

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
| `GEOAPIFY_API_KEY`   | Server-side Geoapify Autocomplete API key for Austrian suggestions.    |

## Notes

- Portal scrapers are inherently fragile: adapters prefer internal JSON
  endpoints, are isolated from each other (a broken adapter does not stop the
  run) and occasionally need maintenance when markup changes.
- LLM, Resend and profile configuration live in the database (`settings` table)
  and are maintained inside the app – not in `.env`.
