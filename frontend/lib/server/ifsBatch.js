// Server-only: OData $batch plumbing for the PartHandling projection's
// PartCatalogSet. A port of the Postman pre-request script (JSON array ->
// multipart/mixed batch, one changeset per part) and the Postman test script
// (multipart response -> per-part successful/failed/unconfirmed). Pure
// functions: no network, no secrets.

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'Invalid record'
  if (typeof record.PartNo !== 'string' || !record.PartNo.trim()) return 'Missing or invalid PartNo'
  return null
}

// Builds the multipart/mixed request body. Every valid part gets its own
// changeset (so IFS can accept some and reject others, together with the
// odata.continue-on-error preference). Parts that fail local validation are
// left out and returned in `skipped`; `recordMap` is keyed by each part's
// Content-ID so the response can be matched back to it. `body` is null when
// nothing valid is left to send.
export function buildPartCatalogBatch(records) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const boundary = `batch_${suffix}`
  const lines = []
  const recordMap = {}
  const skipped = []

  records.forEach((record, index) => {
    const id = index + 1
    const problem = validateRecord(record)
    if (problem) {
      skipped.push({ index, PartNo: record?.PartNo || 'Unknown', error: problem, record })
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
      'POST PartCatalogSet HTTP/1.1',
      'Content-Type: application/json',
      'Accept: application/json',
      '',
      JSON.stringify(record),
      '',
      `--${changeset}--`
    )
    recordMap[id] = { PartNo: record.PartNo, originalIndex: index, record }
  })

  if (Object.keys(recordMap).length === 0) return { body: null, boundary, recordMap, skipped }

  lines.push(`--${boundary}--`, '')
  return { body: lines.join('\r\n'), boundary, recordMap, skipped }
}

// Matches each part's individual HTTP response in a multipart/mixed batch
// response back to the part it belongs to (by Content-ID) and sorts every
// submitted part into successful / failed / unconfirmed. Locally skipped parts
// count as failed. "Unconfirmed" means IFS returned nothing identifiable for
// that part, so it's unknown whether it was created.
export function parsePartCatalogBatchResponse(text, contentType, recordMap, skipped) {
  const results = {}

  if (/multipart\/mixed/i.test(contentType || '')) {
    // Each individual HTTP response follows an "application/http" part header.
    text.split(/Content-Type:\s*application\/http[^\r\n]*/i).slice(1).forEach((part) => {
      const idMatch = part.match(/Content-ID:\s*(\d+)/i)
      const statusMatch = part.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})[^\r\n]*/i)
      if (!idMatch || !statusMatch) return

      const id = idMatch[1]
      const status = Number(statusMatch[1])
      if (!recordMap[id]) return

      let errorMessage = statusMatch[0].trim()
      if (status >= 300) {
        // Pull the IFS error message out of the JSON error body.
        const errorMatch = part.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/i)
        if (errorMatch) {
          try {
            errorMessage = JSON.parse(`"${errorMatch[1]}"`)
          } catch {
            errorMessage = errorMatch[1]
          }
        }
      }

      results[id] = { status, error: status >= 300 ? errorMessage : null }
    })
  }

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
