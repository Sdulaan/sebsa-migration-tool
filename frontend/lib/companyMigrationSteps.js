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
// - "Address Supply Chain Information"'s tested field list (7 fields) is
//   narrower than entityTabsConfig.json's — narrowed to match what's
//   actually confirmed working.
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
// `needsAddress`: scoped to one address (an AddressId), not just the company
// code. Only the company's first address is migrated for now (matches the
// same limitation in Review Data) — a company with several addresses only
// gets these steps for its first one.

import entityTabsConfig from './entityTabsConfig.json'

export const COMPANY_PROJECTION = 'CompanyHandling.svc'

// "*Exist" flags are IFS-computed read-only booleans (same rule already
// applied to PART_CATALOG_MIGRATION_FIELDS — see docs/IFS_API_INTEGRATION.md
// Gotchas) — never safe to POST/PATCH, so they're dropped from every tab's
// field list here, not just the one the sheet happened to show one in.
const EXCLUDED_FIELD_PATTERN = /Exist$/i
const TAB_FIELDS = Object.fromEntries(
  (entityTabsConfig.company || []).map((t) => [t.tabId, t.fields.filter((f) => !EXCLUDED_FIELD_PATTERN.test(f))])
)

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
    write: (ctx) => `${company(ctx)}/CompanyAddresses`,
    fields: TAB_FIELDS.address
  },
  {
    id: 'addressTypes',
    label: 'Address Types',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/AddressTypes`,
    write: (ctx) => `${address(ctx)}/AddressTypes`,
    fields: TAB_FIELDS.address_types
  },
  {
    id: 'communicationMethods',
    label: 'Communication Method',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/AddressCommunicationMethods`,
    write: (ctx) => `${address(ctx)}/AddressCommunicationMethods`,
    fields: TAB_FIELDS.communication_methods
  },
  {
    id: 'taxInformation',
    label: 'Tax Information',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/TaxCodes`,
    write: (ctx) => `${address(ctx)}/TaxCodes`,
    fields: TAB_FIELDS.tax_information
  },
  {
    id: 'taxExempt',
    label: 'Tax Exempt Information',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/TaxExempArray`,
    write: (ctx) => `${address(ctx)}/TaxExempArray`,
    fields: TAB_FIELDS.tax_excempt_information
  },
  {
    id: 'addressSupplyChain',
    label: 'Address Supply Chain Information',
    method: 'POST',
    needsAddress: true,
    read: (ctx) => `${address(ctx)}/CompanyAddressSupplyChainInfoArray`,
    write: (ctx) => `${address(ctx)}/CompanyAddressSupplyChainInfoArray`,
    // Narrowed to Post Bulks.txt's tested set — entityTabsConfig.json's list
    // included a few fields (CompanyPrefix, SsccCompanyPrefix, ...) that
    // look like they actually belong to the company-level Supply Chain
    // Information (CompanySupplyChainInfoArray) instead.
    fields: ['AddressId', 'Company', 'IntrastatExempt', 'Contact', 'DeliveryTerms', 'ShipViaCode', 'AddressName']
  },
  {
    id: 'messageSetup',
    label: 'Message Setup',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/MessageSetups`,
    write: (ctx) => `${company(ctx)}/MessageSetups`,
    fields: TAB_FIELDS.message_setup
  },
  {
    id: 'employees',
    label: 'Employees',
    method: 'POST',
    // CompanyEmpSet is its own top-level entity set, not a nav property off
    // CompanySet — filtered by Company instead.
    read: (ctx) => `CompanyEmpSet?$filter=Company eq '${odataKey(ctx.co)}'`,
    write: () => 'CompanyEmpSet',
    fields: TAB_FIELDS.employees
  },
  {
    id: 'accountingRules',
    label: 'Accounting Rules',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/AccountingRulesBasicDataArray`,
    write: (ctx) => `${company(ctx)}/AccountingRulesBasicDataArray`,
    fields: TAB_FIELDS.accounting_rules
  },
  {
    id: 'currencyRateType',
    label: 'Currency Rate Type Information',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CurrencyTypeBasicDataArray`,
    write: (ctx) => `${company(ctx)}/CurrencyTypeBasicDataArray`,
    fields: TAB_FIELDS.currency_rate_type_information
  },
  {
    id: 'taxControl',
    label: 'Tax Control',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/TaxControlBasicDataArray`,
    write: (ctx) => `${company(ctx)}/TaxControlBasicDataArray`,
    fields: TAB_FIELDS.tax_control
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
    write: (ctx) => `CompanyFinanceSet(Company='${odataKey(ctx.co)}')/UserFinanceArray`,
    fields: ['Company', 'Userid']
  },
  {
    id: 'invoice',
    label: 'Invoice',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceInfoArray`,
    fields: TAB_FIELDS.invoice
  },
  {
    id: 'defaultInvoiceType',
    label: 'Default Invoice Types',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceInfoDefInvTypes`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceInfoDefInvTypes`,
    fields: TAB_FIELDS.default_invoice_type
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
    write: (ctx) => `${company(ctx)}/CompanyInvoiceSuppInvWorkflows`,
    fields: [
      'AddEmptyPostingLine', 'AuthAuthentication', 'AuthorizationRouting', 'AuthorizerFromPurch', 'Company',
      'ConvertTiffToPdf', 'CreateZeroInvPosting', 'ExcludePoPostings', 'ExcludePostingAuth', 'InvChargeAutomation',
      'RequisitionerAsAck', 'TwoAuthorizers', 'ValidationAtPosting', 'TwoAuthorizersAmount', 'LedgerAssistant'
    ]
  },
  {
    id: 'payment',
    label: 'Payment',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/CompanyPayments`,
    write: (ctx) => `${company(ctx)}/CompanyPayments`,
    fields: TAB_FIELDS.payment
  },
  {
    id: 'fixedAssets',
    label: 'Fixed Assets',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyFixedAssetsArray`,
    write: (ctx) => `${company(ctx)}/CompanyFixedAssetsArray`,
    fields: TAB_FIELDS.fixed_asset
  },
  {
    id: 'periodicCostAllocation',
    label: 'Periodical Cost Allocation',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyCostAllocInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyCostAllocInfoArray`,
    fields: TAB_FIELDS.periodic_cost_allocation
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
    write: (ctx) => `${company(ctx)}/CompanySupplyChainInfoArray`,
    fields: ['SsccCompanyPrefix', 'UseAccountingYear']
  },
  {
    id: 'warehouseManagement',
    label: 'Supply Chain Information — Warehouse Management',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyWarehousingInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyWarehousingInfoArray`,
    fields: TAB_FIELDS.warehouse_management
  },
  {
    id: 'procurement',
    label: 'Supply Chain Information — Procurement',
    method: 'POST',
    unverified: true,
    read: (ctx) => `${company(ctx)}/CompanyProcurementInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyProcurementInfoArray`,
    fields: TAB_FIELDS.procument
  },
  {
    id: 'sales',
    label: 'Supply Chain Information — Sales',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanySalesInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanySalesInfoArray`,
    fields: TAB_FIELDS.sales
  },
  {
    id: 'rental',
    label: 'Supply Chain Information — Rental',
    method: 'POST',
    read: (ctx) => `${company(ctx)}/CompanyRentalInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyRentalInfoArray`,
    fields: TAB_FIELDS.rental
  }
]

export function getCompanyMigrationStep(id) {
  return COMPANY_MIGRATION_STEPS.find((s) => s.id === id)
}

// Picks the step's mapped fields off a Source record, in order. Fields the
// Source didn't return are left out rather than sent empty.
// Some fields IFS's GET returns are computed display summaries, not plain
// input — e.g. "Address" came back as "\r\n - \r\nLK - SRI LANKA" (city/
// street lines joined with real carriage returns, falling back to just the
// country when the rest is blank). Echoed straight back on create, IFS's
// own parser rejects the whole request as "Malformed Request." — not
// something this app raises, but preventable: strip embedded control
// characters from every string value before sending, since any free-text
// field could carry the same kind of GET-only formatting.
function sanitizeValue(value) {
  if (typeof value !== 'string') return value
  return value.replace(/[\r\n\t]+/g, ' ').trim()
}

export function buildStepPayload(step, record) {
  const payload = {}
  ;(step.fields || []).forEach((field) => {
    if (record && field in record) payload[field] = sanitizeValue(record[field])
  })
  return payload
}
