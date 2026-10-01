// Real data for the part entities' Review Data sub-tabs (Master Part,
// Inventory Part, Purchase Part, Sales Part), the counterpart of
// companyReviewData.js / siteReviewData.js and shaped the same way for
// ReviewAccordion: [{ tabId, tabName, sections }].
//
// These entities have no sub-entity endpoints, so it's a single "General" tab
// built from the record the Review step already fetched — no extra call. It's
// split into the fields the entity's POST sends (its allow-list in
// lib/entityRegistry.js, in that order) and the rest, which aren't sent.

import { recordsToSections } from './companyReviewData'
import { pickPayloadFields } from './migrationFields'

const TABS = [{ tabId: 'general', tabName: 'General' }]

// A titled section for one subset of the record's fields.
function section(title, fields, emptyTitle) {
  const [built] = recordsToSections([fields], null, emptyTitle)
  return Object.keys(fields).length === 0 ? { title: emptyTitle, fields: [] } : { ...built, title }
}

// { tabs, fetchSubTabs } for an entity whose POST body is the given ordered
// field allow-list, plus any fixed values it always sends (e.g. PartCatalogSet's
// PositionPart) — shown as sent, not as the source record has them.
export function allowListReview(allowList, fixedValues = null) {
  const allowed = new Set([...allowList, ...Object.keys(fixedValues || {})])

  async function fetchSubTabs(record) {
    if (!record) return { success: false, error: 'No record selected.' }

    const transferred = pickPayloadFields(record, allowList, fixedValues)
    const other = Object.fromEntries(Object.entries(record).filter(([key]) => !allowed.has(key)))

    const sections = [
      section(`Transferred to IFS (${Object.keys(transferred).length} fields)`, transferred, 'Transferred to IFS — none of the fields are present'),
      section('Other fields (not transferred)', other, 'Other fields — none')
    ]
    // recordsToSections drops IFS bookkeeping fields (@odata.*, objid, …), so
    // an "Other" section can end up empty even when the record had such keys.
    if (sections[1].fields.length === 0) sections.pop()

    return { success: true, subTabs: [{ tabId: 'general', tabName: 'General', sections }] }
  }

  return { tabs: TABS, fetchSubTabs }
}
