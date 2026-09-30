import {
  SALES_PART_MIGRATION_FIELDS,
  PART_CATALOG_MIGRATION_FIELDS,
  INVENTORY_PART_MIGRATION_FIELDS,
  PURCHASE_PART_MIGRATION_FIELDS,
  PART_CATALOG_FIXED_VALUES,
  pickPayloadFields
} from './migrationFields'

export { SALES_PART_MIGRATION_FIELDS, PART_CATALOG_MIGRATION_FIELDS, INVENTORY_PART_MIGRATION_FIELDS, PURCHASE_PART_MIGRATION_FIELDS }
const HISTORY_KEY = 'sebsa_ifs_migration_history'
const ENV_CONFIG_KEY = 'sebsa_ifs_env_config'
const SESSION_TOKEN_KEY = 'sebsa_ifs_session_tokens'

// Connection settings are stored per role — there is no user-entered environment name.
export const SOURCE_ENV = 'Source'
export const DEST_ENV = 'Destination'
export const ENVIRONMENTS = [SOURCE_ENV, DEST_ENV]

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

// InventoryPartHandling projection's InventoryPartSet — see
// fetchLiveInventoryParts.
export function buildInventoryPartSetUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/InventoryPartHandling.svc/InventoryPartSet`
}

// The same projection's OData $batch endpoint — inventory parts are created
// through this, many per request, see postInventoryParts.
export function buildInventoryPartHandlingBatchUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/InventoryPartHandling.svc/$batch`
}

// SalesPartHandling's OData $batch endpoint — sales parts are created through
// this, many per request, see postSalesParts.
export function buildSalesPartHandlingBatchUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/SalesPartHandling.svc/$batch`
}

// PurchasePartHandling projection's PurchasePartSet — see
// fetchLivePurchaseParts.
export function buildPurchasePartSetUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/PurchasePartHandling.svc/PurchasePartSet`
}

// The same projection's OData $batch endpoint — purchase parts are created
// through this, many per request, see postPurchaseParts.
export function buildPurchasePartHandlingBatchUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/PurchasePartHandling.svc/$batch`
}

// The same projection's OData $batch endpoint — parts are created through
// this, many per request, see postPartCatalogParts.
export function buildPartHandlingBatchUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/PartHandling.svc/$batch`
}

// CompanyHandling projection's CompanySet — see fetchLiveCompanies.
export function buildCompanySetUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/CompanyHandling.svc/CompanySet`
}

// The "create new company" assistant action — a single unbound action call,
// not an OData entity POST. One request creates one company synchronously
// (confirmed against a real environment: returns { Company, Success }, where
// Success is not just "TRUE" — see postCompanies). See buildCreateCompanyBatchUrl
// for the faster $batch path tried first.
export function buildCreateCompanyUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/CreateCompanyAssistantHandling.svc/CreateNewCompany`
}

