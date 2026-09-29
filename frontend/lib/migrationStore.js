import { SALES_PART_MIGRATION_FIELDS, PART_CATALOG_MIGRATION_FIELDS } from './migrationFields'

export { SALES_PART_MIGRATION_FIELDS, PART_CATALOG_MIGRATION_FIELDS }
const HISTORY_KEY = 'sebsa_ifs_migration_history'
const ENV_CONFIG_KEY = 'sebsa_ifs_env_config'
const SESSION_TOKEN_KEY = 'sebsa_ifs_session_tokens'

// Connection settings are stored per role — there is no user-entered environment name.
export const SOURCE_ENV = 'Source'
export const DEST_ENV = 'Destination'

// IFS Cloud REST APIs (projections) are called with an OAuth2 bearer token.
// The token is obtained from the IFS Identity Provider's token endpoint (the
// "authorization path") before any GET call against a projection can succeed.
export const GRANT_TYPES = [
  { value: 'client_credentials', label: 'Client Credentials (service-to-service)' },
  { value: 'password', label: 'Password (resource owner)' }
]

// The IFS Cloud Keycloak realm is the tenant's Namespace system parameter,
// which can't be derived from the host — so the suggested path leaves a
// {YourNamespace} placeholder for the user to replace by hand.
export function suggestAuthPath(baseUrl) {
  try {
    const { origin, hostname } = new URL(baseUrl.trim())
    if (!hostname.includes('.')) return ''
    return `${origin}/auth/realms/{YourNamespace}/protocol/openid-connect/token`
  } catch {
    return ''
  }
}

export const DEFAULT_ENV_CONFIG = {
  baseUrl: '',
  authPath: '',
  grantType: 'client_credentials',
  clientId: '',
  clientSecret: '',
  username: '',
  password: '',
  status: 'unconfigured', // 'unconfigured' | 'authorized' | 'error'
  lastError: null,
  lastTestedAt: null
}

export function getEnvironmentConfigs() {
  if (typeof window === 'undefined') return {}
  const raw = localStorage.getItem(ENV_CONFIG_KEY)
  return raw ? JSON.parse(raw) : {}
}

export function getEnvironmentConfig(env) {
  const all = getEnvironmentConfigs()
  return { ...DEFAULT_ENV_CONFIG, ...(all[env] || {}) }
}

export function saveEnvironmentConfig(env, config) {
  const all = getEnvironmentConfigs()
  const next = { ...DEFAULT_ENV_CONFIG, ...(all[env] || {}), ...config }
  all[env] = next
  localStorage.setItem(ENV_CONFIG_KEY, JSON.stringify(all))
  return next
}

// Access tokens live only in sessionStorage (cleared when the tab/session
// ends) — separate from the connection config in localStorage, and never
// persisted across browser restarts.
function readSessionTokens() {
  if (typeof window === 'undefined') return {}
  const raw = sessionStorage.getItem(SESSION_TOKEN_KEY)
  return raw ? JSON.parse(raw) : {}
}

function writeSessionTokens(all) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(all))
}

export function getSessionToken(env) {
  const entry = readSessionTokens()[env]
  if (!entry || Date.now() >= entry.expiresAt) return null
  return entry
}

export function setSessionToken(env, { accessToken, tokenType, expiresIn }) {
  const all = readSessionTokens()
  // 5s safety margin so a call doesn't start with a token that expires mid-flight.
  all[env] = { accessToken, tokenType: tokenType || 'Bearer', expiresAt: Date.now() + (expiresIn || 3600) * 1000 - 5000 }
  writeSessionTokens(all)
  return all[env]
}

export function clearSessionToken(env) {
  const all = readSessionTokens()
  delete all[env]
  writeSessionTokens(all)
}

