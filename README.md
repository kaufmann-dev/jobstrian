# Jobstrian

> Automated job search and business lead discovery for Austria.

Jobstrian searches Austrian job portals for configured role keywords and Austrian cities,
derives a portal city from your validated home address when no explicit cities are configured,
finds configured business categories near the applicant's home for speculative
applications, rates each job / business using a user-configured
AI model and tracks which companies actually answered.

One login manages several **people** (for example yourself, your partner, your mom). Each
person has their own profile, CV, search configuration, ranking criteria, jobs, businesses,
applications and e-mail sender; the LLM connections are shared.

## People

- **Alle Personen** (`/`) shows one card per person with their replies and next steps.
- Every person lives under `/p/<slug>` (Übersicht, Stellen, Betriebe, Bewerbungen,
  Einstellungen). The person switcher in the header keeps the current section when you switch.
  The slug is derived from the name once and never changes, so links and the Resend webhook URL
  stay valid after a rename.
- **App-Einstellungen** (`/settings`) manage people, shared **KI-Verbindungen** (several
  OpenAI Responses, Anthropic Messages or OpenAI-compatible Chat Completions connections,
  each with saved and individually verified models), the default
  model, the "Keine Antwort nach … Tagen" threshold and the connected MCP apps.
- Each person can pick a saved model of their own or use the app default. Deleting a person
  deletes everything that belongs to them.
- Only one job-portal refresh runs at a time (the portals, the browser and the LLM provider are
  shared); starting a second one reports who is currently running. Application e-mails are sent
  per person in parallel.

## Bewerbungen (application tracker)

Applications are grouped into **search episodes** ("Jobsuche 2024", "Jobsuche 2026"). One episode
per person is running; marking an application as accepted ends it as "Stelle gefunden", and a later
search starts a new episode, so the history of earlier searches stays intact.

Many employers never answer, so "Beworben" is not progress. The page opens on **Rückmeldungen**
(replied, interview, offer, accepted). Everything else lives in muted tabs: **Wartet** (applied, no
reply yet), **Keine Antwort** (no reply after the configured number of days, derived from the date,
default 21), **Abgeschlossen** (rejected or withdrawn) and **Geplant**. The response rate counts any
reaction, including rejections. Applications are created manually, with **Bewerbung anlegen** on a
Stelle or Betrieb, automatically when an application e-mail to a Betrieb has been sent, or via MCP.

## MCP server

Jobstrian is an OAuth 2.1 authorization server and MCP server (`POST {ORIGIN}/mcp`, stateless
Streamable HTTP) for the tracker. Connect an AI client:

```bash
claude mcp add --transport http jobstrian https://your-domain.example/mcp
codex mcp add jobstrian --url https://your-domain.example/mcp
```

The client registers itself (Client ID Metadata Documents or dynamic client registration), you sign
in through your OIDC provider and approve it on the consent screen. Access tokens last 15 minutes
and refresh automatically; **App-Einstellungen → Verbundene Apps** lists and revokes clients.
Discovery lives at `/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-authorization-server/api/auth`.

| Scope                | Tools                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applications:read`  | `list_people`, `get_overview`, `list_searches`, `list_applications`, `get_application`                                                               |
| `applications:write` | `create_search`, `update_search`, `create_application`, `update_application`, `set_application_status`, `add_application_note`, `delete_application` |

Tools take the person's slug in `person` (see `list_people`). `list_applications` returns only real
replies by default and always reports `bucket_counts`. Combine it with a mail connector: read the
reply, then call `set_application_status`.

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
  eligible business. Sending is paced between 09:00 and 18:00 (Europe/Vienna) with
  short randomized gaps and a configurable daily send limit. By default, sending
  runs Monday through Friday; **Auch am Wochenende senden** in **E-Mail-Versand**
  includes Saturdays and Sundays. Changes also reschedule queued e-mails within
  30 seconds. Public holidays do not affect the schedule.
- **Update button**: one run scrapes, deduplicates, closes vanished listings,
  synchronizes businesses and rates new or changed entries for the current person.
  Structured progress is shown live with per-phase counts, LLM queue metrics and
  cancellation.
- OIDC-protected (Better Auth), German UI, light / dark mode.

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

Application runtime variables (required for local dev and deployment):

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobstrian"
ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="…"                   # openssl rand -hex 32
OIDC_ISSUER="https://identity.example.com/realms/admins"
OIDC_CLIENT_ID="jobstrian"
OIDC_CLIENT_SECRET="…"
GEOAPIFY_API_KEY="…"                     # Geoapify Autocomplete API
```

If you use the local Podman command in the next step, add PostgreSQL container variables too (used by the
postgres image only):

```bash
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="jobstrian"
```

Create the key in Geoapify and select **Autocomplete API**. The server uses it
for Austrian address and city suggestions.

`BODY_SIZE_LIMIT` is no longer used by the app at runtime. CV uploads are currently
hard limited to **10 MB** in `src/routes/api/cv/+server.ts`.

### 3. Database (Podman)

```bash
podman run --name postgres-sveltekit --env-file .env \
  --publish 5432:5432 \
  --volume postgres-sveltekit-data:/var/lib/postgresql/data \
  --detach postgres:18-alpine

pnpm db:migrate
```

### 4. Start & sign in

```bash
pnpm dev
```

