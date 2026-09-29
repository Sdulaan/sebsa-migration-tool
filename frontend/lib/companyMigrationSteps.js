// Every Company sub-entity write this app knows a real endpoint for, from
// "REST APIs.xlsx" (Company sheet) — see docs/COMPANY_MIGRATION.md for the
// full report. A company is migrated by running these strictly in order,
// after the header (Company itself — a separate, special step; see below):
// each step reads from the Source and writes to the Destination through
// CompanyHandling's $batch (see app/api/ifs/company-migration/route.js).
//
// Field lists are the same ones lib/companyReviewData.js already shows in
// Review Data (from lib/entityTabsConfig.json, generated from this sheet) —
// reusing vetted data rather than retyping field names.
//
// `method`:
//   'POST'  creates each record — these are genuine lists (a company can
//           have several addresses, employees, ...). The sheet gave a real
//           POST sample for each of these.
//   'PATCH' updates the ONE record IFS's CreateNewCompany template assistant
//           already created for this company (Accounting Rules, Tax
//           Control, Invoice, Payment, ...). The sheet's own POST samples
//           for these were empty or explicitly noted "Data already exists" —
//           there is nothing to create, only to update — so these go
//           straight to PATCH, reading the Destination record's ETag first
//           for If-Match, exactly like the Site migration's PATCH steps.
//
// `needsAddress`: scoped to one address (an AddressId), not just the company
// code. Only the company's first address is migrated for now (matches the
// same limitation in Review Data) — a company with several addresses only
// gets these five sub-sections for its first one.

import entityTabsConfig from './entityTabsConfig.json'

export const COMPANY_PROJECTION = 'CompanyHandling.svc'

const TAB_FIELDS = Object.fromEntries((entityTabsConfig.company || []).map((t) => [t.tabId, t.fields]))

const company = (ctx) => `CompanySet(Company='${ctx.co}')`
const address = (ctx) => `${company(ctx)}/CompanyAddresses(Company='${ctx.co}',AddressId='${ctx.addr}')`

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
    fields: TAB_FIELDS.supply_chain_information
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
    read: (ctx) => `CompanyEmpSet?$filter=Company eq '${ctx.co}'`,
    write: () => 'CompanyEmpSet',
    fields: TAB_FIELDS.employees
  },
  {
    id: 'accountingRules',
    label: 'Accounting Rules',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/AccountingRulesBasicDataArray`,
    write: (ctx) => `${company(ctx)}/AccountingRulesBasicDataArray(Company='${ctx.co}')`,
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
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/TaxControlBasicDataArray`,
    write: (ctx) => `${company(ctx)}/TaxControlBasicDataArray(Company='${ctx.co}')`,
    fields: TAB_FIELDS.tax_control
  },
  {
    id: 'invoice',
    label: 'Invoice',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceInfoArray(Company='${ctx.co}')`,
    fields: TAB_FIELDS.invoice
  },
  {
    id: 'defaultInvoiceType',
    label: 'Default Invoice Types',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceInfoDefInvTypes`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceInfoDefInvTypes(Company='${ctx.co}')`,
    fields: TAB_FIELDS.default_invoice_type
  },
  {
    // Not in entityTabsConfig.json (the generator didn't produce this tab) —
    // the only fields confirmed are the sheet's own PATCH sample (row 643).
    id: 'supplierInvoiceWorkflow',
    label: 'Supplier Invoice Workflow',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyInvoiceSuppInvWorkflows`,
    write: (ctx) => `${company(ctx)}/CompanyInvoiceSuppInvWorkflows(Company='${ctx.co}')`,
    fields: ['AddEmptyPostingLine', 'AuthorizerFromPurch']
  },
  {
    id: 'payment',
    label: 'Payment',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyPayments`,
    write: (ctx) => `${company(ctx)}/CompanyPayments(Company='${ctx.co}')`,
    fields: TAB_FIELDS.payment
  },
  {
    id: 'fixedAssets',
    label: 'Fixed Assets',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyFixedAssetsArray`,
    write: (ctx) => `${company(ctx)}/CompanyFixedAssetsArray(Company='${ctx.co}')`,
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
    // "Address Supply Chain Information" step above. Not in
    // entityTabsConfig.json; fields are the sheet's PATCH sample (row 812).
    id: 'supplyChainGeneral',
    label: 'Supply Chain Information — General',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanySupplyChainInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanySupplyChainInfoArray(Company='${ctx.co}')`,
    fields: ['SsccCompanyPrefix', 'UseAccountingYear']
  },
  {
    id: 'warehouseManagement',
    label: 'Supply Chain Information — Warehouse Management',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyWarehousingInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyWarehousingInfoArray(Company='${ctx.co}')`,
    fields: TAB_FIELDS.warehouse_management
  },
  {
    id: 'procurement',
    label: 'Supply Chain Information — Procurement',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyProcurementInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyProcurementInfoArray(Company='${ctx.co}')`,
    fields: TAB_FIELDS.procument
  },
  {
    id: 'sales',
    label: 'Supply Chain Information — Sales',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanySalesInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanySalesInfoArray(Company='${ctx.co}')`,
    fields: TAB_FIELDS.sales
  },
  {
    id: 'rental',
    label: 'Supply Chain Information — Rental',
    method: 'PATCH',
    read: (ctx) => `${company(ctx)}/CompanyRentalInfoArray`,
    write: (ctx) => `${company(ctx)}/CompanyRentalInfoArray(Company='${ctx.co}')`,
    fields: TAB_FIELDS.rental
  }
]

export function getCompanyMigrationStep(id) {
  return COMPANY_MIGRATION_STEPS.find((s) => s.id === id)
}

// Picks the step's mapped fields off a Source record, in order. Fields the
// Source didn't return are left out rather than sent empty.
export function buildStepPayload(step, record) {
  const payload = {}
  ;(step.fields || []).forEach((field) => {
    if (record && field in record) payload[field] = record[field]
  })
  return payload
}
