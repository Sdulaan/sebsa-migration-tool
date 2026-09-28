import { getEntity, buildEntityBatchUrl } from '../../../../lib/entityRegistry'
import { buildODataBatch, parseODataBatchResponse } from '../../../../lib/server/ifsBatch'
import { resolveAccessToken, ifsErrorMessage } from '../../../../lib/server/ifsRoute'

// Generic create for any entity in lib/entityRegistry.js: sends the given
// records to its projection's OData $batch endpoint (one changeset per
// record, continue-on-error) in the environment the client authorizes with
// (the destination), and reports each record's individual HTTP result.
// Deciding what those results mean (created / already exists / failed) and
// what to skip next is the transfer runner's job, not this route's.

const MAX_BATCH_RECORDS = 200

export async function POST(request) {
  const body = await request.json().catch(() => null)

  const entity = getEntity(body?.entity)
  if (!entity) {
    return Response.json({ success: false, error: `Unknown entity "${body?.entity}".` }, { status: 400 })
  }
  const records = body?.records
  if (!Array.isArray(records) || records.length === 0) {
    return Response.json({ success: false, error: 'No records to post.' }, { status: 400 })
  }
  if (records.length > MAX_BATCH_RECORDS) {
    return Response.json({ success: false, error: `At most ${MAX_BATCH_RECORDS} records per batch.` }, { status: 400 })
  }

  let batchUrl
  try {
    batchUrl = buildEntityBatchUrl(body?.baseUrl, entity)
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 })
  }

  const batch = buildODataBatch(entity.entitySet, records)
  const results = records.map(() => ({ httpStatus: null, error: 'No identifiable individual response', errorCode: null }))
  batch.skipped.forEach((s) => {
    results[s.index] = { httpStatus: null, error: s.error, errorCode: 'LOCAL_VALIDATION', local: true }
  })
  if (!batch.body) {
    return Response.json({ success: true, url: batchUrl, batchStatus: null, results, token: null })
  }

  const { accessToken, token, errorResponse } = await resolveAccessToken(body, batchUrl)
  if (errorResponse) return errorResponse

  let batchRes
  let batchText
  try {
    batchRes = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/mixed; boundary=${batch.boundary}`,
        Accept: 'multipart/mixed',
        // Keep processing the other changesets when one is rejected.
        Prefer: 'odata.continue-on-error'
      },
      body: batch.body,
      cache: 'no-store'
    })
    batchText = await batchRes.text()
  } catch (err) {
    return Response.json({ success: false, error: `Could not reach ${entity.projection} $batch: ${err.message}` }, { status: 502 })
  }

  const contentType = batchRes.headers.get('content-type') || ''

  // A rejected batch as a whole (bad token, malformed request, ...) comes back
  // as a plain error rather than a multipart body of per-record results.
  if (!batchRes.ok && !/multipart\/mixed/i.test(contentType)) {
    return Response.json(
      {
        success: false,
        error: `${entity.projection} $batch request failed (${batchRes.status}). ${ifsErrorMessage(batchText)}`.trim(),
        tokenInvalid: batchRes.status === 401
      },
      { status: batchRes.status }
    )
  }

  const parsed = parseODataBatchResponse(batchText, contentType)
  Object.entries(batch.recordMap).forEach(([id, entry]) => {
    const result = parsed[id]
    if (result) results[entry.originalIndex] = { httpStatus: result.status, error: result.error, errorCode: result.errorCode }
  })

  return Response.json({ success: true, url: batchUrl, batchStatus: batchRes.status, results, token })
}
