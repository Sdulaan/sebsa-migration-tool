// Real GET data for the Company entity's Review Data sub-tabs — everything
// else (Site, Customer, ...) still uses reviewDetailMock.js. Shaped exactly
// like buildReviewSubTabs() so ReviewAccordion doesn't need to know the
// difference: [{ tabId, tabName, sections: [{ title, fields }] }].
//
// The tab LIST shown here is fixed to match the real IFS Aurena Company page
// (Address, Communication Method, Message Setup, Employees, Accounting
// Rules, Tax Control, Invoice, Payment, Fixed Assets, Periodical Cost
// Allocation, Supply Chain Information, Localization Control Center) — not
// the 24-tab schema generated from the Excel sheet, which splits several of
// these into separate leaf entries that the real IFS UI shows as sections of
// one screen (e.g. "Invoice" also covers what the sheet calls
// default_invoice_type/po_matching/document_management — the latter two turn
// out to be the *same* CompanyInvoiceInfoArray record as "invoice" itself,
// just different field subsets of the sheet's sample, so they're fetched
// once and not repeated as separate sections).
//
// "General" (the header) isn't in this list — it's the record itself, shown
// above the tabs, not a tab. "Localization Control Center" has no endpoint
// in "REST APIs.xlsx" at all, so it always shows "Not available".
//
// Nothing here is ever sent back to IFS — Transfer still POSTs only the
// header, via postCompanyHeaderBatch.

import { SOURCE_ENV, getEnvironmentConfig, fetchCompanySubEntity, visibleRecordFields } from './migrationStore'

// Each display tab pulls one or more underlying leaf endpoints (see
// COMPANY_SUB_ENTITY_PATHS in migrationStore.js), shown as separate labeled
// sections when they're genuinely different data.
const DISPLAY_TABS = [
  { tabId: 'address', tabName: 'Address', sources: [
      { leaf: 'address', label: 'General' },
      { leaf: 'address_types', label: 'Address Types' },
      { leaf: 'tax_information', label: 'Tax Information' },
      { leaf: 'tax_excempt_information', label: 'Tax Exempt Information' }
    ] },
  { tabId: 'communication_method', tabName: 'Communication Method', sources: [{ leaf: 'communication_methods', label: null }] },
  { tabId: 'message_setup', tabName: 'Message Setup', sources: [{ leaf: 'message_setup', label: null }] },
  { tabId: 'employees', tabName: 'Employees', sources: [{ leaf: 'employees', label: null }] },
  { tabId: 'accounting_rules', tabName: 'Accounting Rules', sources: [
      { leaf: 'accounting_rules', label: 'General Data' },
      { leaf: 'currency_rate_type_information', label: 'Currency Rate Type Information' }
    ] },
  { tabId: 'tax_control', tabName: 'Tax Control', sources: [{ leaf: 'tax_control', label: null }] },
  { tabId: 'invoice', tabName: 'Invoice', sources: [
      { leaf: 'invoice', label: 'General' },
      { leaf: 'default_invoice_type', label: 'Default Invoice Types' }
    ] },
  { tabId: 'payment', tabName: 'Payment', sources: [{ leaf: 'payment', label: 'General' }] },
  { tabId: 'fixed_asset', tabName: 'Fixed Assets', sources: [{ leaf: 'fixed_asset', label: null }] },
  { tabId: 'periodic_cost_allocation', tabName: 'Periodical Cost Allocation', sources: [{ leaf: 'periodic_cost_allocation', label: null }] },
  { tabId: 'supply_chain_information', tabName: 'Supply Chain Information', sources: [
      { leaf: 'supply_chain_information', label: 'General' },
      { leaf: 'warehouse_management', label: 'Warehouse Management' },
      { leaf: 'procument', label: 'Procurement' },
      { leaf: 'sales', label: 'Sales' },
      { leaf: 'rental', label: 'Rental' }
    ] },
  { tabId: 'localization', tabName: 'Localization Control Center', sources: [] }
]

