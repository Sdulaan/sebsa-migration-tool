# IFS Cloud API Integration Guide

Reference for how this app talks to IFS Cloud, and a recipe for adding new **GET** and **POST** integrations by copying the patterns that already exist.

All paths are relative to the repo root. App code lives under `frontend/`.

## Contents

1. [Architecture](#1-architecture)
2. [Existing integrations](#2-existing-integrations)
3. [Authentication](#3-authentication)
4. [The route contract](#4-the-route-contract)
5. [GET pattern](#5-get-pattern)
6. [POST pattern ($batch)](#6-post-pattern-batch)
7. [Adding a new GET](#7-adding-a-new-get)
8. [Adding a new POST](#8-adding-a-new-post)
9. [Testing without a real IFS tenant](#9-testing-without-a-real-ifs-tenant)
10. [Gotchas](#10-gotchas)
11. [Status and known limits](#11-status-and-known-limits)

---

## 1. Architecture

```
Browser (React page)
   │  fetch('/api/ifs/...', POST, JSON body)
   ▼
Next.js route handler  (frontend/app/api/ifs/**/route.js)     ← runs on the server
   │  1. resolve an access token (cached one from the client, or mint a new one)
   │  2. call IFS with  Authorization: Bearer <token>
   ▼
IFS Cloud  (OAuth2 token endpoint + OData projections)
```

Every IFS call goes through one of our own route handlers, never straight from the browser. That keeps the OAuth2 token exchange and the IFS calls server-side, and avoids the browser's CORS restrictions on IFS.

Our routes are all `POST`, even when the upstream IFS call is a `GET`, because the client sends a JSON body (the base URL, plus a token or the environment config).

**Layers, and where each lives**

| Layer | File | Responsibility |
|---|---|---|
| Page (UI) | `frontend/app/(app)/new-migration/**/page.jsx` | Buttons, selection, confirm dialog, result display |
| Client helper | `frontend/lib/migrationStore.js` | URL builders, config and token storage, `fetch` to our routes, payload shaping |
| Route handler | `frontend/app/api/ifs/**/route.js` | Server-side proxy to IFS |
| Server helpers | `frontend/lib/server/ifsAuth.js`, `frontend/lib/server/ifsBatch.js` | Token exchange; `$batch` build and parse |

`frontend/lib/server/*` is server-only by convention. Never import it from a `'use client'` file.

## 2. Existing integrations

| Purpose | Client helper | Our route | IFS endpoint (under `{baseUrl}/main/ifsapplications/projection/v1/`) | Authorized by |
|---|---|---|---|---|
| Get a token / test connection | `testEnvironmentConnection` | `/api/ifs/authorize` | the environment's configured **authorization path** (OAuth2 token endpoint) | the environment being configured |
| **GET** SalesPartSet | `fetchLiveSalesParts` | `/api/ifs/sales-part-set` | `SalesPartHandling.svc/SalesPartSet` | Source |
| **GET** PartCatalogSet | `fetchLivePartCatalog` | `/api/ifs/part-catalog-set` | `PartHandling.svc/PartCatalogSet` | Source |
| **POST** parts to PartCatalogSet | `postPartCatalogParts` | `/api/ifs/part-catalog-set/create` | `PartHandling.svc/$batch` | Destination |

Pages: `/new-migration/sales-part-set` and `/new-migration/part-catalog-set` (the latter has the "Migrate data" button that does the POST).

## 3. Authentication

### Environment config

Each environment role has one saved config, stored in `localStorage` under `sebsa_ifs_env_config`. The roles are fixed constants, not user-entered names:

```js
export const SOURCE_ENV = 'Source'
export const DEST_ENV = 'Destination'
```

Config fields (`DEFAULT_ENV_CONFIG` in `migrationStore.js`): `baseUrl`, `authPath`, `grantType` (`client_credentials` or `password`), `clientId`, `clientSecret`, `username`, `password`, plus `status`, `lastError`, `lastTestedAt`.

Read it with `getEnvironmentConfig(SOURCE_ENV | DEST_ENV)`.

### Token exchange (server-side)

`requestIfsToken()` in `frontend/lib/server/ifsAuth.js` POSTs `application/x-www-form-urlencoded` to the authorization path (`grant_type`, `client_id`, `client_secret`, and `username`/`password` for the password grant) and returns:

```js
{ accessToken, tokenType, expiresIn }
```

The authorization path may be absolute, or relative (resolved against `baseUrl`, falling back to `fallbackOrigin`). Failures throw `IfsAuthError(status, message)`:

| Status | Cause |
|---|---|
| 400 | Missing authorization path / client ID / client secret, or an invalid path or base URL |
| 401 | The identity provider rejected the credentials |
| 502 | The authorization endpoint could not be reached |

### Session token cache (client-side)

After "Test connection", or the first call that has to mint one, the token is cached in `sessionStorage` (key `sebsa_ifs_session_tokens`), **per environment role**. It is cleared when the tab or session ends, and is kept apart from the config in `localStorage`.

```js
getSessionToken(env)    // token entry, or null if missing or expired (5 s safety margin)
setSessionToken(env, t) // cache a token
clearSessionToken(env)  // drop a stale one
```

Every client helper follows the same rule:

- A valid cached token exists → send `{ accessToken }` and skip authorization.
- Otherwise → send `{ config }` and let the route mint a token, then cache the `token` the route hands back.
- The route answers `tokenInvalid: true` (IFS returned 401) → the helper calls `clearSessionToken(env)`, so the next call re-authorizes.

## 4. The route contract

**Request body** (every data route)

```jsonc
{
  "baseUrl": "https://ifs.example.com",
  "accessToken": "…",        // present when the client has a valid cached token
  "config": { /* env config */ }, // present instead of accessToken when it doesn't
  // …plus route-specific payload, e.g. "records": [ … ]
}
```

**Response body**

```jsonc
// success
{ "success": true, /* route-specific data */, "token": null | { "accessToken", "tokenType", "expiresIn" } }

// failure
{ "success": false, "error": "human-readable message", "tokenInvalid": true /* only on a 401 from IFS */ }
```

`token` is non-null only when the route had to mint a new token, so the client should cache it.

**HTTP status** mirrors what went wrong:

| Status | Meaning |
|---|---|
| 400 | Missing `baseUrl`, nothing to send, or an auth-config problem |
| 401 | Authorization failed (or IFS returned 401) |
| 502 | IFS or the authorization endpoint could not be reached |
| other | IFS's own status, passed through |

Client helpers turn every outcome into `{ success, ... }` and never throw. Pages branch on `result.success` and show `result.error`.

## 5. GET pattern

Reference implementations: `frontend/app/api/ifs/sales-part-set/route.js` and `frontend/app/api/ifs/part-catalog-set/route.js`.

### URL builder (`migrationStore.js`)

One per endpoint. The IFS Cloud path includes `/main/`. Always strip trailing slashes from the base URL:

```js
export function buildPartCatalogSetUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/PartHandling.svc/PartCatalogSet`
}
```

### Route (server)

```js
import { requestIfsToken, IfsAuthError } from '../../../../lib/server/ifsAuth'
import { buildXUrl } from '../../../../lib/migrationStore'

export async function POST(request) {
  const body = await request.json().catch(() => null)

  let dataUrl
  try {
    dataUrl = buildXUrl(body?.baseUrl)
  } catch {
    return Response.json({ success: false, error: 'Missing Base URL — configure it in "Configure source environment".' }, { status: 400 })
  }

  // Use the client's cached token, or mint one from the environment config.
  let accessToken = body?.accessToken
  let token = null
  if (!accessToken) {
    try {
      token = await requestIfsToken({ ...(body?.config || {}), fallbackOrigin: dataUrl })
      accessToken = token.accessToken
    } catch (err) {
      const status = err instanceof IfsAuthError ? err.status : 500
      return Response.json({ success: false, error: err.message }, { status })
    }
  }

  try {
    const res = await fetch(dataUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store' // REQUIRED — see Gotchas
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return Response.json(
        { success: false, error: `X request failed (${res.status}). ${data?.message || ''}`.trim(), tokenInvalid: res.status === 401 },
        { status: res.status }
      )
    }
    // OData v4 wraps rows in `value`; v2 in `d.results`.
    const records = data?.value || data?.d?.results || (Array.isArray(data) ? data : [])
    return Response.json({ success: true, records, token })
  } catch (err) {
    return Response.json({ success: false, error: `Could not reach X: ${err.message}` }, { status: 502 })
  }
}
```

Route files sit at `app/api/ifs/<name>/route.js`, so the import path to `lib/` is `../../../../lib/…`. A nested route (`<name>/create/route.js`) needs one more `../`.

The two existing GET routes differ slightly: `sales-part-set` unwraps and returns `records`; `part-catalog-set` returns the raw body as `response` and the client helper unwraps it. Either works; for a new route, returning `records` keeps the client simpler.

### Client helper (`migrationStore.js`)

```js
export async function fetchLiveX(env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        ...(cached ? { accessToken: cached.accessToken } : { config })
      })
    })
    const body = await res.json()
    if (!res.ok || !body.success) {
      if (body.tokenInvalid) clearSessionToken(env)
      return { success: false, error: body.error || `Request failed (${res.status}).` }
    }
    if (body.token) setSessionToken(env, body.token)
    return { success: true, records: body.records || [] }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
```

### Page

`frontend/app/(app)/new-migration/part-catalog-set/page.jsx` is the template. It has a header showing the exact `GET` URL, a master/detail list with checkboxes, and loading / error / empty states. It takes the environment from `?env=` (default `SOURCE_ENV`), builds its URL and calls the helper in `load()`, and uses `visibleRecordFields()` to hide internal OData fields (`objid`, `objversion`, `@odata.*`, …) and humanize labels.

## 6. POST pattern ($batch)

Reference implementation: `frontend/app/api/ifs/part-catalog-set/create/route.js`, `frontend/lib/server/ifsBatch.js`, and `postPartCatalogParts` in `migrationStore.js`.

Records are created by sending **one OData `$batch` request** to the projection's `$batch` endpoint, with **one changeset per record**. That lets IFS accept some records and reject others in the same call.

The request and response handling is a port of two Postman scripts (a pre-request script that builds the batch and a test script that reads the reply). `ifsBatch.js` was checked against those scripts (identical request body, identical classification output). If the Postman scripts change, port the change into `ifsBatch.js`.

### End to end

```
Page: user checks records → "Migrate data (N selected)" → confirm dialog (shows the $batch URL)
  │  selectedParts() = buildPartCatalogMigrationPayload(selected)   (allow-list, see below)
  ▼
postPartCatalogParts(DEST_ENV, destConfig, parts)
  │  POST /api/ifs/part-catalog-set/create   { baseUrl, records, accessToken | config }
  ▼
Route: resolve token → buildPartCatalogBatch(records) → POST {baseUrl}/…/PartHandling.svc/$batch
  │  → parsePartCatalogBatchResponse(...) → { successful, failed, unconfirmed }
  ▼
Page: one green / red / amber line per part, and the full result logged to the browser console
```

### Payload shaping (allow-list)

`PART_CATALOG_MIGRATION_FIELDS` is the exact list and order of fields the destination's POST body takes. `buildPartCatalogMigrationPayload(records)` picks those fields from each source record:

```js
export function buildPartCatalogMigrationPayload(records) {
  return records.map((record) => {
    const picked = {}
    PART_CATALOG_MIGRATION_FIELDS.forEach((key) => {
      if (key in record) picked[key] = record[key]
    })
    return picked
  })
}
```

A key the source record doesn't contain is **omitted**, not filled with a placeholder. `null` values are kept as they are. The result is always an **array**, even for one record (the batch builder requires an array).

### The batch request

`buildPartCatalogBatch(records)` returns `{ body, boundary, recordMap, skipped }`.

- **Local validation**: a record must be a plain object with a non-empty string `PartNo`. Anything else goes into `skipped` (reported as failed) and is left out of the batch.
- Each valid record becomes its own changeset with `Content-ID = index + 1`. A skipped record still uses up its index, so ids can have gaps.
- `recordMap` maps `Content-ID → { PartNo, originalIndex, record }` and is used to match the response back.
- `body` is `null` when nothing valid is left; the route then answers 400.

Wire format (lines joined with `\r\n`):

```
--batch_<suffix>
Content-Type: multipart/mixed; boundary=changeset_<suffix>_1

--changeset_<suffix>_1
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: 1

POST PartCatalogSet HTTP/1.1
Content-Type: application/json
Accept: application/json

{"PartNo":"A1", …}

--changeset_<suffix>_1--
--batch_<suffix>
…next changeset…
--batch_<suffix>--
```

The request line inside a changeset (`POST PartCatalogSet HTTP/1.1`) is **relative to the projection root**, so the entity set must belong to the same `.svc` as the `$batch` URL.

Request headers sent to IFS:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |
| `Content-Type` | `multipart/mixed; boundary=batch_<suffix>` |
| `Accept` | `multipart/mixed` |
| `Prefer` | `odata.continue-on-error` (keep processing the other changesets when one is rejected) |

### The batch response

`parsePartCatalogBatchResponse(text, contentType, recordMap, skipped)` sorts every submitted record into one of three buckets:

| Bucket | Meaning |
|---|---|
| `successful` | The record's individual response has a 2xx status |
| `failed` | Non-2xx status (with IFS's `"message"`), or rejected by local validation |
| `unconfirmed` | IFS returned nothing identifiable for the record, so it is **unknown** whether it was created |

How it parses:

1. Only if the response `Content-Type` is `multipart/mixed`.
2. Splits on `Content-Type: application/http`; each piece is one individual response.
3. Reads `Content-ID` (matched to `recordMap`) and the `HTTP/1.1 <status>` line.
4. For status ≥ 300 it extracts the first `"message":"…"` from the JSON error body.

It depends on IFS echoing `Content-ID` on every per-record response. A record whose response lacks one lands in `unconfirmed`, not `failed`.

### Route responses (`/api/ifs/part-catalog-set/create`)

Success (`200`), even when some records failed:

```jsonc
{
  "success": true,
  "url": "https://…/PartHandling.svc/$batch",
  "batchStatus": 200,
  "summary": { "totalSubmitted": 4, "locallySkipped": 1, "successful": 2, "failed": 2, "unconfirmed": 1 },
  "successful":  [{ "PartNo": "A1", "status": 201 }],
  "failed":      [{ "PartNo": "DUP", "status": 400, "error": "…", "record": { } },
                  { "index": 3, "PartNo": "Unknown", "error": "Missing or invalid PartNo", "record": { } }],
  "unconfirmed": [{ "PartNo": "ORPHAN", "index": 2, "record": { }, "error": "No identifiable individual response" }],
  "token": null
}
```

`totalSubmitted` counts only records actually sent; the page shows `totalSubmitted + locallySkipped` as "submitted".

Failure (`success: false`):

| Case | Status |
|---|---|
| `records` empty or missing | 400 |
| No `baseUrl` | 400 |
| Nothing valid to send (the message lists the reasons) | 400 |
| The whole batch was rejected (a non-2xx, non-multipart reply, e.g. bad token or malformed request) | IFS's status |
| A 401 from IFS | 401 with `tokenInvalid: true` (the client clears its cached token and the message says to re-test the connection) |
| IFS unreachable | 502 |

A rejected batch is reported as an error, not as a list of "unconfirmed" records.

### UI conventions

- Writing to the destination is gated behind a **confirm dialog** that names the exact `$batch` URL and the record count.
- The button is disabled while posting (label switches to "Migrating…") and when nothing is selected.
- Results use the existing banner styles: `auth-banner success` (green), `auth-banner error` (red), and `auth-banner warning` (amber, for unconfirmed).

### Plain (non-batch) POST

Not used by the app today, but simple if an endpoint doesn't need batching: `POST {entitySetUrl}` with `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/json`, and the record as the JSON body. IFS typically answers `201` with the created entity, or an error body shaped like `{ "error": { "code", "message" } }`. Loop over the records on the server and collect a per-record result. Stop on a 401, because every later call would fail the same way.

## 7. Adding a new GET

1. **URL builder** in `migrationStore.js`: `buildXUrl(baseUrl)` (copy `buildPartCatalogSetUrl`; change the `.svc` and entity set).
2. **Route** at `frontend/app/api/ifs/<name>/route.js` (copy the template in §5). Keep `cache: 'no-store'`.
3. **Client helper** `fetchLiveX(env, config)` in `migrationStore.js` (copy the template in §5).
4. **Page** at `frontend/app/(app)/new-migration/<name>/page.jsx` (copy `part-catalog-set/page.jsx`; swap the URL builder and helper).
5. **Entry point**: a button that does `router.push('/new-migration/<name>?env=Source')` (see the existing "Get live data" buttons on the Configuration step in `new-migration/page.jsx`).
6. Verify (§9).

If the endpoint is on the **destination**, use `DEST_ENV` for the token and config.

## 8. Adding a new POST

1. **Allow-list**: `X_MIGRATION_FIELDS` and `buildXMigrationPayload(records)` in `migrationStore.js` (copy the PartCatalog pair). Get the exact field list from a known-good sample POST body.
2. **Batch URL builder** if it's a new projection: `buildYBatchUrl(baseUrl)` → `…/<Projection>.svc/$batch`. Each projection has its own `$batch`.
3. **Batch logic**: copy `buildPartCatalogBatch` and `parsePartCatalogBatchResponse` from `frontend/lib/server/ifsBatch.js`. Three things are entity-specific:
   - the request line (`POST PartCatalogSet HTTP/1.1`) → your entity set,
   - the key validated in `validateRecord` (`PartNo`) → your key field,
   - the key copied into `recordMap` and the result buckets (`PartNo`).

   (These could be turned into parameters once a second entity needs them.)
4. **Route** at `frontend/app/api/ifs/<name>/create/route.js` (copy `part-catalog-set/create/route.js`). Remember the extra `../` in the import paths.
5. **Client helper** (copy `postPartCatalogParts`).
6. **UI**: a button that builds the payload from the selection, opens a **confirm dialog**, calls the helper, then renders the successful / failed / unconfirmed lines (copy from `part-catalog-set/page.jsx`).
7. Verify (§9).

## 9. Testing without a real IFS tenant

There is no test runner or ESLint config in the project. `npx next build` confirms everything compiles and that routes are registered. Beyond that, the approach used so far:

1. **Mock IFS server** (a few dozen lines of Node, `node:http`):
   - `POST /auth/token` → `{ access_token, token_type, expires_in }`
   - the data endpoint, checking the `Authorization` header and returning realistic success, error and 401 responses
   - for `$batch`: parse the multipart request, then answer with a `multipart/mixed` body containing a mix of 201, 400-with-error-JSON, and a part with **no** `Content-ID` (to exercise `unconfirmed`)
2. Run the built app (`npx next build`, then `npx next start -p <free port>`) and `curl` the route with `baseUrl` pointing at the mock and `config.authPath` set to the mock's token URL. Cover: minted token, cached token, a stale token (expect `tokenInvalid`), empty or invalid input, missing `baseUrl`.
3. **Check the mock saw what you expect**: URL path, `Authorization`, `Content-Type`, `Accept`, `Prefer`, and the request body.
4. **Prove a port is faithful to a Postman script**: run the script in Node with a stubbed `pm` object (`pm.request.body`, `pm.request.headers.upsert`, `pm.collectionVariables.get/set`, `pm.response.text/headers/code`). Pin `Date.now` and `Math.random`, feed identical input to the script and to the port, and assert byte-identical output.
5. Stop the mock and test servers when done (kill by port, and avoid the dev server on 5177).

## 10. Gotchas

- **`cache: 'no-store'` on every server-side `fetch`.** Next.js caches server-side GET `fetch()` calls by default. Without it the app served a stale 26-record snapshot while IFS actually had 52.
- **The `/main/` prefix is part of the path** (`{baseUrl}/main/ifsapplications/projection/v1/…`). Builders strip trailing slashes from the base URL first.
- **`$batch` contains a literal `$`.** In a JS template string, `…svc/$batch` is fine (only `${` starts an interpolation).
- **The authorization path is separate config from the Base URL.** The Base URL is used only to resolve the authorization path when that path is relative.
- **Source vs. destination.** GETs use the Source environment; the POST uses Destination. They are separate configs with separate cached tokens. Passing the wrong `env` silently uses the wrong tenant.
- **No idempotency.** Migrating the same part twice returns "already exists" errors from IFS for the second run (shown as failed).
- **`unconfirmed` is not `failed`.** It means "IFS gave no identifiable answer". Check the destination before retrying.
- **Read-only fields in POST bodies.** The current allow-list (from a known-good sample) includes fields such as `LuName`, `KeyRef` and the `*Exist` flags. If a real POST rejects a field, remove it from the allow-list.
- **Secrets.** The client secret and password are typed into the browser and stored in `localStorage` as part of the environment config. They are sent to our own routes only when a token has to be minted, and the token request to IFS is made server-side. This is not a secrets vault; don't treat it as one.
- **Next.js version.** This project's Next.js differs from older versions (see `frontend/AGENTS.md`). The docs are in `frontend/node_modules/next/dist/docs/`. The route-handler shape used here (`export async function POST(request)` returning `Response.json(...)`) matches those docs.

## 11. Status and known limits

**Verified**: `npx next build` passes. The three data routes and the `$batch` logic were exercised over HTTP against a local mock IFS server (token minting, cached token, stale token, partial failures, unconfirmed parts, invalid input). The batch request body is byte-identical to the original Postman pre-request script's output, and the response classification matches the Postman test script's.

**Not verified**:

- **A real IFS tenant.** In particular, that IFS returns a `Content-ID` on every per-record response, including rejected ones (the parser depends on it). Try a batch with one deliberately duplicate part first.
- **The UI in a browser.** The client helpers and pages compile, but were not clicked through against the mock.

**Known limits**

- **No pagination.** `@odata.nextLink` is not followed. If a projection pages its results, the GET will return only the first page.
- **No chunking.** All selected records go in one `$batch` request. IFS may cap batch size.
- **Duplicated boilerplate.** The token-resolution block (`accessToken` or mint via `requestIfsToken`) is copy-pasted across the routes. A shared `resolveAccessToken(body, fallbackOrigin)` in `ifsAuth.js` would remove it.
- **The batch builder is PartCatalog-specific** (see §8 step 3).