Open `http://localhost:5173/login` and sign in through the configured OIDC provider.
Provider access policy determines which administrators may use Jobstrian; the app does not maintain
an identity or claim allowlist. After signing in, enter your address, role keywords, business
categories in the person's **Einstellungen**. Create the first person on the start page, then add
an AI connection under **App-Einstellungen → KI-Verbindungen** (API type, base URL including `/v1`,
API key). OpenAI defaults to `https://api.openai.com/v1`; Anthropic defaults to
`https://api.anthropic.com/v1`. Base URLs remain editable for proxies and local providers.
Then, save one or more models (loaded from the endpoint's model list or typed manually) and
click **Prüfen** on a model: Jobstrian sends one live request and only marks the model
**Geprüft** if it succeeds. AI-powered features (profile import, search and criteria generation)
and the **Aktualisieren** run on a person's overview stay disabled until their model (their own
choice or the app default) is verified; the status resets whenever the connection's API type, base URL or
API key changes. Native OpenAI and Claude models must support structured outputs; verification checks
that the selected API can return the required schema. Existing official OpenAI and Anthropic
connections migrate to their native APIs and must be verified again; other connections use
OpenAI-compatible Chat Completions.

Ranking and draft requests reuse instructions and applicant context before the job/business input.
Claude caches this stable prefix for five minutes when it meets the selected model's minimum
length. One-off previews and verification do not request Claude caching. OpenAI uses its default
prompt caching behavior. Unchanged rankings and drafts are still skipped using fingerprints.
Server logs tagged `[llm-usage]` record provider, connection/model/person IDs, purpose, attempt,
duration, input/output tokens, cached input and cache writes. Missing usage is `null`; prompts,
responses and API keys are excluded. Token rates depend on the model; switching endpoints does
not itself lower token prices.

For automatic applications, also configure Resend per person in their **Einstellungen**
(every person sends from their own address, so each has their own Resend key, domain, sender,
reply-to and webhook; the same key or domain may be reused):

1. In the Resend dashboard, create a full-access API key under **API Keys** and
   paste it into **Resend API-Key**. Jobstrian uses this key to create / read
   the sending domain and to send application e-mails.
2. Enter the sending domain, sender local part, sender name and reply-to
   address in **Settings**.
3. Click **Resend-Status prüfen**, add the shown DNS records at your domain
   provider, verify the domain in the Resend dashboard, then click
   **Resend-Status prüfen** again so Jobstrian can sync the verified status.
4. In the Resend dashboard, create a webhook endpoint for
   `https://your-domain.example/api/webhooks/resend/<person-slug>` (the settings page
   shows the exact URL), replacing the host with the deployed Jobstrian URL. Enable at
   least `email.bounced` and `email.complained`.
5. Copy the webhook signing secret from Resend (usually `whsec_…`) into
   **Webhook Secret**. Jobstrian uses it to verify that incoming bounce /
   complaint events really came from Resend.
6. Click **Test-E-Mail senden** to send a CV-backed test e-mail to the saved
   reply-to address before starting automatic applications.

For local development, Resend cannot call `localhost` directly; expose the app
with a tunnel and use that public tunnel URL as the webhook endpoint.

Upload a PDF CV and trigger the AI profile import manually in **Settings**. Then
click **Update** on the dashboard.

## Authentication Setup

Jobstrian shows its own login screen, then starts Better Auth's generic OIDC flow (authorization code + PKCE S256, `client_secret_post`) and returns to the originally requested page. Server-side sessions last seven days without extension; logout ends the local session and the provider SSO session via RP-initiated logout.

- Public Client: Off
- Callback URL: `/api/auth/callback/oidc`
- Logout Callback URL: `/login`
- MCP clients use Jobstrian's own OAuth server; no extra provider configuration is needed. The
  consent screen and `/mcp` are served from `ORIGIN`, so it must match the public URL.
- Required authentication variables: `ORIGIN`, `BETTER_AUTH_SECRET`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (see **Environment Variables → Required**).

Production app, issuer, and discovered provider URLs must use HTTPS; plain HTTP is accepted only
for loopback development. The database migration removes legacy credential identities and their
auth sessions while preserving Jobstrian settings, CVs, listings, leads, and other app-owned data.

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

`nixpacks.toml` runs the pinned pnpm 11.18.0 (`packageManager`) for install and
build, and installs Chromium with `playwright install --with-deps chromium` so
browser-backed portal adapters work in production.

Pending migrations are applied automatically at server startup, so no
post-deployment migration command is needed.

### Environment Variables

#### Required

| Variable             | Purpose                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string.                                                                     |
| `BETTER_AUTH_SECRET` | Auth secret — generate with `openssl rand -hex 32`.                                               |
| `ORIGIN`             | Public URL of the deployed app (e.g. `https://jobstrian.example.com`); also needed at build time. |
| `OIDC_ISSUER`        | Exact OIDC issuer URL from the provider discovery document.                                       |
| `OIDC_CLIENT_ID`     | Confidential OIDC client identifier registered for Jobstrian.                                     |
| `OIDC_CLIENT_SECRET` | Confidential OIDC client secret.                                                                  |
| `GEOAPIFY_API_KEY`   | Server-side Geoapify Autocomplete API key for Austrian suggestions.                               |

CV uploads are hard capped to **10 MB** by backend validation.

## Notes

- Portal scrapers are inherently fragile: adapters prefer internal JSON
  endpoints, are isolated from each other (a broken adapter does not stop the
  run) and occasionally need maintenance when markup changes.
- People, their profiles and Resend setups (`person` table), LLM connections and models
  (`llm_connection`, `llm_model`) and app defaults (`app_settings`) live in the database and
  are maintained inside the app – not in `.env`. Nearly every other table (`listing`, `lead`,
  `scrape_run`, application e-mails, `application_search`, `application`) belongs to one person.
- The Drizzle schema, migrations and the MCP tool list are the source of truth; MCP tools must
  be registered in `TOOL_SCOPES` (`src/lib/server/mcp/scopes.ts`).
