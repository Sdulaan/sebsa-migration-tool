// Server-only: OData $batch plumbing. A port of the Postman pre-request
// script (JSON array -> multipart/mixed batch, one changeset per record) and
// the Postman test script (multipart response -> per-record result),
// generalised to any entity set. Pure functions: no network, no secrets.

function validateObject(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'Invalid record'
  return null
}

// Builds the multipart/mixed request body POSTing every record to
// `entitySet`. Every valid record gets its own changeset (so IFS can accept
// some and reject others, together with the odata.continue-on-error
// preference). Records that fail `validate` are left out and returned in
// `skipped`; `recordMap` is keyed by each record's Content-ID so the response
// can be matched back to it. `body` is null when nothing valid is left to send.
export function buildODataBatch(entitySet, records, validate = validateObject) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const boundary = `batch_${suffix}`
  const lines = []
  const recordMap = {}
  const skipped = []

  records.forEach((record, index) => {
    const id = index + 1
    const problem = validateObject(record) || validate(record, index)
    if (problem) {
      skipped.push({ index, error: problem, record })
      return
    }

    const changeset = `changeset_${suffix}_${id}`
    lines.push(
      `--${boundary}`,
      `Content-Type: multipart/mixed; boundary=${changeset}`,
      '',
      `--${changeset}`,
      'Content-Type: application/http',
      'Content-Transfer-Encoding: binary',
      `Content-ID: ${id}`,
      '',
      `POST ${typeof entitySet === 'function' ? entitySet(record, index) : entitySet} HTTP/1.1`,
      'Content-Type: application/json',
      'Accept: application/json',
      '',
      JSON.stringify(record),
      '',
      `--${changeset}--`
    )
    recordMap[id] = { originalIndex: index, record }
  })

  if (Object.keys(recordMap).length === 0) return { body: null, boundary, recordMap, skipped }

  lines.push(`--${boundary}--`, '')
  return { body: lines.join('\r\n'), boundary, recordMap, skipped }
}

function readJsonString(part, name) {
  const match = part.match(new RegExp(`"${name}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'))
  if (!match) return null
  try {
    return JSON.parse(`"${match[1]}"`)
  } catch {
    return match[1]
  }
}

// Reads each record's individual HTTP response out of a multipart/mixed
// batch response. Returns { [contentId]: { status, error, errorCode } };
// a Content-ID missing from the result means IFS gave no identifiable
// answer for that record.
export function parseODataBatchResponse(text, contentType) {
  const results = {}
  if (!/multipart\/mixed/i.test(contentType || '')) return results

  // Each individual HTTP response follows an "application/http" part header.
  text.split(/Content-Type:\s*application\/http[^\r\n]*/i).slice(1).forEach((part) => {
    const idMatch = part.match(/Content-ID:\s*(\d+)/i)
    const statusMatch = part.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})[^\r\n]*/i)
    if (!idMatch || !statusMatch) return

    const status = Number(statusMatch[1])
    let error = null
    let errorCode = null
    if (status >= 300) {
      // IFS may put the useful explanation in error.details rather than
      // error.message. Keep the status line when the body cannot be parsed.
      const httpPart = part.slice(statusMatch.index)
      const separator = /\r?\n\r?\n/.exec(httpPart)
      const rawBody = separator ? httpPart.slice(separator.index + separator[0].length).split(/\r?\n--[A-Za-z0-9_.-]+/)[0].trim() : ''
      let parsed = null
      try { parsed = JSON.parse(rawBody) } catch {}
      const apiError = parsed?.error || parsed
      const message = (value) => typeof value === 'string' ? value : typeof value?.value === 'string' ? value.value : null
      const details = Array.isArray(apiError?.details) ? apiError.details.map((item) => message(item?.message)).filter(Boolean) : []
      error = details.join('; ') || message(apiError?.message) || readJsonString(part, 'message') || statusMatch[0].trim()
      errorCode = apiError?.code || readJsonString(part, 'code')
    }
    results[idMatch[1]] = { status, error, errorCode }
  })

  return results
}

// ---- PartCatalogSet (standalone /new-migration/part-catalog-set page) ----

function validatePart(record) {
  if (typeof record.PartNo !== 'string' || !record.PartNo.trim()) return 'Missing or invalid PartNo'
  return null
}

export function buildPartCatalogBatch(records) {
  const batch = buildODataBatch('PartCatalogSet', records, validatePart)
  Object.values(batch.recordMap).forEach((entry) => {
    entry.PartNo = entry.record.PartNo
  })
  batch.skipped = batch.skipped.map((s) => ({ index: s.index, PartNo: s.record?.PartNo || 'Unknown', error: s.error, record: s.record }))
  return batch
}

// Sorts every submitted part into successful / failed / unconfirmed. Locally
// skipped parts count as failed. "Unconfirmed" means IFS returned nothing
// identifiable for that part, so it's unknown whether it was created.
export function parsePartCatalogBatchResponse(text, contentType, recordMap, skipped) {
  const results = parseODataBatchResponse(text, contentType)
  const successful = []
  const failed = [...skipped]
  const unconfirmed = []

  Object.entries(recordMap).forEach(([id, entry]) => {
    const result = results[id]
    if (!result) {
      unconfirmed.push({
        PartNo: entry.PartNo,
        index: entry.originalIndex,
        record: entry.record,
        error: 'No identifiable individual response'
      })
    } else if (result.status >= 200 && result.status < 300) {
      successful.push({ PartNo: entry.PartNo, status: result.status })
    } else {
      failed.push({ PartNo: entry.PartNo, status: result.status, error: result.error, record: entry.record })
    }
  })

  return { successful, failed, unconfirmed }
}
