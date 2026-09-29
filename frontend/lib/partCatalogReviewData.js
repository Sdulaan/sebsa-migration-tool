// Real data for the Master Part (PartCatalogSet) entity's Review Data
// sub-tabs, the counterpart of companyReviewData.js / siteReviewData.js and
// shaped the same way for ReviewAccordion: [{ tabId, tabName, sections }].
//
// There are no PartCatalogSet sub-entity endpoints, so it's a single
// "General" tab built from the record the Review step already fetched — no
// extra call. It's split into the fields the PartCatalogSet POST sends
// (PART_CATALOG_MIGRATION_FIELDS, in that order) and the rest, which aren't.

import { PART_CATALOG_MIGRATION_FIELDS } from './migrationFields'
import { recordsToSections } from './companyReviewData'

export const PART_CATALOG_REVIEW_TABS = [{ tabId: 'general', tabName: 'General' }]

// A titled section for one subset of the record's fields.
function section(title, fields, emptyTitle) {
  const [built] = recordsToSections([fields], null, emptyTitle)
  return Object.keys(fields).length === 0 ? { title: emptyTitle, fields: [] } : { ...built, title }
}

export async function fetchPartCatalogReviewSubTabs(record) {
  if (!record) return { success: false, error: 'No part record selected.' }

  const transferred = {}
  PART_CATALOG_MIGRATION_FIELDS.forEach((key) => {
    if (key in record) transferred[key] = record[key]
  })
  const transferredKeys = new Set(PART_CATALOG_MIGRATION_FIELDS)
  const other = Object.fromEntries(Object.entries(record).filter(([key]) => !transferredKeys.has(key)))

  const sections = [
    section(`Transferred to IFS (${Object.keys(transferred).length} fields)`, transferred, 'Transferred to IFS — none of the fields are present'),
    section('Other fields (not transferred)', other, 'Other fields — none')
  ]
  // recordsToSections drops IFS bookkeeping fields (@odata.*, objid, …), so an
  // "Other" section can end up empty even when the record had such keys.
  if (sections[1].fields.length === 0) sections.pop()

  return { success: true, subTabs: [{ tabId: 'general', tabName: 'General', sections }] }
}
