# SEBSA IFS Data Migration Tool — System Architecture & Data Flow (A‑to‑Z)

An end‑to‑end reference for the current system: architecture, every UI screen and component, the business logic on each screen, and exactly how the UI talks to the REST API layer. This is the alignment baseline for ongoing UI development.

> Companion document: [`IFS_API_INTEGRATION.md`](IFS_API_INTEGRATION.md) is the deep‑dive on the IFS Cloud integration (auth, route contract, GET/POST patterns, `$batch`). This document is the wider system map; it references the integration guide rather than repeating it.

## Contents

1. [What the system is](#1-what-the-system-is)
2. [Technology stack](#2-technology-stack)
3. [High-level architecture](#3-high-level-architecture)
4. [End-to-end data flow](#4-end-to-end-data-flow)
5. [Routing & screen map](#5-routing--screen-map)
6. [Component inventory](#6-component-inventory)
7. [Screens in detail (features & business logic)](#7-screens-in-detail-features--business-logic)
8. [State management](#8-state-management)
9. [REST API layer](#9-rest-api-layer)
10. [UI ↔ API interaction reference](#10-ui--api-interaction-reference)
11. [Data model & entities](#11-data-model--entities)
12. [Security & secrets](#12-security--secrets)
13. [Two data paths: mock vs. live](#13-two-data-paths-mock-vs-live)
14. [Build, run & deploy](#14-build-run--deploy)
15. [Known limits & roadmap signals](#15-known-limits--roadmap-signals)

---

## 1. What the system is

The SEBSA IFS Data Migration Tool is a **web application for migrating master data between two IFS Cloud environments** (a *Source* and a *Destination*). An operator configures the two environments, fetches candidate records from the source, reviews and selects them, then confirms a transfer that writes them into the destination through IFS Cloud's OData REST APIs.

The guiding principle, surfaced throughout the UI: **candidate data, not automatic loading** — data is fetched for review, and a write only happens when the operator explicitly confirms it.

The codebase currently contains **two parallel data paths** (see [§13](#13-two-data-paths-mock-vs-live)):

- A **mock/demo migration wizard** (Dashboard → New Migration 4‑step flow) driven by locally generated sample data — the UX skeleton for the full flow.
- **Live IFS integrations** (SalesPartSet, PartCatalogSet, and PartCatalogSet create) that call a real IFS tenant through server‑side proxy routes.

## 2. Technology stack

| Concern | Choice |
|---|---|
| Framework | **Next.js `^16.3.5`** (App Router) — note the in‑repo [`frontend/AGENTS.md`](../frontend/AGENTS.md) warns this Next.js version has breaking changes vs. older releases |
| UI runtime | **React `^19.3.0`** / react‑dom `^19.3.0` |
| Component library | **MUI (`@mui/material` `^9.4.0`)** + `@mui/icons-material`, integrated via `@mui/material-nextjs` |
| Styling | Emotion (`@emotion/*`) for MUI, plus a hand‑written global stylesheet `app/globals.css` (custom design system: panels, banners, stepper, live‑data layout) |
| Language | JavaScript (JSX), no TypeScript |
| Persistence | Browser `localStorage` + `sessionStorage` only — **no application database** |
| Backend | Next.js **Route Handlers** (`app/api/ifs/**/route.js`) acting as server‑side proxies to IFS Cloud |
| External system | **IFS Cloud** — OAuth2 token endpoint (Keycloak) + OData v4 projections |
| Dev server / port | `next dev -p 5177` (see `package.json`) |
| Deploy target | **Vercel** (`vercel.json` → `framework: nextjs`) |

There is **no test runner and no ESLint config** in the project; `npx next build` is the compile‑time gate.

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (Next.js App Router, all pages 'use client')         │
│                                                               │
│  Screens (app/**/page.jsx)                                    │
│    Login · Dashboard · New Migration wizard ·                 │
│    SalesPartSet · PartCatalogSet                              │
│         │  call helpers                                       │
│         ▼                                                     │
│  Client library (lib/)                                        │
│    auth.js            → demo login/session                    │
│    migrationStore.js  → env config, token cache, URL builders,│
│                         fetch() to our routes, payload shaping│
└───────────────┬───────────────────────────────────────────────┘
                │  fetch('/api/ifs/…', POST, JSON)   (same origin)
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Next.js server — Route Handlers (app/api/ifs/**/route.js)     │
│    authorize · sales-part-set · part-catalog-set ·            │
│    part-catalog-set/create                                    │
│         │  uses server-only helpers                           │
│         ▼                                                     │
│  Server library (lib/server/)                                 │
│    ifsAuth.js   → OAuth2 token exchange (client secret here)  │
│    ifsBatch.js  → OData $batch build & response parse         │
└───────────────┬───────────────────────────────────────────────┘
                │  HTTPS: OAuth2 token POST, then Bearer-auth OData
                ▼
┌─────────────────────────────────────────────────────────────┐
│ IFS Cloud                                                     │
│   • OAuth2 token endpoint (Keycloak realm)                    │
│   • OData v4 projections under                                │
│     {baseUrl}/main/ifsapplications/projection/v1/…            │
└─────────────────────────────────────────────────────────────┘
```

**Why the proxy layer exists.** Every IFS call is routed through the app's own server handlers, never straight from the browser. This (a) keeps the OAuth2 client secret and token exchange server‑side, and (b) avoids the browser's CORS restrictions against IFS. All of our routes are `POST` (even when the upstream IFS call is a GET) because the client sends a JSON body carrying the base URL and either a cached token or the environment config.

**Layer responsibilities**

| Layer | Files | Responsibility |
|---|---|---|
| Screens (UI) | `app/(app)/**/page.jsx`, `app/login/page.jsx` | Rendering, selection, dialogs, result display |
| Client lib | `lib/migrationStore.js`, `lib/auth.js` | URL builders, config/token storage, `fetch` to routes, payload shaping, mock data |
| Route handlers | `app/api/ifs/**/route.js` | Server‑side proxy to IFS |
| Server lib | `lib/server/ifsAuth.js`, `lib/server/ifsBatch.js` | Token exchange; `$batch` build/parse |

`lib/server/*` is **server‑only by convention** — never import it from a `'use client'` file (it is where client secrets are actually used).

## 4. End-to-end data flow

### 4.1 The live migration path (SalesPartSet / PartCatalogSet)

```
1. Configure environment (modal)  → POST /api/ifs/authorize   → OAuth2 token endpoint
     token cached in sessionStorage per role (Source / Destination)

2. Get live data (PartCatalogSet) → POST /api/ifs/part-catalog-set
     route resolves token (cached, or mints one) → GET  …/PartHandling.svc/PartCatalogSet
     records returned → rendered in master/detail list

3. Select records → "Migrate data (N selected)" → confirm dialog (names the $batch URL)
     buildPartCatalogMigrationPayload(selected)  (allow-list field pick)

4. POST /api/ifs/part-catalog-set/create → buildPartCatalogBatch()
     → POST …/PartHandling.svc/$batch  (multipart/mixed, one changeset per part,
       Prefer: odata.continue-on-error)
     → parsePartCatalogBatchResponse() → { successful, failed, unconfirmed }

5. Page renders one green/red/amber line per part; full result logged to console.
```

### 4.2 The mock wizard path (New Migration 4‑step flow)

```
Step 0 Configuration → choose Source & Destination (real env config modal + token test)
Step 1 Select Entities → pick entities (dependency validation, transfer order preview)
Step 2 Review Data     → fetchEntitiesData() generates local mock records; select rows
Step 3 Transfer        → runMigration() records a history entry in localStorage
```

The mock wizard exercises the full UX (config → select → review → transfer) but the fetch and transfer in steps 2–3 are **simulated locally** (`setTimeout` + generators), not IFS calls. The real IFS write lives on the PartCatalogSet screen.

### 4.3 Token lifecycle (shared by all live calls)

- **Test connection** or the first call that needs one → route mints a token via `requestIfsToken()` and hands it back; client caches it in `sessionStorage` under the role key (`Source`/`Destination`), with a 5 s expiry safety margin.
- Subsequent calls send `{ accessToken }` and skip re‑authorization.
- A route replying `tokenInvalid: true` (IFS returned 401) → client calls `clearSessionToken(env)`, so the next call re‑authorizes.

## 5. Routing & screen map

App Router structure (all pages are client components):

| Route | File | Auth | Purpose |
|---|---|---|---|
| `/login` | `app/login/page.jsx` | public | Demo sign‑in |
| `/` | `app/(app)/page.jsx` | protected | Dashboard (stats + migration history) |
| `/new-migration` | `app/(app)/new-migration/page.jsx` | protected | 4‑step migration wizard + env config modal |
| `/new-migration/sales-part-set` | `app/(app)/new-migration/sales-part-set/page.jsx` | protected | Live SalesPartSet viewer + export |
| `/new-migration/part-catalog-set` | `app/(app)/new-migration/part-catalog-set/page.jsx` | protected | Live PartCatalogSet viewer + **migrate (write)** |

Layout hierarchy:

- `app/layout.jsx` (root) — HTML shell, `<ThemeRegistry>`, global metadata/favicon.
- `app/(app)/layout.jsx` — route group wrapping every authenticated page in `<ProtectedRoute><AppShell>…</AppShell></ProtectedRoute>`.
- `/login` lives **outside** the `(app)` group, so it has no shell and no auth guard.

API routes:

| Route | File |
|---|---|
| `POST /api/ifs/authorize` | `app/api/ifs/authorize/route.js` |
| `POST /api/ifs/sales-part-set` | `app/api/ifs/sales-part-set/route.js` |
| `POST /api/ifs/part-catalog-set` | `app/api/ifs/part-catalog-set/route.js` |
| `POST /api/ifs/part-catalog-set/create` | `app/api/ifs/part-catalog-set/create/route.js` |

## 6. Component inventory

### 6.1 Shared components (`components/`)

| Component | Role | Key behavior |
|---|---|---|
| `ThemeRegistry` | MUI + Emotion provider | Wraps app in `AppRouterCacheProvider` + `ThemeProvider`; brand primary `#5B3FD6`, Inter font, `cssVariables: false` |
| `ProtectedRoute` | Client‑side auth guard | On mount, if `!isAuthenticated()` → `router.replace('/login')`; renders `null` until the check passes (prevents protected content flash) |
| `AppShell` | App chrome | Left sidebar: SEBSA logo, nav (Dashboard / New Migration) with active‑route highlighting, "candidate data" notice, session email + Sign out; `<main>` holds the page |
| `MigrationStepper` | Wizard progress | MUI `Stepper` (alternative‑label) styled with the SEBSA brand gradient; custom step icons (Settings → TaskAlt → FactCheck → CloudUpload), check mark on completed steps |

### 6.2 Navigation surfaces

- **Sidebar nav** (`AppShell`): Dashboard, New Migration. Active link derived from `usePathname()`.
- **Stepper** (`MigrationStepper`): Configuration → Select Entities → Review Data → Transfer.
- **In‑page back / refresh toolbars**: on the live‑data screens and the review step.
- **Deep links**: config screen buttons `router.push('/new-migration/<set>?env=Source')`.

### 6.3 UI primitives (from `app/globals.css`)

Not React components, but the shared visual vocabulary every screen composes from: `.panel`, `.cards`/`article` (stat tiles), `.banner`, `.auth-banner` in `success` / `error` / `warning` variants, `.actions` (button rows), `.env-select-btn` with `env-status-{base|success|error}`, `.column-card` (entity picker), `.dependency-panel` / `.dependency-step`, `.live-data-layout` (master/detail), `.record-list` / `.record-submenu`, `.badge`, `.history-list`. Buttons use semantic classes: default (primary), `.secondary`, `.ghost`.

## 7. Screens in detail (features & business logic)

### 7.1 Login — `/login`

**Purpose:** gate the app behind a demo credential.

- Controlled email/password form; submit runs a 350 ms simulated delay then `login(email, password)`.
- `login()` compares against hardcoded demo credentials (`admin@sebsa.com` / `sebsa2026`) and, on success, writes a session object to `sessionStorage` (`sebsa_ifs_migration_session`).
- Success → `router.replace('/')`; failure → inline "Incorrect email or password."
- The demo credentials are printed on the card. **This is a front‑end‑only auth stub** — real auth is expected to arrive with the IFS backend integration (per `lib/auth.js`).

### 7.2 Dashboard — `/`

**Purpose:** landing overview + migration history.

- Reads history from `localStorage` (`getHistory()`) on mount.
- **Stat cards:** Service = "healthy" (static), Total Migrations (`history.length`), Records Migrated (sum of `totalRecords`), Last Migration (date of most recent entry, or `—`).
- **Banner** reiterating the "candidate data, not automatic loading" principle.
- **Recent migrations list:** each history row shows `fromEnv → toEnv`, per‑entity counts, timestamp, and a "Completed" badge. Empty state prompts starting the first migration.
- Primary CTA "Start new migration" → `/new-migration`.
- History is populated **only** by the mock wizard's `runMigration()` (step 3), not by the live PartCatalogSet write.

### 7.3 New Migration wizard — `/new-migration`

The core screen. Local `step` state (0–3) drives which stage renders; `MigrationStepper` reflects it.

#### Step 0 — Configuration
- Two environment selector buttons (Source, Destination), each opening the **env config modal**. Button status class (`base`/`success`/`error`) reflects saved config status; a same‑source‑and‑destination selection forces an error state and blocks "Next".
- **Environment config modal** (MUI `Dialog`) — this is a **real IFS auth surface**:
  - Fields: Base URL, Authorization path, Grant type (`client_credentials` | `password`), Client ID, Client secret, and Username/Password (shown only for the password grant).
  - **Auth‑path autofill:** typing the Base URL suggests `{origin}/auth/realms/{YourNamespace}/protocol/openid-connect/token` (via `suggestAuthPath`), and keeps following the Base URL until the user hand‑edits the path (a manual path is never overwritten).
  - **Test connection** → `testEnvironmentConnection()` → `POST /api/ifs/authorize`. On success, caches a session token and shows a token preview + expiry; on failure, shows the error banner.
  - **Save & use environment** persists the config (with derived `status`) to `localStorage` and sets the display label to the Base URL host. Blocks closing if the chosen environment collides with the other role.
  - Duplicate‑environment guard: warns if the same host is already the other role.
- **Get live data** buttons (SalesPartSet / PartCatalogSet) deep‑link to the live viewers with `?env=Source` (enabled once a source is chosen).
- **Next** (enabled when Source & Destination are set and differ) → step 1.

#### Step 1 — Select Entities
- Entities are grouped **Mandatory** (Company, Site) and **Basic** (Customer, Master Part, Supplier, Inventory Locations); rendered as toggle cards. Already‑transferred entities (scoped to the current `from→to` pair, from history) get a "transferred" style.
- **Dependency validation:** each entity declares `dependsOn`; selecting an entity without its prerequisites selected produces a blocking error message (e.g. "Customer requires Company, Site to be selected").
- **Transfer order panel:** `computeTransferOrder()` does a depth‑first flatten of selected entities + prerequisites into an ordered, numbered sequence (a hardcoded stand‑in for real cross‑entity validation).
- **Fetch Data** (enabled when ≥1 entity selected and no dependency issues) → `fetchGroup()` generates mock records for the selection, pre‑selects all rows (and all sub‑items where present), then → step 2.

#### Step 2 — Review Data
- Toolbar: Back, Refresh (re‑fetch), and a "N records found" count.
- Summary line: "X of Y records selected for transfer across N entities."
- **Master/detail review** (`renderEntityReview`): left sidebar lists fetched entities with counts; center is a checkbox record list (with Select all / Deselect all, per‑row expand for sub‑menus like Address/Contact/Communication Method on Customer); clicking a row opens a right‑hand field‑detail panel using `visibleRecordFields()`.
- **Transfer N records to IFS** (enabled when ≥1 record selected) → `handleTransfer()`.

#### Step 3 — Transfer (result)
- `runMigration(fromEnv, toEnv, breakdown)` computes the per‑entity breakdown of selected counts, records a **history entry** in `localStorage` (capped at 25), and resolves after a simulated delay.
- Result panel: "Completed" badge, summary of records/entities/timestamp, per‑entity counts, and CTAs "Back to dashboard" / "Start another transfer" (`resetAll()`).

> **Important:** In the current build, steps 2–3 operate on **locally generated mock data** and simulated transfer. The genuine IFS write is on the PartCatalogSet screen (§7.5).

### 7.4 Live SalesPartSet viewer — `/new-migration/sales-part-set`

**Purpose:** fetch and browse real SalesPartSet rows from the source; export a migration‑shaped payload.

- Reads `?env=` (default `Source`), builds the GET URL for display, calls `fetchLiveSalesParts(env, config)` on mount and on Refresh.
- **Master/detail layout:** left = selectable record list (Select all / Deselect all, N‑of‑M counter); each row is titled by its first **non‑empty** field (leading IFS fields like `Objgrants` are often null); right = full field detail via `visibleRecordFields()` (internal OData fields hidden, labels humanized).
- **Migrate data (N selected):** builds the payload with `buildSalesPartMigrationPayload()` (allow‑list of `SALES_PART_MIGRATION_FIELDS`) and **downloads it as a JSON file** — it does **not** post to IFS. (SalesPart create is not yet wired to a route.)
- States: loading ("Authorizing and fetching…"), error banner (from `result.error`), empty ("No records returned").

### 7.5 Live PartCatalogSet viewer + migrate — `/new-migration/part-catalog-set`

**Purpose:** fetch real PartCatalogSet rows from the source **and write selected parts to the destination** — the one true live write in the app.

- Same fetch/master‑detail pattern as SalesPartSet (`fetchLivePartCatalog`, `visibleRecordFields`, non‑empty‑title heuristic).
- **Migrate data (N selected):**
  1. `handlePostClick()` builds the destination `$batch` URL and opens a **confirm dialog** naming the exact URL and count (guards against writing with no destination Base URL configured).
  2. `handleConfirmPost()` → `postPartCatalogParts(DEST_ENV, destConfig, selectedParts())`, where `selectedParts()` runs `buildPartCatalogMigrationPayload()` (allow‑list `PART_CATALOG_MIGRATION_FIELDS`, always an array).
  3. → `POST /api/ifs/part-catalog-set/create`.
- **Result rendering:** a summary line (submitted / created / failed / unconfirmed), then one banner per part — green (`successful`, with status), red (`failed`, with IFS message), amber (`unconfirmed`, "may or may not have been created; check the destination before retrying"). The full result object is also `console.log`‑ged.
- Writes target the **Destination** environment (`DEST_ENV`) and its separate cached token — distinct from the Source used for reads.

## 8. State management

**No global state library** (no Redux/Zustand/Context beyond MUI theme). State lives in three tiers:

| Tier | Mechanism | Examples |
|---|---|---|
| Ephemeral UI state | React `useState`/`useEffect` per page | `step`, `selectedEntities`, `selectedRecordIds` (Sets), `expandedRecords`, dialog open flags, `loading`, `result`, `postResult` |
| Session state | `sessionStorage` | Login session (`sebsa_ifs_migration_session`); IFS access tokens per role (`sebsa_ifs_session_tokens`) — cleared when the tab/session ends |
| Durable local state | `localStorage` | Environment configs (`sebsa_ifs_env_config`); migration history (`sebsa_ifs_migration_history`, capped at 25) |

Storage keys and accessors are centralized in `lib/migrationStore.js` (env config, session token, history) and `lib/auth.js` (login session). All storage access is guarded with `typeof window === 'undefined'` for SSR safety.

**Cross‑screen coupling** happens through storage, not props: e.g. the config modal writes an env config that the live‑data screens read via `getEnvironmentConfig(env)`; a token minted on one screen is reused on another via `getSessionToken(env)`.

## 9. REST API layer

All four routes are Next.js Route Handlers exporting `async function POST(request)` and returning `Response.json(...)`. Full contract in [`IFS_API_INTEGRATION.md` §4](IFS_API_INTEGRATION.md). Summary:

### 9.1 `POST /api/ifs/authorize`
- **In:** the environment config (base URL, authPath, grantType, clientId/secret, username/password).
- **Does:** `requestIfsToken()` → OAuth2 token exchange against the configured authorization path.
- **Out:** `{ success, accessToken, tokenType, expiresIn }` or `{ success:false, error }` with a mirrored status (400/401/502).

### 9.2 `POST /api/ifs/sales-part-set` (GET proxy)
- **In:** `{ baseUrl, accessToken? | config? }`.
- **Does:** resolve token (cached or mint) → `GET …/SalesPartHandling.svc/SalesPartSet` with `Bearer` auth and `cache: 'no-store'`; unwraps OData (`value` / `d.results`).
- **Out:** `{ success, records, token }` (token non‑null only if freshly minted) or failure with `tokenInvalid` on a 401.

### 9.3 `POST /api/ifs/part-catalog-set` (GET proxy)
- Same shape as 9.2 against `…/PartHandling.svc/PartCatalogSet`, but returns the **raw** body as `response` (plus `url`, `status`); the client extracts records. This lets the client log the full response.

### 9.4 `POST /api/ifs/part-catalog-set/create` (`$batch` write)
- **In:** `{ baseUrl, records:[…], accessToken? | config? }`.
- **Does:** `buildPartCatalogBatch()` → one multipart/mixed `$batch` with one changeset per part → `POST …/PartHandling.svc/$batch` (`Prefer: odata.continue-on-error`) → `parsePartCatalogBatchResponse()`.
- **Out:** `{ success, url, batchStatus, summary{totalSubmitted, locallySkipped, successful, failed, unconfirmed}, successful[], failed[], unconfirmed[], token }`. A whole‑batch rejection (non‑2xx, non‑multipart) is returned as an error, with `tokenInvalid` on 401.

### 9.5 Server helpers
- **`lib/server/ifsAuth.js` — `requestIfsToken()` / `IfsAuthError`:** posts `x-www-form-urlencoded` credentials to the token endpoint (adds `username`/`password` for the password grant); resolves relative auth paths against `baseUrl`/`fallbackOrigin`. Throws `IfsAuthError(status, message)` for missing config (400), rejected credentials (401), or unreachable endpoint (502).
- **`lib/server/ifsBatch.js` — `buildPartCatalogBatch()` / `parsePartCatalogBatchResponse()`:** pure functions (no network, no secrets). Local validation requires a non‑empty string `PartNo`; invalid records go to `skipped` (reported failed). Response parsing matches per‑part responses by `Content-ID` and buckets each into successful / failed / unconfirmed. This is a faithful port of two Postman scripts (byte‑identical request body, matching classification).

## 10. UI ↔ API interaction reference

How each UI action maps to a client helper, a route, and an IFS endpoint. IFS paths are under `{baseUrl}/main/ifsapplications/projection/v1/`.

| UI action (screen) | Client helper (`migrationStore.js`) | Our route | IFS endpoint | Env |
|---|---|---|---|---|
| Test connection (config modal) | `testEnvironmentConnection` | `/api/ifs/authorize` | OAuth2 token endpoint (authPath) | the one being configured |
| Get live data — SalesPartSet | `fetchLiveSalesParts` | `/api/ifs/sales-part-set` | `SalesPartHandling.svc/SalesPartSet` (GET) | Source |
| Get live data — PartCatalogSet | `fetchLivePartCatalog` | `/api/ifs/part-catalog-set` | `PartHandling.svc/PartCatalogSet` (GET) | Source |
| Migrate data (PartCatalogSet) | `postPartCatalogParts` | `/api/ifs/part-catalog-set/create` | `PartHandling.svc/$batch` (POST) | Destination |
| Migrate data (SalesPartSet) | `buildSalesPartMigrationPayload` (client only) | — | — (downloads JSON file) | — |
| Fetch Data / Transfer (wizard steps 2–3) | `fetchEntitiesData`, `runMigration` (mock) | — | — (local simulation) | — |

**Payload structures**

- **Request to our routes:** `{ baseUrl, accessToken? | config?, …route-specific }`. `accessToken` present when a valid token is cached; otherwise `config` is sent and the route mints one.
- **Success response:** `{ success:true, …data, token: null | {accessToken, tokenType, expiresIn} }`.
- **Failure response:** `{ success:false, error, tokenInvalid?:true }`. Client helpers never throw — they normalize everything to `{ success, … }`; pages branch on `result.success` and show `result.error`.

**State management around calls (every live helper follows the same rule)**
1. Read `getSessionToken(env)`; if valid, send `{ accessToken }`, else `{ config }`.
2. On success, if the route returned a fresh `token`, `setSessionToken(env, token)`.
3. On `tokenInvalid`, `clearSessionToken(env)` so the next call re‑authorizes.

**Field shaping** — before display, `visibleRecordFields()` drops internal OData fields (matching `^[@$]` or the hidden‑name set: `objid`, `objversion`, `rowversion`, `objstate`, `luname`, `keyref`, `stateindicator`) and humanizes labels (`PartNo → "Part No"`). Before a write, an **allow‑list** picks and orders exactly the fields the destination expects (`PART_CATALOG_MIGRATION_FIELDS` / `SALES_PART_MIGRATION_FIELDS`); a field absent from the source record is omitted, not defaulted.

## 11. Data model & entities

### 11.1 Wizard entities (`AVAILABLE_ENTITIES`, mock)

Each entity declares: `id`, `label`, `description`, `group` (`mandatory`/`basic`), `dependsOn`, `defaultCount`, `idKey`, `rowPrimary`, `rowSecondary`, optional `subMenu`, and a mock `generator`.

| Entity | Group | Depends on | Default count | Sub‑menu |
|---|---|---|---|---|
| Company | mandatory | — | 12 | — |
| Site | mandatory | Company | 8 | — |
| Customer | basic | Company, Site | 58 | Address, Contact, Communication Method |
| Master Part | basic | Company, Site, Customer | 42 | — |
| Supplier | basic | Company, Site | 27 | — |
| Inventory Locations | basic | Company, Site | 20 | — |

Mock records are generated in memory (`fetchEntitiesData` with a 900 ms delay); the transfer (`runMigration`, 1400 ms delay) writes a history entry. **These are not IFS entities yet** — they are the UX model for the intended flow.

### 11.2 Live IFS entities

- **SalesPartSet** (`SalesPartHandling.svc`) — read + client‑side export. Migration payload: `SALES_PART_MIGRATION_FIELDS` (~45 fields, e.g. `Contract`, `CatalogNo`, `PartNo`, pricing, UoM).
- **PartCatalogSet** (`PartHandling.svc`) — read + `$batch` create. Migration payload: `PART_CATALOG_MIGRATION_FIELDS` (~60 fields, keyed on `PartNo`; includes serial/lot tracking, warranty, weight/volume, `*Exist` flags, `LuName`/`KeyRef`).

Allow‑lists come from known‑good sample POST bodies; if IFS rejects a read‑only field, remove it from the list.

### 11.3 Environment config record (`DEFAULT_ENV_CONFIG`)

`{ baseUrl, authPath, grantType, clientId, clientSecret, username, password, status('unconfigured'|'authorized'|'error'), lastError, lastTestedAt }`, stored per fixed role key (`Source` / `Destination`).

## 12. Security & secrets

- **Auth is a demo stub.** `lib/auth.js` compares against hardcoded credentials and stores a plain session object in `sessionStorage`. `ProtectedRoute` guards client‑side only (no server enforcement). This is explicitly a placeholder for real auth arriving with the backend.
- **Secrets handling.** The IFS client secret and password are typed into the browser and stored in `localStorage` as part of the environment config. They are sent to our **own** routes only when a token must be minted; the token request to IFS happens **server‑side** so the secret never leaves in a browser‑to‑IFS call and isn't in the client bundle. This is **not a secrets vault** — treat accordingly.
- **Tokens** live only in `sessionStorage` (per role, 5 s expiry margin), never in `localStorage`, and clear on session end.
- **`cache: 'no-store'`** on every server‑side `fetch` — required, since Next.js caches server GET `fetch()` by default (a stale snapshot bug was hit without it).
- **CORS avoidance** is a core reason for the proxy layer; the browser never calls IFS directly.

## 13. Two data paths: mock vs. live

A key thing for UI developers to internalize — the app currently blends two paths:

| | Mock wizard (steps 1–3) | Live IFS screens |
|---|---|---|
| Data source | `fetchEntitiesData()` generators | Real IFS OData projections |
| Entities | Company/Site/Customer/… (`AVAILABLE_ENTITIES`) | SalesPartSet, PartCatalogSet |
| Transfer | `runMigration()` → localStorage history | `$batch` POST to IFS (PartCatalogSet only) |
| Real network | No (except the config modal's token test) | Yes |
| Dashboard history | Populated by `runMigration` | Not recorded |

The shared surfaces are the **environment config modal** (real token exchange for both) and the **master/detail review UI pattern**. Aligning UI work means, in most cases, migrating the wizard's steps 2–3 onto the live GET/`$batch` pattern the SalesPartSet/PartCatalogSet screens already demonstrate.

## 14. Build, run & deploy

- **Install/run:** `npm install`, then `npm run dev` (dev server on **port 5177**). Build with `npm run build` (`next build`), serve with `npm start`.
- **Verification gate:** `npx next build` confirms compilation and that routes register; there is no test runner or lint config. For live‑route testing without a real tenant, see [`IFS_API_INTEGRATION.md` §9](IFS_API_INTEGRATION.md) (mock IFS server recipe).
- **Deploy:** Vercel (`vercel.json`, `framework: nextjs`).
- **Next.js caveat:** `frontend/AGENTS.md` warns this Next.js version diverges from older docs; consult `node_modules/next/dist/docs/` before route/API changes.

## 15. Known limits & roadmap signals

From the code and [`IFS_API_INTEGRATION.md` §11](IFS_API_INTEGRATION.md):

- **Wizard steps 2–3 are mock** — not yet wired to live IFS reads/writes.
- **SalesPart create** is export‑to‑file only; no create route yet.
- **No pagination** — `@odata.nextLink` isn't followed; a paged projection returns only the first page.
- **No `$batch` chunking** — all selected parts go in one request; IFS may cap batch size.
- **No idempotency** — re‑migrating a part returns "already exists" (shown as failed).
- **`unconfirmed` ≠ failed** — means IFS gave no identifiable per‑part answer; check the destination before retrying.
- **Batch builder is PartCatalog‑specific** — `PartNo` key and `POST PartCatalogSet` request line are hardcoded; parameterize for a second entity.
- **Duplicated token‑resolution boilerplate** across routes — a shared `resolveAccessToken()` would DRY it up.
- **Auth is a front‑end stub** — real auth expected with the backend integration.
