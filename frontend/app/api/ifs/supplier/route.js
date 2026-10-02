import { buildProjectionUrl } from '../../../../lib/entityRegistry'
import { supplierPayload, supplierStage, supplierStagePath } from '../../../../lib/supplierApi'
import { buildODataBatchRequests, parseODataBatchResponse } from '../../../../lib/server/ifsBatch'
import { getAllRecords, ifsErrorMessage, resolveAccessToken } from '../../../../lib/server/ifsRoute'

const MAX_BATCH_RECORDS = 200

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const stage = supplierStage(body?.stage)
  if (!stage) return Response.json({ success: false, error: 'Unknown Supplier stage.' }, { status: 400 })
  if (!['list', 'create'].includes(body?.operation)) {
    return Response.json({ success: false, error: 'Unknown Supplier operation.' }, { status: 400 })
  }

  let batchUrl
  try {
    batchUrl = buildProjectionUrl(body.baseUrl, 'SupplierHandling.svc', '$batch')
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 })
  }

  if (body.operation === 'list') {
    let path
    try {
      path = supplierStagePath(stage.id, body.keys)
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 400 })
    }
    const url = buildProjectionUrl(body.baseUrl, 'SupplierHandling.svc', path)
    const { accessToken, token, errorResponse } = await resolveAccessToken(body, url)
    if (errorResponse) return errorResponse
    try {
      const result = await getAllRecords(url, accessToken)
      if (result.error) return Response.json({ success: false, error: `${stage.label}: ${result.error}`, tokenInvalid: result.status === 401 }, { status: result.status || 502 })
      return Response.json({ success: true, records: result.records, url, token })
    } catch (err) {
      return Response.json({ success: false, error: `Could not fetch ${stage.label}: ${err.message}` }, { status: 502 })
    }
  }

  const records = body.records
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_BATCH_RECORDS) {
    return Response.json({ success: false, error: `Send 1 to ${MAX_BATCH_RECORDS} Supplier records per batch.` }, { status: 400 })
  }
  const requests = records.map((item) => {
    try {
      const path = supplierStagePath(stage.id, item?.keys)
      const record = item?.record
      const payload = supplierPayload(stage.id, record)
      if (!payload || Object.keys(payload).length === 0) throw new Error('No allowed POST attributes.')
      for (const key of stage.parentKeys) {
        if (record[key] != null && String(record[key]) !== String(item.keys[key])) {
          throw new Error(`${key} does not match its parent Supplier record.`)
        }
      }
      return { method: 'POST', url: path, record: payload }
    } catch (err) {
      return { error: err.message, record: item?.record }
    }
  })
  const batch = buildODataBatchRequests(requests)
  const results = records.map(() => ({ httpStatus: null, error: 'No identifiable individual response', errorCode: null }))
  batch.skipped.forEach(({ index, error }) => {
    results[index] = { httpStatus: null, error, errorCode: 'LOCAL_VALIDATION', local: true }
  })
  if (!batch.body) return Response.json({ success: true, results, batchStatus: null })

  const { accessToken, token, errorResponse } = await resolveAccessToken(body, batchUrl)
  if (errorResponse) return errorResponse
  let response
  let responseText
  try {
    response = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/mixed; boundary=${batch.boundary}`,
        Accept: 'multipart/mixed',
        Prefer: 'odata.continue-on-error'
      },
      body: batch.body,
      cache: 'no-store'
    })
    responseText = await response.text()
  } catch (err) {
    return Response.json({ success: false, error: `Could not post ${stage.label}: ${err.message}` }, { status: 502 })
  }
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok && !/multipart\/mixed/i.test(contentType)) {
    return Response.json({ success: false, error: `${stage.label} batch failed (${response.status}). ${ifsErrorMessage(responseText)}`.trim(), tokenInvalid: response.status === 401 }, { status: response.status })
  }
  const parsed = parseODataBatchResponse(responseText, contentType)
  Object.entries(batch.recordMap).forEach(([id, entry]) => {
    const result = parsed[id]
    if (result) results[entry.originalIndex] = { httpStatus: result.status, error: result.error, errorCode: result.errorCode }
  })
  return Response.json({ success: true, results, batchStatus: response.status, token })
}
