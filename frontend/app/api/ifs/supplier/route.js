import { buildProjectionUrl } from '../../../../lib/entityRegistry'
import { supplierPayload, supplierRelativePath, supplierStage } from '../../../../lib/supplierApi'
import { buildODataBatch, parseODataBatchResponse } from '../../../../lib/server/ifsBatch'
import { resolveAccessToken, ifsErrorMessage } from '../../../../lib/server/ifsRoute'

const MAX_PAGES = 100
const MAX_BATCH_RECORDS = 200

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const stage = supplierStage(body?.stage)
  if (!stage) return Response.json({ success: false, error: 'Unknown supplier stage.' }, { status: 400 })
  if (!['get', 'create'].includes(body?.action)) {
    return Response.json({ success: false, error: 'Unknown supplier action.' }, { status: 400 })
  }

  let url
  try {
    url = buildProjectionUrl(body?.baseUrl, 'SupplierHandling.svc', body.action === 'get'
      ? supplierRelativePath(stage.id, body?.parent || {}) : '$batch')
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 })
  }

  if (body.action === 'get') {
    const { accessToken, token, errorResponse } = await resolveAccessToken(body, url)
    if (errorResponse) return errorResponse
    const records = []
    let nextUrl = url
    for (let page = 0; nextUrl && page < MAX_PAGES; page++) {
      let response
      let text
      try {
        response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, cache: 'no-store' })
        text = await response.text()
      } catch (err) {
        return Response.json({ success: false, error: `Could not reach supplier ${stage.label}: ${err.message}` }, { status: 502 })
      }
      if (!response.ok) return Response.json({ success: false, error: `${stage.label} GET failed (${response.status}). ${ifsErrorMessage(text)}`.trim(), tokenInvalid: response.status === 401 }, { status: response.status })
      let data
      try { data = JSON.parse(text) } catch { return Response.json({ success: false, error: `${stage.label} returned invalid JSON.` }, { status: 502 }) }
      const pageRecords = data?.value ?? data?.d?.results ?? (Array.isArray(data) ? data : data ? [data] : [])
      if (!Array.isArray(pageRecords)) return Response.json({ success: false, error: `${stage.label} returned an invalid record collection.` }, { status: 502 })
      records.push(...pageRecords)
      if (data?.['@odata.nextLink']) {
        try {
          const next = new URL(data['@odata.nextLink'], nextUrl)
          const projectionRoot = new URL(url).pathname.split('/SupplierInfoGeneralSet')[0] + '/'
          if (next.origin !== new URL(url).origin || !next.pathname.startsWith(projectionRoot)) throw new Error('Unexpected paging URL')
          nextUrl = next.toString()
        } catch {
          return Response.json({ success: false, error: `${stage.label} returned an invalid paging URL.` }, { status: 502 })
        }
      } else nextUrl = null
      if (page === MAX_PAGES - 1 && nextUrl) return Response.json({ success: false, error: `${stage.label} exceeded ${MAX_PAGES} pages.` }, { status: 502 })
    }
    return Response.json({ success: true, records, token, url })
  }

  const records = body?.records
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_BATCH_RECORDS) {
    return Response.json({ success: false, error: `Supply 1 to ${MAX_BATCH_RECORDS} supplier records.` }, { status: 400 })
  }
  if (body?.routes && (!Array.isArray(body.routes) || body.routes.length !== records.length)) {
    return Response.json({ success: false, error: 'Supplier routing keys must match the records.' }, { status: 400 })
  }
  if (body?.routes?.some((route) => route === null || typeof route !== 'object' || Array.isArray(route))) {
    return Response.json({ success: false, error: 'Each supplier routing entry must be an object.' }, { status: 400 })
  }
  const payloads = records.map((record) => record && typeof record === 'object' && !Array.isArray(record)
    ? supplierPayload(stage.id, record) : record)
  const routeValues = (_record, index) => ({ ...records[index], ...(body.routes?.[index] || {}) })
  const batch = buildODataBatch(
    (record, index) => supplierRelativePath(stage.id, routeValues(record, index)), payloads,
    (record, index) => { try { supplierRelativePath(stage.id, routeValues(record, index)); return null } catch (err) { return err.message } }
  )
  const results = records.map(() => ({ httpStatus: null, error: 'No identifiable individual response', errorCode: null }))
  batch.skipped.forEach(({ index, error }) => { results[index] = { httpStatus: null, error, errorCode: 'LOCAL_VALIDATION', local: true } })
  if (!batch.body) return Response.json({ success: true, results, token: null })
  const { accessToken, token, errorResponse } = await resolveAccessToken(body, url)
  if (errorResponse) return errorResponse
  let response
  let responseText
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/mixed; boundary=${batch.boundary}`, Accept: 'multipart/mixed', Prefer: 'odata.continue-on-error' },
      body: batch.body,
      cache: 'no-store'
    })
    responseText = await response.text()
  } catch (err) {
    return Response.json({ success: false, error: `Could not reach supplier $batch: ${err.message}` }, { status: 502 })
  }
  const contentType = response.headers.get('content-type') || ''
  if (!/multipart\/mixed/i.test(contentType)) {
    return Response.json({ success: false, error: `Supplier $batch failed (${response.status}). ${ifsErrorMessage(responseText) || responseText.slice(0, 500)}`.trim(), tokenInvalid: response.status === 401 }, { status: response.ok ? 502 : response.status })
  }
  const parsed = parseODataBatchResponse(responseText, contentType)
  Object.entries(batch.recordMap).forEach(([id, entry]) => {
    if (parsed[id]) results[entry.originalIndex] = { httpStatus: parsed[id].status, error: parsed[id].error, errorCode: parsed[id].errorCode }
  })
  return Response.json({ success: true, results, token, batchStatus: response.status, url })
}
