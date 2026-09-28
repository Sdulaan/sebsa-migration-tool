// Real GET data for the Company entity's Review Data sub-tabs — everything
// else (Site, Customer, ...) still uses reviewDetailMock.js. Shaped exactly
// like buildReviewSubTabs() so ReviewAccordion doesn't need to know the
// difference: [{ tabId, tabName, sections: [{ title, fields }] }].
//
// "general" is the already-fetched CompanySet record itself, no extra call.
// The other tabs this entity knows how to fetch (COMPANY_SUB_ENTITY_TAB_IDS
// in migrationStore.js) are one GET each; a tab the Excel-generated schema
// lists but this doesn't yet have an endpoint for just shows "Not available".
// Some tabs are scoped to one address, not the whole company (see
// COMPANY_SUB_ENTITY_NEEDS_ADDRESS) — this uses the first address the
// "address" tab itself returns. A company with several addresses only shows
// those tabs for that one address for now.
//
// Nothing here is ever sent back to IFS — Transfer still POSTs only the
// header, via postCompanyHeaderBatch.

import {
  SOURCE_ENV,
  getEnvironmentConfig,
  fetchCompanySubEntity,
  visibleRecordFields,
  COMPANY_SUB_ENTITY_TAB_IDS,
  COMPANY_SUB_ENTITY_NEEDS_ADDRESS
} from './migrationStore'
import { getEntitySubTabs } from './erpEntitySchema'

const DIRECT_TABS = COMPANY_SUB_ENTITY_TAB_IDS.filter((id) => !COMPANY_SUB_ENTITY_NEEDS_ADDRESS.has(id))
const ADDRESS_SCOPED_TABS = COMPANY_SUB_ENTITY_TAB_IDS.filter((id) => COMPANY_SUB_ENTITY_NEEDS_ADDRESS.has(id))

// One section per record (a company can have several addresses, for
// instance); each field rendered as plain text — this is real, read-only
// data, not the mock's typed select/date/toggle form controls.
function recordsToSections(records, emptyLabel) {
  if (!records || records.length === 0) {
    return [{ title: emptyLabel, fields: [] }]
  }
  return records.map((record, i) => ({
    title: records.length > 1 ? `Record ${i + 1}` : 'General Information',
    fields: visibleRecordFields(record).map(([label, value], j) => ({
      id: `${label}-${j}`,
      label,
      type: 'text',
      value: value === null || value === undefined ? '' : String(value)
    }))
  }))
}

function errorSections(message) {
  return [{ title: 'Could not load', fields: [{ id: 'error', label: 'Error', type: 'text', value: message }] }]
}

export async function fetchCompanyReviewSubTabs(record) {
  const company = record?.Company
  const tabDefs = getEntitySubTabs('company')
  if (!company) {
    return { success: false, error: 'This record has no Company code.' }
  }

  const config = getEnvironmentConfig(SOURCE_ENV)
  if (!config?.baseUrl) {
    return { success: false, error: 'This environment has no Base URL configured — set one in "Configure source environment".' }
  }

  const sections = { general: recordsToSections([record], 'No data') }

  const directResults = await Promise.all(
    DIRECT_TABS.map((tabId) => fetchCompanySubEntity(SOURCE_ENV, config, company, tabId))
  )
  DIRECT_TABS.forEach((tabId, i) => {
    const res = directResults[i]
    sections[tabId] = res.success ? recordsToSections(res.records, 'No records found') : errorSections(res.error)
  })

  // The address-scoped tabs need an AddressId — use the first address from
  // whatever the "address" tab itself fetched.
  const addressResult = directResults[DIRECT_TABS.indexOf('address')]
  const primaryAddressId = addressResult.success ? addressResult.records[0]?.AddressId : null

  if (primaryAddressId) {
    const scopedResults = await Promise.all(
      ADDRESS_SCOPED_TABS.map((tabId) => fetchCompanySubEntity(SOURCE_ENV, config, company, tabId, primaryAddressId))
    )
    ADDRESS_SCOPED_TABS.forEach((tabId, i) => {
      const res = scopedResults[i]
      sections[tabId] = res.success ? recordsToSections(res.records, 'No records found') : errorSections(res.error)
    })
  } else {
    ADDRESS_SCOPED_TABS.forEach((tabId) => {
      sections[tabId] = [
        {
          title: 'No address found',
          fields: [
            {
              id: 'note',
              label: 'Note',
              type: 'text',
              value: "This company has no address on file (or it couldn't be fetched) — this tab is scoped to the company's first address."
            }
          ]
        }
      ]
    })
  }

  return {
    success: true,
    subTabs: tabDefs.map((tab) => ({
      tabId: tab.tabId,
      tabName: tab.tabName,
      sections: sections[tab.tabId] || [{ title: 'Not available', fields: [] }]
    }))
  }
}
