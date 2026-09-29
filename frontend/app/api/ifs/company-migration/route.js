import { getCompanyMigrationStep, buildStepPayload, COMPANY_PROJECTION } from '../../../../lib/companyMigrationSteps'
import { buildODataBatchRequests, parseODataBatchResponse } from '../../../../lib/server/ifsBatch'
import { resolveAccessToken, getAllRecords, ifsErrorMessage } from '../../../../lib/server/ifsRoute'
import { isAlreadyExistsError } from '../../../../lib/transactionLog'

// Runs ONE step of a company migration (lib/companyMigrationSteps.js): reads
// the step's records from the Source, maps them to the sheet's payload, and
// writes them to the Destination as one CompanyHandling $batch (one
// changeset per record, continue-on-error) — same mechanism as
// ../site-migration/route.js. A PATCH first reads the Destination record for
// its ETag and sends it as If-Match. The client calls the steps one at a
// time, in order; see lib/companyMigrationRunner.js. The header (Company
// itself) is NOT a step here — it goes through CreateNewCompany, handled
// entirely client-side by postCompanyHeaderBatch (migrationStore.js).
//
// Body: { stepId, company, addressId?,
//         source:      { baseUrl, accessToken } | { baseUrl, config },
//         destination: { baseUrl, accessToken } | { baseUrl, config } }

const LABEL_FIELDS = ['AddressId', 'AddressTypeCode', 'MethodId', 'PersonId', 'EmployeeId', 'Company']
function recordLabel(record) {
  const field = LABEL_FIELDS.find((f) => record?.[f] !== undefined && record?.[f] !== null && record?.[f] !== '')
  return field ? `${field} ${record[field]}` : 'Record'
}

