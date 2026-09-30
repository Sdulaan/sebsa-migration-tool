// Server-only: SalesPartSet wrappers around the generic OData $batch plumbing
// in ./ifsBatch.js — the same shape as its PartCatalogSet wrappers, but a
// sales part is identified by its site AND catalog number.
import { buildODataBatch, parseODataBatchResponse } from './ifsBatch'

const isText = (v) => typeof v === 'string' && v.trim() !== ''

function validateSalesPart(record) {
  if (!isText(record.Contract)) return 'Missing or invalid Contract'
  if (!isText(record.CatalogNo)) return 'Missing or invalid CatalogNo'
  return null
}

// "SITE / CATALOG NO" for results and error messages.
function partKey(record) {
  const contract = isText(record?.Contract) ? record.Contract : '?'
  const catalogNo = isText(record?.CatalogNo) ? record.CatalogNo : '?'
  return `${contract} / ${catalogNo}`
}

export function buildSalesPartBatch(records) {
  const batch = buildODataBatch('SalesPartSet', records, validateSalesPart)
  Object.values(batch.recordMap).forEach((entry) => {
    entry.key = partKey(entry.record)
  })
  batch.skipped = batch.skipped.map((s) => ({ index: s.index, key: partKey(s.record), error: s.error, record: s.record }))
  return batch
}

// Sorts every submitted sales part into successful / failed / unconfirmed.
// Locally skipped parts count as failed. "Unconfirmed" means IFS returned
// nothing identifiable for that part, so it's unknown whether it was created.
export function parseSalesPartBatchResponse(text, contentType, recordMap, skipped) {
  const results = parseODataBatchResponse(text, contentType)
  const successful = []
  const failed = [...skipped]
  const unconfirmed = []

  Object.entries(recordMap).forEach(([id, entry]) => {
    const result = results[id]
    if (!result) {
      unconfirmed.push({ key: entry.key, index: entry.originalIndex, record: entry.record, error: 'No identifiable individual response' })
    } else if (result.status >= 200 && result.status < 300) {
      successful.push({ key: entry.key, status: result.status })
    } else {
      failed.push({ key: entry.key, status: result.status, error: result.error, errorCode: result.errorCode, record: entry.record })
    }
  })

  return { successful, failed, unconfirmed }
}
