const HISTORY_KEY = 'sebsa_ifs_migration_history'
const ENV_CONFIG_KEY = 'sebsa_ifs_env_config'
const SESSION_TOKEN_KEY = 'sebsa_ifs_session_tokens'

export const ENVIRONMENTS = ['Development', 'Test', 'UAT', 'Production']

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

const IFS_PROJECTION_PATH = '/main/ifsapplications/projection/v1'

// Live IFS Cloud projections the tool can browse. Each endpoint is appended
// to the environment's own configured Base URL, not a fixed host, so it
// follows whichever IFS tenant the source environment modal was set up for.
// Each dataset's `buildPayload` shapes selected records for export.
export const LIVE_DATASETS = {
  salesPart: {
    title: 'SalesPartSet',
    endpoint: `${IFS_PROJECTION_PATH}/SalesPartHandling.svc/SalesPartSet`,
    apiRoute: '/api/ifs/sales-part-set',
    pageRoute: '/new-migration/sales-part-set',
    exportPrefix: 'sales-part-migration',
    buildPayload: buildSalesPartMigrationPayload
  },
  personGroup: {
    title: 'DocumentGroupSet',
    endpoint: `${IFS_PROJECTION_PATH}/PersonGroupHandling.svc/DocumentGroupSet`,
    apiRoute: '/api/ifs/person-group-set',
    pageRoute: '/new-migration/person-group-set',
    exportPrefix: 'person-group-migration',
    buildPayload: buildPersonGroupMigrationPayload
  }
}