// Address-scoped leaves (need an AddressId, not just the company code) —
// keep in sync with COMPANY_SUB_ENTITY_NEEDS_ADDRESS in migrationStore.js.
const ADDRESS_SCOPED_LEAVES = new Set([
  'address_types',
  'communication_methods',
  'tax_information',
  'tax_excempt_information',
  'supply_chain_information'
])

// The tab list for the accordion buttons — id + name only, same list
// fetchCompanyReviewSubTabs fills in. Used in place of reviewSubTabList()
// for the "company" entity, so the sidebar's tab names match what's real.
export const COMPANY_REVIEW_TABS = DISPLAY_TABS.map(({ tabId, tabName }) => ({ tabId, tabName }))

function allLeaves() {
  return [...new Set(DISPLAY_TABS.flatMap((tab) => tab.sources.map((s) => s.leaf)))]
}

// One section per record (a company can have several addresses, for
// instance); each field rendered as plain text — this is real, read-only
// data, not the mock's typed select/date/toggle form controls. `label`
// prefixes the section title when a tab merges more than one leaf endpoint.
function recordsToSections(records, label, emptyLabel) {
  const prefix = label ? `${label} — ` : ''
  if (!records || records.length === 0) {
    return [{ title: `${prefix}${emptyLabel}`, fields: [] }]
  }
  return records.map((record, i) => ({
    title: records.length > 1 ? `${prefix}Record ${i + 1}` : `${prefix}${label ? 'Details' : 'General Information'}`,
    fields: visibleRecordFields(record).map(([fieldLabel, value], j) => ({
      id: `${fieldLabel}-${j}`,
      label: fieldLabel,
      type: 'text',
      value: value === null || value === undefined ? '' : String(value)
    }))
  }))
}

function errorSections(label, message) {
  const prefix = label ? `${label} — ` : ''
  return [{ title: `${prefix}Could not load`, fields: [{ id: 'error', label: 'Error', type: 'text', value: message }] }]
}

export async function fetchCompanyReviewSubTabs(record) {
  const company = record?.Company
  if (!company) {
    return { success: false, error: 'This record has no Company code.' }
  }

  const config = getEnvironmentConfig(SOURCE_ENV)
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }

  const leaves = allLeaves()
  const directLeaves = leaves.filter((leaf) => !ADDRESS_SCOPED_LEAVES.has(leaf))
  const addressScopedLeaves = leaves.filter((leaf) => ADDRESS_SCOPED_LEAVES.has(leaf))

  const directResults = {}
  const directResponses = await Promise.all(
    directLeaves.map((leaf) => fetchCompanySubEntity(SOURCE_ENV, config, company, leaf))
  )
  directLeaves.forEach((leaf, i) => {
    directResults[leaf] = directResponses[i]
  })

  // The address-scoped leaves need an AddressId — use the first address the
  // "address" leaf itself returned.
  const primaryAddressId = directResults.address?.success ? directResults.address.records[0]?.AddressId : null

  const scopedResults = {}
  if (primaryAddressId) {
    const scopedResponses = await Promise.all(
      addressScopedLeaves.map((leaf) => fetchCompanySubEntity(SOURCE_ENV, config, company, leaf, primaryAddressId))
    )
    addressScopedLeaves.forEach((leaf, i) => {
      scopedResults[leaf] = scopedResponses[i]
    })
  } else {
    addressScopedLeaves.forEach((leaf) => {
      scopedResults[leaf] = {
        success: false,
        error: "This company has no address on file (or it couldn't be fetched) — scoped to the company's first address."
      }
    })
  }

  const leafResults = { ...directResults, ...scopedResults }

  const subTabs = DISPLAY_TABS.map((tab) => {
    if (tab.sources.length === 0) {
      return { tabId: tab.tabId, tabName: tab.tabName, sections: [{ title: 'Not available', fields: [] }] }
    }
    const sections = tab.sources.flatMap(({ leaf, label }) => {
      const res = leafResults[leaf]
      return res?.success ? recordsToSections(res.records, label, 'No records found') : errorSections(label, res?.error || 'Unknown error')
    })
    return { tabId: tab.tabId, tabName: tab.tabName, sections }
  })

  return { success: true, subTabs }
}