// Same projection's $batch endpoint — tried first for speed (see
// ifsCompanyBatch.js); falls back to one request per company if IFS doesn't
// accept an action call inside $batch.
export function buildCreateCompanyBatchUrl(baseUrl) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/CreateCompanyAssistantHandling.svc/$batch`
}

// Company sub-entities, read via navigation properties off CompanySet — see
// "REST APIs.xlsx" (Company sheet). Confirmed by matching each tab's field
// names (lib/entityTabsConfig.json, generated from the same sheet) against
// the sheet's own sample payloads, not by calling a real tenant. Several tabs
// share one underlying array (e.g. invoice/po_matching/document_management
// are all CompanyInvoiceInfoArray — different field subsets of the same
// record, per the sheet). A few are scoped to one specific address (an
// AddressId, not just the company code) — see COMPANY_SUB_ENTITY_NEEDS_ADDRESS.
// "employees" is the one exception to the nav-property pattern: CompanyEmpSet
// is its own top-level entity set, filtered by Company.
const COMPANY_SUB_ENTITY_PATHS = {
  address: (company) => `CompanySet(Company='${company}')/CompanyAddresses`,
  message_setup: (company) => `CompanySet(Company='${company}')/MessageSetups`,
  accounting_rules: (company) => `CompanySet(Company='${company}')/AccountingRulesBasicDataArray`,
  currency_rate_type_information: (company) => `CompanySet(Company='${company}')/CurrencyTypeBasicDataArray`,
  tax_control: (company) => `CompanySet(Company='${company}')/TaxControlBasicDataArray`,
  invoice: (company) => `CompanySet(Company='${company}')/CompanyInvoiceInfoArray`,
  po_matching: (company) => `CompanySet(Company='${company}')/CompanyInvoiceInfoArray`,
  document_management: (company) => `CompanySet(Company='${company}')/CompanyInvoiceInfoArray`,
  default_invoice_type: (company) => `CompanySet(Company='${company}')/CompanyInvoiceInfoDefInvTypes`,
  payment: (company) => `CompanySet(Company='${company}')/CompanyPayments`,
  proposal_parameters: (company) => `CompanySet(Company='${company}')/CompanyPayments`,
  fixed_asset: (company) => `CompanySet(Company='${company}')/CompanyFixedAssetsArray`,
  periodic_cost_allocation: (company) => `CompanySet(Company='${company}')/CompanyCostAllocInfoArray`,
  warehouse_management: (company) => `CompanySet(Company='${company}')/CompanyWarehousingInfoArray`,
  procument: (company) => `CompanySet(Company='${company}')/CompanyProcurementInfoArray`,
  sales: (company) => `CompanySet(Company='${company}')/CompanySalesInfoArray`,
  rental: (company) => `CompanySet(Company='${company}')/CompanyRentalInfoArray`,
  employees: (company) => `CompanyEmpSet?$filter=Company eq '${company}'`,
  address_types: (company, addressId) =>
    `CompanySet(Company='${company}')/CompanyAddresses(Company='${company}',AddressId='${addressId}')/AddressTypes`,
  communication_methods: (company, addressId) =>
    `CompanySet(Company='${company}')/CompanyAddresses(Company='${company}',AddressId='${addressId}')/AddressCommunicationMethods`,
  tax_information: (company, addressId) =>
    `CompanySet(Company='${company}')/CompanyAddresses(Company='${company}',AddressId='${addressId}')/TaxCodes`,
  tax_excempt_information: (company, addressId) =>
    `CompanySet(Company='${company}')/CompanyAddresses(Company='${company}',AddressId='${addressId}')/TaxExempArray`,
  supply_chain_information: (company, addressId) =>
    `CompanySet(Company='${company}')/CompanyAddresses(Company='${company}',AddressId='${addressId}')/CompanyAddressSupplyChainInfoArray`
}

export const COMPANY_SUB_ENTITY_TAB_IDS = Object.keys(COMPANY_SUB_ENTITY_PATHS)

export const COMPANY_SUB_ENTITY_NEEDS_ADDRESS = new Set([
  'address_types',
  'communication_methods',
  'tax_information',
  'tax_excempt_information',
  'supply_chain_information'
])

export function buildCompanySubEntityUrl(baseUrl, company, tabId, addressId) {
  if (!baseUrl) throw new Error('Base URL is required.')
  if (!company) throw new Error('Company code is required.')
  const build = COMPANY_SUB_ENTITY_PATHS[tabId]
  if (!build) throw new Error(`Unknown company sub-entity tab "${tabId}".`)
  if (COMPANY_SUB_ENTITY_NEEDS_ADDRESS.has(tabId) && !addressId) {
    throw new Error('An address is required to fetch this sub-entity.')
  }
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/CompanyHandling.svc/${build(company, addressId)}`
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

export const LIVE_DATASETS = {
  salesPart: {
    title: 'SalesPartSet',
    endpoint: '/main/ifsapplications/projection/v1/SalesPartHandling.svc/SalesPartSet',
    apiRoute: '/api/ifs/sales-part-set'
  },
  personGroup: {
    title: 'DocumentGroupSet',
    endpoint: '/main/ifsapplications/projection/v1/PersonGroupHandling.svc/DocumentGroupSet',
    apiRoute: '/api/ifs/person-group-set'
  }
}

