// Every Company sub-entity write this app knows a real endpoint for.
// Originally guessed from "REST APIs.xlsx" (Company sheet); corrected
// against "Post Bulks.txt" — real Postman-tested bulk-create requests the
// user ran against dev1/dev2. That file is authoritative where it overlaps:
//
// - EVERY one of its 18 Company sub-entity requests is a POST, including
//   ones the sheet only showed a PATCH sample for (Invoice, Default Invoice
//   Types, Fixed Assets, Warehouse Management, Sales, Rental, ...). The
//   sheet's missing/empty POST samples did not mean "PATCH only" — they just
//   meant the sheet's author didn't fill one in. So every step here is POST.
// - Two of the sheet's section labels were wrong: what it called "Document
//   Management" actually posts to CompanyInvoiceSuppInvWorkflows (Supplier
//   Invoice Workflow), and its second "Create Supply Chain Information"
//   actually posts to CompanyCostAllocInfoArray (Periodical Cost
//   Allocation) — both corrected below, from the tested payload's own field
//   names, not the sheet's label.
//
// Steps with no entry in Post Bulks.txt at all (Accounting Rules, Tax
// Control, Payment, Procurement, Supply Chain — General) are marked
// `unverified: true`: given POST as the default per the pattern above, but
// watch these specifically — if one comes back "already exists" on a
// second run instead of updating, it needs the PATCH+ETag path (like the
// Site migration's PATCH steps) instead of POST.
//
// A company is migrated by running these strictly in order, after the
// header (Company itself — a separate, special step; see
// companyMigrationRunner.js). Each step reads from the Source and writes to
// the Destination through CompanyHandling's $batch (see
// app/api/ifs/company-migration/route.js).
//
// Payload: whatever the Source GET actually returned for that record, minus
// system/read-only bookkeeping fields (see buildStepPayload) — not a
// curated per-step allow-list. Sending exactly what was fetched, rather
// than a hand-picked subset, is less likely to silently drop a field IFS
// actually needs, and matches how the generic entities (Site, Customer, ...)
// already build their payload in entityRegistry.js's buildEntityPayload.
//
// `needsAddress`: scoped to one address (an AddressId), not just the company
// code. Only the company's first address is migrated for now (matches the
// same limitation in Review Data) — a company with several addresses only
// gets these steps for its first one.

export const COMPANY_PROJECTION = 'CompanyHandling.svc'

