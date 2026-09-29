// Server-only: OData $batch plumbing for the CreateCompanyAssistantHandling
// projection's CreateNewCompany action. Modeled on ifsBatch.js (PartCatalog),
// with two differences:
//
// - CreateNewCompany is an *action*, not a plain entity-set POST. Whether
//   IFS's OData layer accepts an action inside $batch at all is unverified —
//   the caller (company-set/create/route.js) falls back to one request per
//   company when the whole call doesn't come back as multipart/mixed.
// - Success isn't just the HTTP status: a real environment returned 200 with
//   `"Success": "OPEN_LOG"` for a company that WAS created (confirmed in IFS
//   afterwards), not just `"TRUE"`. So each part's JSON body is inspected,
//   not just its status line.

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'Invalid record'
  if (typeof record.NewCompany !== 'string' || !record.NewCompany.trim()) return 'Missing or invalid NewCompany'
  return null
}

// Builds the multipart/mixed request body, one changeset per company. Same
// shape as buildPartCatalogBatch — see that function for the wire format.
export function buildCompanyBatch(records) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const boundary = `batch_${suffix}`
  const lines = []
  const recordMap = {}
  const skipped = []

  records.forEach((record, index) => {
    const id = index + 1
    const problem = validateRecord(record)
    if (problem) {
      skipped.push({ index, NewCompany: record?.NewCompany || 'Unknown', error: problem, record })
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
      'POST CreateNewCompany HTTP/1.1',
      'Content-Type: application/json',
      'Accept: application/json',
      '',
      JSON.stringify(record),
      '',
      `--${changeset}--`
    )
    recordMap[id] = { NewCompany: record.NewCompany, originalIndex: index, record }
  })

  if (Object.keys(recordMap).length === 0) return { body: null, boundary, recordMap, skipped }

  lines.push(`--${boundary}--`, '')
  return { body: lines.join('\r\n'), boundary, recordMap, skipped }
}

// Pulls a `"field": "value"` string out of a part's raw text without a full
// JSON.parse (the part also contains HTTP headers around the JSON body).
function extractField(text, field) {
  const m = text.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'))
  if (!m) return null
  try {
    return JSON.parse(`"${m[1]}"`)
  } catch {
    return m[1]
  }
}

// Matches each company's individual response back to it (by Content-ID) and
// sorts every submitted company into successful / failed / unconfirmed.
export function parseCompanyBatchResponse(text, contentType, recordMap, skipped) {
  const results = {}

  if (/multipart\/mixed/i.test(contentType || '')) {
    text.split(/Content-Type:\s*application\/http[^\r\n]*/i).slice(1).forEach((part) => {
      const idMatch = part.match(/Content-ID:\s*(\d+)/i)
      const statusMatch = part.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})[^\r\n]*/i)
      if (!idMatch || !statusMatch) return

      const id = idMatch[1]
      const status = Number(statusMatch[1])
      if (!recordMap[id]) return

      if (status >= 200 && status < 300) {
        // A 2xx alone isn't enough — see the OPEN_LOG note above.
        const company = extractField(part, 'Company')
        const successField = extractField(part, 'Success')
        if (company && successField && successField !== 'FALSE') {
          results[id] = { status, success: true, company, note: successField }
        } else {
          results[id] = {
            status,
            success: false,
            error: successField
              ? `IFS returned Success: ${successField}`
              : 'Unexpected response shape (no Company/Success in body)'
          }
        }
        return
      }

      let errorMessage = statusMatch[0].trim()
      const errorMatch = part.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/i)
      if (errorMatch) {
        try {
          errorMessage = JSON.parse(`"${errorMatch[1]}"`)
        } catch {
          errorMessage = errorMatch[1]
        }
      }
      results[id] = { status, success: false, error: errorMessage }
    })
  }

  const successful = []
  const failed = [...skipped]
  const unconfirmed = []

  Object.entries(recordMap).forEach(([id, entry]) => {
    const result = results[id]
    if (!result) {
      unconfirmed.push({
        NewCompany: entry.NewCompany,
        index: entry.originalIndex,
        record: entry.record,
        error: 'No identifiable individual response'
      })
    } else if (result.success) {
      successful.push({ NewCompany: result.company, status: result.status, note: result.note })
    } else {
      failed.push({ NewCompany: entry.NewCompany, status: result.status, error: result.error, record: entry.record })
    }
  })

  return { successful, failed, unconfirmed }
}