function projectionUrl(baseUrl, path) {
  if (!baseUrl) throw new Error('Base URL is required.')
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/${COMPANY_PROJECTION}/${path}`
}

async function readEtag(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store'
  })
  const text = await res.text()
  if (res.status === 404) return { error: 'Not found in the Destination, so there is nothing to update.', status: 404 }
  if (!res.ok) return { error: `Reading the Destination record failed (${res.status}). ${ifsErrorMessage(text)}`.trim(), status: res.status }
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  const etag = data?.['@odata.etag'] || res.headers.get('etag')
  return etag ? { etag } : { error: 'The Destination record has no ETag to update against.' }
}

export async function POST(request) {
  const body = await request.json().catch(() => null)

  const step = getCompanyMigrationStep(body?.stepId)
  if (!step) return Response.json({ success: false, error: `Unknown step "${body?.stepId}".` }, { status: 400 })

  const co = String(body?.company ?? '').trim()
  if (!co) return Response.json({ success: false, error: 'A company code is required.' }, { status: 400 })
  const addr = body?.addressId ? String(body.addressId).trim() : null
  if (step.needsAddress && !addr) {
    return Response.json({ success: true, status: 'NOTHING', message: 'This company has no address to scope this step to.', records: [] })
  }
  const ctx = { co, addr }

  let readUrl
  let batchUrl
  try {
    readUrl = projectionUrl(body?.source?.baseUrl, step.read(ctx))
  } catch {
    return Response.json({ success: false, error: 'Missing Source Base URL — configure it in "Configure source environment".' }, { status: 400 })
  }
  try {
    batchUrl = projectionUrl(body?.destination?.baseUrl, '$batch')
  } catch {
    return Response.json({ success: false, error: 'Missing Destination Base URL — configure it in "Configure destination environment".' }, { status: 400 })
  }

  const src = await resolveAccessToken(body.source, readUrl)
  if (src.errorResponse) return src.errorResponse
  const dst = await resolveAccessToken(body.destination, batchUrl)
  if (dst.errorResponse) return dst.errorResponse

  const tokenInvalid = { source: false, destination: false }
  const respond = (payload) =>
    Response.json({ success: true, readUrl, batchUrl, tokens: { source: src.token, destination: dst.token }, tokenInvalid, ...payload })

  // 1. Read from the Source.
  let read
  try {
    read = await getAllRecords(readUrl, src.accessToken)
  } catch (err) {
    read = { error: `Could not reach the Source: ${err.message}` }
  }
  if (read.error) {
    if (read.status === 401) tokenInvalid.source = true
    return respond({ status: 'FAILED', error: `Reading from the Source failed. ${read.error}`, records: [] })
  }
  if (read.records.length === 0) {
    return respond({ status: 'NOTHING', message: 'The Source has no records for this step.', sourceCount: 0, records: [] })
  }

  // The "address" step's first record becomes the AddressId every later
  // needsAddress step is scoped to (see companyMigrationRunner.js).
  const primaryAddressId = step.id === 'address' ? read.records[0]?.AddressId || null : undefined

  // 2. One request per Source record; a PATCH carries the Destination's ETag.
  const requests = []
  for (const record of read.records) {
    const payload = buildStepPayload(step, record)
    const url = step.method === 'PATCH' ? step.write(ctx, record) : step.write(ctx)
    const req = { method: step.method, url, record: payload, label: recordLabel(record) }
    if (Object.keys(payload).length === 0) {
      req.noFields = true
      req.error = 'The Source record has none of the mapped fields, so nothing was sent.'
    } else if (step.method === 'PATCH') {
      let tag
      try {
        tag = await readEtag(projectionUrl(body.destination.baseUrl, url), dst.accessToken)
      } catch (err) {
        tag = { error: `Could not reach the Destination: ${err.message}` }
      }
      if (tag.status === 401) tokenInvalid.destination = true
      if (tag.error) req.error = tag.error
      else req.headers = { 'If-Match': tag.etag }
    }
    requests.push(req)
  }

  const results = requests.map((r) => ({
    label: r.label,
    method: r.method,
    url: r.url,
    status: r.noFields ? 'NO_FIELDS' : r.error ? 'FAILED' : 'UNCONFIRMED',
    httpStatus: null,
    error: r.error || 'No identifiable individual response',
    payload: r.record
  }))

  // 3. Write to the Destination through $batch.
  const batch = buildODataBatchRequests(requests)
  if (batch.body) {
    let batchRes
    let batchText
    try {
      batchRes = await fetch(batchUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dst.accessToken}`,
          'Content-Type': `multipart/mixed; boundary=${batch.boundary}`,
          Accept: 'multipart/mixed',
          Prefer: 'odata.continue-on-error'
        },
        body: batch.body,
        cache: 'no-store'
      })
      batchText = await batchRes.text()
    } catch (err) {
      return respond({
        status: 'FAILED',
        error: `Could not reach ${COMPANY_PROJECTION} $batch: ${err.message}`,
        sourceCount: read.records.length,
        primaryAddressId,
        records: results
      })
    }

    const contentType = batchRes.headers.get('content-type') || ''
    if (!batchRes.ok && !/multipart\/mixed/i.test(contentType)) {
      if (batchRes.status === 401) tokenInvalid.destination = true
      return respond({
        status: 'FAILED',
        error: `${COMPANY_PROJECTION} $batch request failed (${batchRes.status}). ${ifsErrorMessage(batchText)}`.trim(),
        sourceCount: read.records.length,
        primaryAddressId,
        records: results
      })
    }

    const parsed = parseODataBatchResponse(batchText, contentType)
    Object.entries(batch.recordMap).forEach(([id, entry]) => {
      const r = parsed[id]
      if (!r) return
      const result = results[entry.originalIndex]
      result.httpStatus = r.status
      if (r.status >= 200 && r.status < 300) {
        Object.assign(result, { status: 'SUCCESS', error: null })
      } else if (step.method === 'POST' && isAlreadyExistsError({ httpStatus: r.status, error: r.error, errorCode: r.errorCode })) {
        Object.assign(result, { status: 'ALREADY_EXISTS', error: r.error })
      } else {
        Object.assign(result, { status: 'FAILED', error: r.error, errorCode: r.errorCode })
      }
    })
  }

  const ok = results.every((r) => ['SUCCESS', 'ALREADY_EXISTS', 'NO_FIELDS'].includes(r.status))
  const firstFailed = results.find((r) => r.status === 'FAILED' || r.status === 'UNCONFIRMED')
  const error = firstFailed
    ? `${firstFailed.label}: ${firstFailed.httpStatus ? `HTTP ${firstFailed.httpStatus} — ` : ''}${firstFailed.error}${firstFailed.errorCode ? ` (${firstFailed.errorCode})` : ''}`
    : undefined
  return respond({ status: ok ? 'SUCCESS' : 'FAILED', error, sourceCount: read.records.length, primaryAddressId, records: results })
}