// Real, dynamic OAuth2 token exchange against the environment's configured
// authorization path (via our own /api route, so the client secret never
// leaves the server). The resulting token is cached in sessionStorage and
// reused by subsequent calls instead of re-authorizing every time.
export async function testEnvironmentConnection(env, config) {
  try {
    const res = await fetch('/api/ifs/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    const body = await res.json()
    if (!res.ok || !body.success) {
      return { success: false, error: body.error || `Authorization failed (${res.status}).` }
    }
    const token = setSessionToken(env, body)
    return {
      success: true,
      tokenPreview: `${token.tokenType} •••• (expires ${new Date(token.expiresAt).toLocaleTimeString()})`
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// This one is a real integration point: a live IFS Cloud projection. Built
// from the environment's own configured Base URL, not a fixed host, so it
// follows whichever IFS tenant the source environment modal was set up for.
export function buildSalesPartSetUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/SalesPartHandling.svc/SalesPartSet`
}

// PartHandling projection's PartCatalogSet — see fetchLivePartCatalog.
export function buildPartCatalogSetUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/PartHandling.svc/PartCatalogSet`
}

// CompanySiteHandling projection's CompanySiteSet — see fetchLiveCompanySites.
export function buildCompanySiteSetUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/CompanySiteHandling.svc/CompanySiteSet`
}

// CompanySiteHandling's OData $batch endpoint — the site migration
// (/api/ifs/site-migration) writes every step through this.
export function buildCompanySiteHandlingBatchUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/CompanySiteHandling.svc/$batch`
}

// The same projection's OData $batch endpoint — parts are created through
// this, many per request, see postPartCatalogParts.
export function buildPartHandlingBatchUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/PartHandling.svc/$batch`
}

// Calls our own /api route (server-side) so the OAuth2 client secret never
// reaches the browser bundle and the request isn't blocked by CORS. Reuses
// the session token from a prior "Test connection" when one is still valid,
// otherwise the route mints a fresh one from the saved config.
export async function fetchLiveSalesParts(env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!cached && !config) {
    return { success: false, error: 'Select and authorize a source environment first.' }
  }
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/sales-part-set', {
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

// Runs the authenticated GET against PartCatalogSet using the given
// environment's saved authorization. Returns the extracted records (for the
// live-data page) along with the raw response body.
export async function fetchLivePartCatalog(env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/part-catalog-set', {
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
      return { success: false, error: body.error || `Request failed (${res.status}).`, response: body.response }
    }
    if (body.token) setSessionToken(env, body.token)
    const records = body.response?.value || body.response?.d?.results || (Array.isArray(body.response) ? body.response : [])
    return { success: true, url: body.url, status: body.status, response: body.response, records }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Runs the authenticated GET against CompanySiteSet using the given
// environment's saved authorization. Same shape as fetchLivePartCatalog.
export async function fetchLiveCompanySites(env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/company-site-set', {
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
      return { success: false, error: body.error || `Request failed (${res.status}).`, response: body.response }
    }
    if (body.token) setSessionToken(env, body.token)
    const records = body.response?.value || body.response?.d?.results || (Array.isArray(body.response) ? body.response : [])
    return { success: true, url: body.url, status: body.status, response: body.response, records }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Runs every site GET (lib/siteDataSources.js, in order) for one site through
// /api/ifs/site-data. Returns the ordered sections, each holding its records
// or its own error.
export async function fetchSiteData(env, config, contract, company) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/site-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        contract,
        company,
        ...(cached ? { accessToken: cached.accessToken } : { config })
      })
    })
    const body = await res.json()
    if (body.tokenInvalid) clearSessionToken(env)
    if (!res.ok || !body.success) {
      return { success: false, error: body.error || `Request failed (${res.status}).` }
    }
    if (body.token) setSessionToken(env, body.token)
    return { success: true, contract: body.contract, sections: body.sections }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Creates the given parts through the PartHandling $batch endpoint, authorized
// by the given environment (the destination) — same session-token reuse as
// the GETs above. A part IFS rejects doesn't fail the call: the result sorts
// every part into successful / failed / unconfirmed (no identifiable answer).
export async function postPartCatalogParts(env, config, parts) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure destination environment".' }
  }
  try {
    const res = await fetch('/api/ifs/part-catalog-set/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        records: parts,
        ...(cached ? { accessToken: cached.accessToken } : { config })
      })
    })
    const body = await res.json()
    if (!res.ok || !body.success) {
      if (body.tokenInvalid) clearSessionToken(env)
      return { success: false, error: body.error || `Request failed (${res.status}).` }
    }
    if (body.token) setSessionToken(env, body.token)
    return {
      success: true,
      url: body.url,
      batchStatus: body.batchStatus,
      summary: body.summary,
      successful: body.successful,
      failed: body.failed,
      unconfirmed: body.unconfirmed
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Calls one of the generic /api/ifs routes for an environment, reusing its
// cached session token. When IFS rejects that token (expired mid-transfer),
// retries once with the saved config so the route mints a fresh one.
async function callIfsRoute(path, env, config, payload) {
  if (!config?.baseUrl) {
    return { success: false, error: `No Base URL configured for the ${env} environment.` }
  }
  async function attempt(useCache) {
    const cached = useCache ? getSessionToken(env) : null
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        baseUrl: config.baseUrl,
        ...(cached ? { accessToken: cached.accessToken } : { config })
      })
    })
    const body = await res.json().catch(() => ({ success: false, error: `Request failed (${res.status}).` }))
    return { body, usedCache: Boolean(cached), status: res.status }
  }
  try {
    let { body, usedCache, status } = await attempt(true)
    if (!body.success && body.tokenInvalid) {
      clearSessionToken(env)
      if (usedCache) ({ body, status } = await attempt(false))
    }
    if (!body.success) return { ...body, success: false, error: body.error || `Request failed (${status}).` }
    if (body.token) setSessionToken(env, body.token)
    return body
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// GETs every record of a registry entity (lib/entityRegistry.js) from the
// given environment.
export async function fetchEntityRecords(entityId, env, config) {
  const body = await callIfsRoute('/api/ifs/entity', env, config, { entity: entityId })
  return body.success ? { success: true, url: body.url, records: body.records || [] } : body
}

// POSTs records of a registry entity to the given environment as one $batch
// (one changeset per record). `results` lines up with `records` by index:
// { httpStatus, error, errorCode } — httpStatus is null when IFS gave no
// identifiable answer for that record.
export async function postEntityBatch(entityId, env, config, records) {
  return callIfsRoute('/api/ifs/batch', env, config, { entity: entityId, records })
}

// IFS OData responses carry internal/technical bookkeeping fields alongside
// the real business data (row versioning, Lu metadata, etc.) — not meaningful
// to show in the UI, so they're filtered out before display.
const HIDDEN_FIELD_PATTERN = /^[@$]/
const HIDDEN_FIELD_NAMES = new Set([
  'objid',
  'objversion',
  'rowversion',
  'objstate',
  'luname',
  'keyref',
  'stateindicator'
])

// PartNo -> "Part No", SalesPartDescription -> "Sales Part Description".
export function humanizeFieldName(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
}

// Returns [label, value] pairs for a record with internal fields dropped and
// remaining keys turned into readable labels, in their original order.
export function visibleRecordFields(record) {
  return Object.entries(record)
    .filter(([key]) => !HIDDEN_FIELD_PATTERN.test(key) && !HIDDEN_FIELD_NAMES.has(key.toLowerCase()))
    .map(([key, value]) => [humanizeFieldName(key), value])
}

// Narrows full SalesPartSet records down to the migration payload shape.
export function buildSalesPartMigrationPayload(records) {
  return records.map((record) => {
    const picked = {}
    SALES_PART_MIGRATION_FIELDS.forEach((key) => {
      if (key in record) picked[key] = record[key]
    })
    return picked
  })
}

// Narrows full PartCatalogSet records down to POST-ready request bodies, one
// per part.
export function buildPartCatalogMigrationPayload(records) {
  return records.map((record) => {
    const picked = {}
    PART_CATALOG_MIGRATION_FIELDS.forEach((key) => {
      if (key in record) picked[key] = record[key]
    })
    return picked
  })
}

export function getHistory() {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(HISTORY_KEY)
  return raw ? JSON.parse(raw) : []
}

// Keeps the last 25 transfers' summaries (not their full transaction logs —
// those are downloaded as Excel at the end of the run).
export function saveHistoryEntry(entry) {
  const history = getHistory()
  history.unshift(entry)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 25)))
  return entry
}