export function buildLiveDataUrl(baseUrl, dataset) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}${dataset.endpoint}`
}

// Calls our own /api route (server-side) so the OAuth2 client secret never
// reaches the browser bundle and the request isn't blocked by CORS. Reuses
// the session token from a prior "Test connection" when one is still valid,
// otherwise the route mints a fresh one from the saved config.
export async function fetchLiveData(dataset, env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!cached && !config) {
    return { success: false, error: 'Select and authorize a source environment first.' }
  }
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch(dataset.apiRoute, {
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

// Console-only diagnostic: runs a real GET for `dataset` using the saved
// config and session token of `env`, and logs everything about it. Secrets
// are masked so they don't end up in the browser console.
export async function runEnvironmentTest(dataset, env) {
  const config = getEnvironmentConfig(env)
  const mask = (value) => (value ? '••••••••' : '')
  const describeToken = (token) =>
    token
      ? {
          type: token.tokenType,
          expiresAt: new Date(token.expiresAt).toLocaleString(),
          accessToken: `${token.accessToken.slice(0, 12)}… (${token.accessToken.length} chars)`
        }
      : null

  let url = null
  try {
    url = buildLiveDataUrl(config.baseUrl, dataset)
  } catch {
    url = null
  }

  console.group(`[${env}] environment test — ${dataset.title}`)
  console.log('Environment:', env)
  console.log('Variables used:', { ...config, clientSecret: mask(config.clientSecret), password: mask(config.password) })
  console.log('Request:', `GET ${url ?? '(no Base URL configured)'}`)
  console.log('Session token before:', describeToken(getSessionToken(env)) ?? 'none cached — one will be requested')

  const started = performance.now()
  const result = await fetchLiveData(dataset, env, config)
  console.log(`Finished in ${Math.round(performance.now() - started)} ms`)
  console.log('Session token after:', describeToken(getSessionToken(env)) ?? 'none')

  if (result.success) {
    console.log(`SUCCESS — ${result.records.length} record(s)`)
    console.table(result.records)
    console.log('Raw records:', result.records)
  } else {
    console.error('FAILED —', result.error)
  }
  console.groupEnd()
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

// The exact field set and order the destination expects a SalesPart create
// payload in — narrower than what SalesPartSet returns (drops read-only/
// system bookkeeping fields like Company, NoteText, RuleId, Gtin, etc.).
export const SALES_PART_MIGRATION_FIELDS = [
  'Contract', 'CatalogNo', 'CatalogDesc', 'PartNo', 'CatalogGroup', 'SalesPriceGroupId',
  'NoteId', 'SalesUnitMeas', 'ConvFactor', 'DateEntered', 'ListPrice', 'ListPriceInclTax',
  'RentalListPrice', 'RentalListPriceInclTax', 'PriceConvFactor', 'PriceUnitMeas', 'TaxCode',
  'CloseTolerance', 'SourcingOption', 'InvertedConvFactor', 'SalesType', 'StatisticalCode',
  'AcquisitionOrigin', 'AcquisitionReasonId', 'PartDescriptionInUse', 'PartCatalogPartDescription',
  'InventoryPartDesc', 'Dop', 'UnitMeas', 'CurrencyCode', 'PrimaryCatalog', 'Activeind', 'Taxable',
  'QuickRegisteredPart', 'UsePriceInclTax', 'ExportToExternalApp', 'CreateSmObjectOption',
  'CustomerWarranty', 'CatalogTypeDb', 'DocumentText', 'CurrDate', 'Configurable',
  'CreatePurchasePart', 'ExternalTaxCalcMethod', 'TaxManufEquivalent'
]

export const PERSON_GROUP_MIGRATION_FIELDS = ['GroupId', 'GroupDescription']

// Narrows full records down to a payload containing only the given fields,
// in the given order.
function pickFields(records, fields) {
  return records.map((record) => {
    const picked = {}
    fields.forEach((key) => {
      if (key in record) picked[key] = record[key]
    })
    return picked
  })
}

export function buildSalesPartMigrationPayload(records) {
  return pickFields(records, SALES_PART_MIGRATION_FIELDS)
}

export function buildPersonGroupMigrationPayload(records) {
  return pickFields(records, PERSON_GROUP_MIGRATION_FIELDS)
}

function mockCustomerRecord(i) {
  const regions = ['EMEA', 'APAC', 'AMER']
  return {
    code: `CUST-${String(1000 + i)}`,
    name: `Customer ${1000 + i}`,
    region: regions[i % regions.length]
  }
}

function mockCompanyRecord(i) {
  const countries = ['SE', 'US', 'UK', 'DE']
  return {
    code: `COMP-${String(100 + i)}`,
    name: `Company ${100 + i}`,
    country: countries[i % countries.length]
  }
}

function mockInventoryRecord(i) {
  const warehouses = ['SITE-01', 'SITE-02', 'SITE-03']
  const uoms = ['EA', 'KG', 'BOX', 'LTR']
  return {
    sku: `INV-${String(1000 + i)}`,
    description: `Inventory Item ${1000 + i}`,
    warehouse: warehouses[i % warehouses.length],
    uom: uoms[i % uoms.length]
  }
}

function mockSupplierRecord(i) {
  const categories = ['Raw Materials', 'Packaging', 'Logistics', 'Services']
  return {
    code: `SUP-${String(1000 + i)}`,
    name: `Supplier ${1000 + i}`,
    category: categories[i % categories.length]
  }
}

export const AVAILABLE_ENTITIES = [
  {
    id: 'customer',
    label: 'Customer',
    description: 'Customer master records',
    enabled: true,
    defaultCount: 58,
    idKey: 'code',
    rowPrimary: 'name',
    rowSecondary: ['code', 'region'],
    subMenu: ['Address', 'Contact', 'Communication Method'],
    generator: mockCustomerRecord
  },
  {
    id: 'company',
    label: 'Company',
    description: 'Company master records',
    enabled: true,
    defaultCount: 12,
    idKey: 'code',
    rowPrimary: 'name',
    rowSecondary: ['code', 'country'],
    generator: mockCompanyRecord
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Inventory master records',
    enabled: true,
    defaultCount: 42,
    idKey: 'sku',
    rowPrimary: 'description',
    rowSecondary: ['sku', 'warehouse', 'uom'],
    generator: mockInventoryRecord
  },
  {
    id: 'supplier',
    label: 'Supplier',
    description: 'Supplier master records',
    enabled: true,
    defaultCount: 27,
    idKey: 'code',
    rowPrimary: 'name',
    rowSecondary: ['code', 'category'],
    generator: mockSupplierRecord
  }
]

export function fetchEntitiesData(entityIds) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = {}
      entityIds.forEach((entityId) => {
        const entity = AVAILABLE_ENTITIES.find((e) => e.id === entityId)
        if (!entity) return
        const records = Array.from({ length: entity.defaultCount }, (_, i) => entity.generator(i))
        result[entityId] = { records, total: records.length }
      })
      resolve(result)
    }, 900)
  })
}

export function runMigration(fromEnv, toEnv, entityBreakdown) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const totalRecords = entityBreakdown.reduce((sum, e) => sum + e.total, 0)
      const entry = {
        id: Date.now(),
        fromEnv,
        toEnv,
        entities: entityBreakdown,
        totalRecords,
        completedAt: new Date().toISOString(),
        status: 'Completed'
      }
      const history = getHistory()
      history.unshift(entry)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 25)))
      resolve(entry)
    }, 1400)
  })
}

export function getHistory() {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(HISTORY_KEY)
  return raw ? JSON.parse(raw) : []
}
