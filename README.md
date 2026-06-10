# Jobstrian

> Automatisierte Jobsuche für Gastronomie-/Service-Stellen in Wien.

Jobstrian durchsucht österreichische Jobportale nach Stellen (Barista, Kellner:in,
Servicemitarbeiter:in, Service-Hilfskraft …), findet Gastronomiebetriebe im Umkreis
deines Wohnorts für Initiativbewerbungen, und bewertet jede Stelle/jeden Betrieb mit
einer von dir konfigurierten OpenAI-kompatiblen LLM.

## Funktionen

- **Portal-Scraping** über austauschbare Adapter:
  - `willhaben` Jobs (eingebettetes JSON), `karriere.at` (HTML), `AMS eJob-Room`
    (Browser-gesteuert, da die Such-API ein SPA-Token braucht).
  - `hokify` ist als Adapter vorhanden, aber standardmäßig **deaktiviert** – die
    Suchergebnisse sind ohne Login/App nicht stabil zugänglich.
- **Betriebe in der Nähe**: OpenStreetMap (Overpass) liefert Gastronomie im Radius;
  fehlende E-Mail-Adressen werden von der jeweiligen Website (Impressum/Kontakt) extrahiert.
- **LLM-Ranking**: jede Stelle bekommt Score + Verdict + Begründung; für Betriebe ohne
  Ausschreibung wird zusätzlich ein deutscher E-Mail-Entwurf erzeugt.
- **Update-Knopf**: ein Lauf scrapt, dedupliziert, schließt verschwundene Stellen,
  synchronisiert Betriebe und bewertet neue Einträge. Der Fortschritt wird live angezeigt.
- Login-geschützt (Better Auth), deutsche UI, Hell/Dunkel-Modus.

## Tech-Stack

| Bereich        | Tools |
| -------------- | ----- |
| Framework      | SvelteKit, `@sveltejs/adapter-node` |
| UI             | Tailwind CSS, shadcn-svelte, `@lucide/svelte`, mode-watcher |
| Daten & Auth   | PostgreSQL, Drizzle ORM, Better Auth |
| Formulare      | Superforms, Zod |
| Scraping       | `cheerio` (HTML), Playwright (Browser-Adapter), OSM Overpass/Nominatim |
| i18n / Tests   | Paraglide, Vitest |

## Einrichtung

### 1. Abhängigkeiten

```bash
pnpm install
pnpm exec playwright install chromium   # für den AMS-Adapter (Browser)
```

### 2. Umgebungsvariablen (`.env`)

```bash
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="jobstrian"
DATABASE_URL="postgres://postgres:postgres@localhost:5432/jobstrian"
ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="…"                   # openssl rand -hex 32
BOOTSTRAP_EMAIL="you@example.com"        # einmaliger erster Benutzer
BOOTSTRAP_PASSWORD="min-8-zeichen"
BOOTSTRAP_NAME="Dein Name"
```

### 3. Datenbank (Podman)

```bash
podman run --name postgres-sveltekit --env-file .env \
  --publish 5432:5432 \
  --volume postgres-sveltekit-data:/var/lib/postgresql/data \
  --detach postgres:18-alpine

pnpm drizzle-kit migrate
```

### 4. Starten & erster Login

```bash
pnpm dev
# einmalig den ersten Benutzer anlegen (selbst-deaktivierend, sobald ein User existiert):
curl -X POST http://localhost:5173/api/bootstrap
```

Danach unter `/login` anmelden, in **Einstellungen** Adresse, Suchbegriffe und die
OpenAI-kompatible LLM (Base URL inkl. `/v1`, Modell, API-Key) hinterlegen, und auf der
Übersicht **Aktualisieren** klicken.

## Entwicklung

```bash
pnpm dev        # Entwicklung
pnpm check      # Typecheck (svelte-check)
pnpm build      # Produktions-Build
pnpm lint       # Prettier + ESLint
```

Migrationen immer über Drizzle Kit: `pnpm drizzle-kit generate` / `pnpm drizzle-kit migrate`.

## Hinweise

- Portal-Scraper sind naturgemäß fragil: Adapter bevorzugen interne JSON-Endpunkte,
  sind voneinander isoliert (ein defekter Adapter stoppt den Lauf nicht) und brauchen
  gelegentlich Wartung, wenn sich das Markup ändert.
- Die LLM-Konfiguration und das Profil liegen in der DB (Tabelle `settings`) und werden
  in der App gepflegt – nicht in `.env`.