// OData string-literal escaping for a value embedded in a key predicate
// (Company='X', AddressId='Y') — a company code with a space ("FIN GC 01")
// or an embedded quote would otherwise produce an invalid request line
// inside the $batch body. Matches the encodeKey() helper in the tested
// Postman scripts exactly.
function odataKey(value) {
  return encodeURIComponent(String(value ?? '').replace(/'/g, "''"))
}

const company = (ctx) => `CompanySet(Company='${odataKey(ctx.co)}')`
const address = (ctx) => `${company(ctx)}/CompanyAddresses(Company='${odataKey(ctx.co)}',AddressId='${odataKey(ctx.addr)}')`

export const COMPANY_MIGRATION_STEPS = [
  {
    id: 'address',
    label: 'Address',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyAddresses`,
    write: (ctx) => `${company(ctx)}/CompanyAddresses`
  },
  {
    id: 'addressTypes',
    label: 'Address Types',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/AddressTypes`,
    write: (ctx) => `${address(ctx)}/AddressTypes`
  },
  {
    id: 'communicationMethods',
    label: 'Communication Method',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/AddressCommunicationMethods`,
    write: (ctx) => `${address(ctx)}/AddressCommunicationMethods`
  },
  {
    id: 'taxInformation',
    label: 'Tax Information',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/TaxCodes`,
    write: (ctx) => `${address(ctx)}/TaxCodes`
  },
  {
    id: 'taxExempt',
    label: 'Tax Exempt Information',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/TaxExempArray`,
    write: (ctx) => `${address(ctx)}/TaxExempArray`
  },
  {
    id: 'addressSupplyChain',
    label: 'Address Supply Chain Information',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/CompanyAddressSupplyChainInfoArray`,
    write: (ctx) => `${address(ctx)}/CompanyAddressSupplyChainInfoArray`
  },
  {
    id: 'messageSetup',
    label: 'Message Setup',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/MessageSetups`,
    write: (ctx) => `${company(ctx)}/MessageSetups`
  },
  {
    id: 'employees',
    label: 'Employees',
    method: 'POST',
    // CompanyEmpSet is its own top-level entity set, not a nav property off
    // CompanySet — filtered by Company instead.
    read: (ctx) => `CompanyEmpSet?$filter=Company eq '${odataKey(ctx.co)}'`,
    write: () => 'CompanyEmpSet'
  },
  {
    id: 'accountingRules',
    label: 'Accounting Rules',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/AccountingRulesBasicDataArray`,
    write: (ctx) => `${company(ctx)}/AccountingRulesBasicDataArray`
  },
  {
    id: 'currencyRateType',
    label: 'Currency Rate Type Information',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CurrencyTypeBasicDataArray`,
    write: (ctx) => `${company(ctx)}/CurrencyTypeBasicDataArray`
  },
  {
    id: 'taxControl',
    label: 'Tax Control',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/TaxControlBasicDataArray`,
    write: (ctx) => `${company(ctx)}/TaxControlBasicDataArray`
  },
  {
    // Which users have finance access to this company — a prerequisite for
    // the Site migration's own "Users"/"Users Per Site" steps, which assume
    // the user is already known to the company. Lives on its own projection,
    // not CompanyHandling.svc — see `projection` below and
    // app/api/ifs/company-migration/route.js, which reads it per step.
    id: 'usersPerCompany',
    label: 'Users Per Company',
    method: 'POST',
    unverified: true,
    projection: 'UsersPerCompanyHandling.svc',
    read: (ctx) => `CompanyFinanceSet(Company='${odataKey(ctx.co)}')/UserFinanceArray`,
    write: (ctx) => `CompanyFinanceSet(Company='${odataKey(ctx.co)}')/UserFinanceArray`
  },
  {
    id: 'invoice',
    label: 'Invoice',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceInfoArray`
  },
  {
    id: 'defaultInvoiceType',
    label: 'Default Invoice Types',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceInfoDefInvTypes`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceInfoDefInvTypes`
  },
  {
    // The sheet's row labeled "Document Management" actually targets
    // CompanyInvoiceSuppInvWorkflows (confirmed by the tested script's own
    // variable names and payload) — this is really Supplier Invoice
    // Workflow, not Document Management.
    id: 'supplierInvoiceWorkflow',
    label: 'Supplier Invoice Workflow',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceSuppInvWorkflows`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceSuppInvWorkflows`
  },
  {
    id: 'payment',
    label: 'Payment',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/CompanyPayments`,
    write: (ctx) => `${company(ctx)}/CompanyPayments`
  },
  {
    id: 'fixedAssets',
    label: 'Fixed Assets',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyFixedAssetsArray`,
    write: (ctx) => `${company(ctx)}/CompanyFixedAssetsArray`
  },
  {
    id: 'periodicCostAllocation',
    label: 'Periodical Cost Allocation',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyCostAllocInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyCostAllocInfoArray`
  },
  {
    // The company-level "General" sub-tab of Supply Chain Information
    // (CompanySupplyChainInfoArray) — distinct from the address-scoped
    // "Address Supply Chain Information" step above.
    id: 'supplyChainGeneral',
    label: 'Supply Chain Information — General',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/CompanySupplyChainInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanySupplyChainInfoArray`
  },
  {
    id: 'warehouseManagement',
    label: 'Supply Chain Information — Warehouse Management',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyWarehousingInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyWarehousingInfoArray`
  },
  {
    id: 'procurement',
    label: 'Supply Chain Information — Procurement',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/CompanyProcurementInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyProcurementInfoArray`
  },
  {
    id: 'sales',
    label: 'Supply Chain Information — Sales',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanySalesInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanySalesInfoArray`
  },
  {
    id: 'rental',
    label: 'Supply Chain Information — Rental',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyRentalInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyRentalInfoArray`
  }
]

export function getCompanyMigrationStep(id) {
  return COMPANY_MIGRATION_STEPS.find((s) => s.id === id)
}

// Fields IFS returns on every row that must never go back in a create body —
// same list entityRegistry.js's buildEntityPayload uses for every other
// entity, so Company's sub-entities follow the same convention.
const SYSTEM_FIELD_NAMES = new Set([
  'objid', 'objversion', 'objgrants', 'objstate', 'objevents', 'objkey', 'luname', 'keyref', 'rowversion', 'stateindicator'
])
// IFS-computed read-only booleans reporting whether a related record set
// exists (e.g. "DetailAddressExist") — never a real input field.
const EXCLUDED_FIELD_PATTERN = /Exist$/i

// Some fields IFS's GET returns are computed display summaries, not plain
// input — e.g. Address's own "Address" field came back as
// "\r\n - \r\nLK - SRI LANKA" (city/street lines joined with real carriage
// returns, falling back to just the country when the rest is blank). Echoed
// straight back on create, IFS's own parser rejects the whole request as
// "Malformed Request." — not something this app raises, but preventable:
// strip embedded control characters from every string value before
// sending, since any free-text field could carry the same kind of
// GET-only formatting.
function sanitizeValue(value) {
  if (typeof value !== 'string') return value
  return value.replace(/[\r\n\t]+/g, ' ').trim()
}

// Sends whatever the Source record actually has, minus system/bookkeeping
// fields and OData annotations (@odata.etag, ...) — not a curated per-step
// allow-list. See the module comment above for why.
export function buildStepPayload(step, record) {
  if (!record) return {}
  const payload = {}
  Object.entries(record).forEach(([key, value]) => {
    if (key.startsWith('@')) return
    if (SYSTEM_FIELD_NAMES.has(key.toLowerCase())) return
    if (EXCLUDED_FIELD_PATTERN.test(key)) return
    payload[key] = sanitizeValue(value)
  })
  return payload
}
