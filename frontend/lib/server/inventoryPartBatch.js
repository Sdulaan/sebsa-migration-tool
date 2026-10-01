// Server-only: InventoryPartSet wrappers around the generic OData $batch
// plumbing in ./ifsBatch.js — the same shape as its PartCatalogSet wrappers,
// but an inventory part is identified by its site AND part number.
import { buildODataBatch, parseODataBatchResponse } from './ifsBatch'

const isText = (v) => typeof v === 'string' && v.trim() !== ''

function validateInventoryPart(record) {
  if (!isText(record.Contract)) return 'Missing or invalid Contract'
  if (!isText(record.PartNo)) return 'Missing or invalid PartNo'
  return null
}

// "SITE / PART" for results and error messages.
function partKey(record) {
  const contract = isText(record?.Contract) ? record.Contract : '?'
  const partNo = isText(record?.PartNo) ? record.PartNo : '?'
  return `${contract} / ${partNo}`
}

export function buildInventoryPartBatch(records) {
  const batch = buildODataBatch('InventoryPartSet', records, validateInventoryPart)
  Object.values(batch.recordMap).forEach((entry) => {
    entry.key = partKey(entry.record)
  })
  batch.skipped = batch.skipped.map((s) => ({ index: s.index, key: partKey(s.record), error: s.error, record: s.record }))
  return batch
}

// Sorts every submitted inventory part into successful / failed /
// unconfirmed. Locally skipped parts count as failed. "Unconfirmed" means IFS
// returned nothing identifiable for that part, so it's unknown whether it was
// created.
export function parseInventoryPartBatchResponse(text, contentType, recordMap, skipped) {
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
