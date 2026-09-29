// Real GET data for the Site entity's Review Data sub-tabs, the Site
// counterpart of companyReviewData.js and shaped the same way for
// ReviewAccordion: [{ tabId, tabName, sections: [{ title, fields }] }].
//
// "General" is the CompanySiteSet record itself (the IFS Site form's Company
// Site Group). The rest are the site-level GETs from docs/Full API
// Company.xlsx (lib/siteDataSources.js), fetched in the workbook's order via
// /api/ifs/site-data, one tab per call.

import { SOURCE_ENV, getEnvironmentConfig, fetchSiteData } from './migrationStore'
import { SITE_DATA_SOURCES } from './siteDataSources'
import { recordsToSections, errorSections } from './companyReviewData'

export const SITE_REVIEW_TABS = [
  { tabId: 'general', tabName: 'General' },
  ...SITE_DATA_SOURCES.map((source) => ({ tabId: source.id, tabName: source.label }))
]

export async function fetchSiteReviewSubTabs(record) {
  const contract = record?.Contract
  const company = record?.Company
  if (!contract || !company) {
    return { success: false, error: 'This site record has no Contract or Company.' }
  }

  const result = await fetchSiteData(SOURCE_ENV, getEnvironmentConfig(SOURCE_ENV), String(contract), String(company))
  if (!result.success) return { success: false, error: result.error }

  const general = { tabId: 'general', tabName: 'General', sections: recordsToSections([record], null, 'No data') }
  const subTabs = result.sections.map((section) => ({
    tabId: section.id,
    tabName: section.label,
    sections: section.error ? errorSections(null, section.error) : recordsToSections(section.records, null, 'No records found')
  }))

  return { success: true, subTabs: [general, ...subTabs] }
}