export function buildLiveDataUrl(baseUrl, dataset) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}${dataset.endpoint}`
}

export async function fetchLiveData(dataset, env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured.' }
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

// Runs the authenticated GET against InventoryPartSet using the given
// environment's saved authorization. Same shape as fetchLivePartCatalog.
export async function fetchLiveInventoryParts(env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/inventory-part-set', {
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

// Creates the given inventory parts through the InventoryPartHandling $batch
// endpoint, authorized by the given environment (the destination). Same
// contract as postPartCatalogParts: every part is sorted into successful /
// failed / unconfirmed.
export async function postInventoryParts(env, config, parts) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure destination environment".' }
  }
  try {
    const res = await fetch('/api/ifs/inventory-part-set/create', {
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

// Creates the given sales parts through the SalesPartHandling $batch endpoint,
// authorized by the given environment (the destination). Same contract as
// postPartCatalogParts: every part is sorted into successful / failed /
// unconfirmed.
export async function postSalesParts(env, config, parts) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure destination environment".' }
  }
  try {
    const res = await fetch('/api/ifs/sales-part-set/create', {
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

// Runs the authenticated GET against PurchasePartSet using the given
// environment's saved authorization. Same shape as fetchLivePartCatalog.
export async function fetchLivePurchaseParts(env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/purchase-part-set', {
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

// Creates the given purchase parts through the PurchasePartHandling $batch
// endpoint, authorized by the given environment (the destination). Same
// contract as postPartCatalogParts: every part is sorted into successful /
// failed / unconfirmed.
export async function postPurchaseParts(env, config, parts) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure destination environment".' }
  }
  try {
    const res = await fetch('/api/ifs/purchase-part-set/create', {
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

// Runs the authenticated GET against CompanySet using the given environment's
// saved authorization. Same shape as fetchLiveSalesParts.
export async function fetchLiveCompanies(env, config) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/company-set', {
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

// Creates the given companies via the CreateNewCompany assistant action,
// authorized by the given environment (the destination). Tries $batch first
// (fast, one HTTP request); falls back to one request per company when IFS
// doesn't accept the action inside $batch — see company-set/create/route.js.
export async function postCompanies(env, config, companies, { forceSequential = false } = {}) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure destination environment".' }
  }
  try {
    const res = await fetch('/api/ifs/company-set/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        records: companies,
        forceSequential,
        // Always include `config`, even with a cached token: creating a
        // company is slow enough (real DB work, several seconds each) that
        // the sequential fallback can outlive the token's TTL, and the route
        // needs `config` to mint a fresh one mid-batch rather than aborting.
        ...(cached ? { accessToken: cached.accessToken } : {}),
        config
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
      mode: body.mode,
      summary: body.summary,
      successful: body.successful,
      failed: body.failed,
      unconfirmed: body.unconfirmed || []
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// Runs the authenticated GET against one company sub-entity (a nav property
// off CompanySet — see COMPANY_SUB_ENTITY_PATHS) for the Review step's real
// data. Read-only: nothing built from this is ever sent back to IFS yet.
export async function fetchCompanySubEntity(env, config, company, tabId, addressId) {
  const cached = env ? getSessionToken(env) : null
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }
  try {
    const res = await fetch('/api/ifs/company-set/sub-entity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        company,
        tabId,
        addressId,
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

// Used by the Transfer step for the "company" entity (see transferRunner.js),
// in place of the generic postEntityBatch: sends only the header — via the
// real, confirmed-working CreateNewCompany flow, never a plain $batch POST to
// CompanySet — and never the sub-entities shown in Review Data. Also does the
// destination duplicate check here (not just on the standalone CompanySet
// page) since CreateNewCompany does not reliably fail on its own when a
// company already exists — see postCompanies.
//
// Forces the sequential path (see postCompanies / company-set/create/route.js):
// $batch's multipart response can come back with none of its per-company
// parts matched, which reads as "unconfirmed" for every record even on a
// clean run — confirmed against a real environment. Sequential always gets a
// definite JSON body per company, so every record ends up SUCCESS or FAILED,
// never UNCONFIRMED.
//
// `records` are raw CompanySet records (as the transfer runner passes them,
// already stripped of system fields by buildEntityPayload). Returns
// `{ success, results }` with one result per input record, in order —
// the shape lib/transferRunner.js expects from any entity poster.
export async function postCompanyHeaderBatch(env, config, records) {
  const destCompanies = await fetchLiveCompanies(env, config)
  // Couldn't check — don't block the transfer on a failed safety check.
  const existingCodes = destCompanies.success
    ? new Set(destCompanies.records.map((r) => String(r.Company ?? '').trim().toUpperCase()))
    : null

  const payloads = buildCompanyMigrationPayload(records)
  const results = new Array(records.length).fill(null)
  const toPost = []
  const toPostIndices = []

  payloads.forEach((payload, i) => {
    const code = String(payload.NewCompany ?? '').trim().toUpperCase()
    if (existingCodes && code && existingCodes.has(code)) {
      // httpStatus 409 (rather than null) so the transaction log classifies
      // this as ALREADY_EXISTS, not UNCONFIRMED — see isAlreadyExistsError in
      // transactionLog.js, and classify() in transferRunner.js, which only
      // consults the error message once httpStatus is a real failing status.
      results[i] = { httpStatus: 409, error: 'Already exists in the destination (found via a source-vs-destination check).', errorCode: null }
    } else {
      toPost.push(payload)
      toPostIndices.push(i)
    }
  })

  if (toPost.length === 0) return { success: true, results }

  const posted = await postCompanies(env, config, toPost, { forceSequential: true })
  if (!posted.success) return posted

  toPostIndices.forEach((recordIndex, i) => {
    const code = String(toPost[i].NewCompany ?? '').trim().toUpperCase()
    const ok = posted.successful.find((s) => String(s.NewCompany ?? '').trim().toUpperCase() === code)
    if (ok) {
      results[recordIndex] = { httpStatus: ok.status, error: null, errorCode: null }
      return
    }
    const fail = posted.failed.find((f) => String(f.NewCompany ?? '').trim().toUpperCase() === code)
    results[recordIndex] = fail
      ? { httpStatus: fail.status ?? null, error: fail.error, errorCode: null }
      : { httpStatus: null, error: 'No identifiable individual response', errorCode: null }
  })

  return { success: true, results }
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
// per part, with PART_CATALOG_FIXED_VALUES applied (PositionPart is always
// "NotAPositionPart").
export function buildPartCatalogMigrationPayload(records) {
  return records.map((record) => pickPayloadFields(record, PART_CATALOG_MIGRATION_FIELDS, PART_CATALOG_FIXED_VALUES))
}

// CreateNewCompany takes wizard fields a plain CompanySet record doesn't
// have (TemplateId, fiscal year setup, calendar method, ...) — these are
// fixed for every company this app creates, taken from a known-good sample
// request. Only the company's own identity/locale fields are read from the
// source record.
const COMPANY_CREATION_DEFAULTS = {
  CreateAsTemplateCompany: false,
  CreateAsMasterCompany: false,
  SourceCompany: '',
  TemplateId: 'STD-PT',
  StartMonth: 1,
  NumberOfYears: 12,
  UseVouNoPeriod: false,
  ParallelAccCurrency: 'USD',
  LogicalAccTypesList: '',
  CodePart: '',
  LanguageCodes: 'en^sv^',
  CreateFrom: 'Template',
  CalenderCreationMethod: 'UserDefined',
  ParallelCurBase: 'TransactionCurrency'
}

// Best-effort field names on CompanySet (Company, Name, Country,
// CurrencyCode, DefaultLanguage) — not yet verified against a real
// CompanySet response. Check the fetched records on the live-data page and
// adjust these if the actual field names differ.
export function buildCompanyMigrationPayload(records) {
  const year = new Date().getFullYear()
  return records.map((record) => {
    const name = record.Name ?? record.CompanyName ?? record.Company ?? ''
    return {
      NewCompany: record.Company ?? '',
      NewCompanyName: name,
      ...COMPANY_CREATION_DEFAULTS,
      AccYear: year,
      StartYear: year,
      ValidFrom: `${year}-01-01`,
      CurrencyCode: record.CurrencyCode ?? '',
      DefaultLanguage: record.DefaultLanguage ?? record.Language ?? 'en',
      Country: record.Country ?? '',
      InternalName: name
    }
  })
}

// Narrows full InventoryPartSet records down to POST-ready request bodies, one
// per inventory part.
export function buildInventoryPartMigrationPayload(records) {
  return records.map((record) => {
    const picked = {}
    INVENTORY_PART_MIGRATION_FIELDS.forEach((key) => {
      if (key in record) picked[key] = record[key]
    })
    return picked
  })
}

// Narrows full PurchasePartSet records down to POST-ready request bodies, one
// per purchase part.
export function buildPurchasePartMigrationPayload(records) {
  return records.map((record) => {
    const picked = {}
    PURCHASE_PART_MIGRATION_FIELDS.forEach((key) => {
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
