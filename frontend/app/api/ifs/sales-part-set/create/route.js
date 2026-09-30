import { requestIfsToken, IfsAuthError } from '../../../../../lib/server/ifsAuth'
import { buildSalesPartBatch, parseSalesPartBatchResponse } from '../../../../../lib/server/salesPartBatch'
import { buildSalesPartHandlingBatchUrl } from '../../../../../lib/migrationStore'

// Server-side proxy that creates sales parts in the IFS Cloud
// SalesPartHandling projection by sending them as one OData $batch request
// (one changeset per part, each a POST to SalesPartSet), authorized by
// whichever environment the client sends (the destination). Same shape as
// ../../part-catalog-set/create/route.js.

export async function POST(request) {
  const body = await request.json().catch(() => null)

  const parts = body?.records
  if (!Array.isArray(parts) || parts.length === 0) {
    return Response.json({ success: false, error: 'No records to post.' }, { status: 400 })
  }

  let batchUrl
  try {
    batchUrl = buildSalesPartHandlingBatchUrl(body?.baseUrl)
  } catch {
    return Response.json(
      { success: false, error: 'Missing Base URL — configure it in "Configure destination environment".' },
      { status: 400 }
    )
  }

  const batch = buildSalesPartBatch(parts)
  if (!batch.body) {
    const reasons = batch.skipped.map((s) => `${s.key}: ${s.error}`).join('; ')
    return Response.json(
      { success: false, error: `No valid sales part records to send. ${reasons}`.trim() },
      { status: 400 }
    )
  }

  // The client sends a cached session token when it has one; otherwise it
  // sends the environment config and we mint one here.
  let accessToken = body?.accessToken
  let token = null

  if (!accessToken) {
    try {
      token = await requestIfsToken({ ...(body?.config || {}), fallbackOrigin: batchUrl })
      accessToken = token.accessToken
    } catch (err) {
      const status = err instanceof IfsAuthError ? err.status : 500
      return Response.json({ success: false, error: err.message }, { status })
    }
  }

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
    return Response.json({ success: false, error: `Could not reach SalesPartHandling $batch: ${err.message}` }, { status: 502 })
  }

  const contentType = batchRes.headers.get('content-type') || ''

  // A rejected batch as a whole (bad token, malformed request, ...) comes back
  // as a plain error rather than a multipart body of per-part results.
  if (!batchRes.ok && !/multipart\/mixed/i.test(contentType)) {
    let detail = ''
    try {
      const errBody = JSON.parse(batchText)
      detail = errBody?.error?.message || errBody?.message || ''
    } catch {}
    const hint = batchRes.status === 401 ? ' Test the destination connection again, then retry.' : ''
    return Response.json(
      {
        success: false,
        error: `SalesPartHandling $batch request failed (${batchRes.status}). ${detail}${hint}`.trim(),
        tokenInvalid: batchRes.status === 401
      },
      { status: batchRes.status }
    )
  }

  const { successful, failed, unconfirmed } = parseSalesPartBatchResponse(
    batchText,
    contentType,
    batch.recordMap,
    batch.skipped
  )

  return Response.json({
    success: true,
    url: batchUrl,
    batchStatus: batchRes.status,
    summary: {
      totalSubmitted: Object.keys(batch.recordMap).length,
      locallySkipped: batch.skipped.length,
      successful: successful.length,
      failed: failed.length,
      unconfirmed: unconfirmed.length
    },
    successful,
    failed,
    unconfirmed,
    token
  })
}
