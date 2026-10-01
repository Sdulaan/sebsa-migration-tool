import { requestIfsToken, IfsAuthError } from '../../../../lib/server/ifsAuth'
import { buildInventoryPartSetUrl } from '../../../../lib/migrationStore'

// Server-side proxy for the IFS Cloud InventoryPartHandling projection's
// InventoryPartSet. Same shape as ../part-catalog-set/route.js: hands back the
// raw response body untouched and the client extracts the records.

export async function POST(request) {
  const body = await request.json().catch(() => null)

  let dataUrl
  try {
    dataUrl = buildInventoryPartSetUrl(body?.baseUrl)
  } catch {
    return Response.json(
      { success: false, error: 'Missing Base URL — configure it in "Configure source environment".' },
      { status: 400 }
    )
  }

  // The client sends a cached session token when it has one; otherwise it
  // sends the environment config and we mint one here.
  let accessToken = body?.accessToken
  let token = null

  if (!accessToken) {
    try {
      token = await requestIfsToken({ ...(body?.config || {}), fallbackOrigin: dataUrl })
      accessToken = token.accessToken
    } catch (err) {
      const status = err instanceof IfsAuthError ? err.status : 500
      return Response.json({ success: false, error: err.message }, { status })
    }
  }

  try {
    const dataRes = await fetch(dataUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store'
    })
    const dataBody = await dataRes.json().catch(() => null)
    if (!dataRes.ok) {
      return Response.json(
        {
          success: false,
          error: `InventoryPartSet request failed (${dataRes.status}). ${dataBody?.error?.message || dataBody?.message || ''}`.trim(),
          response: dataBody,
          tokenInvalid: dataRes.status === 401
        },
        { status: dataRes.status }
      )
    }
    return Response.json({ success: true, url: dataUrl, status: dataRes.status, response: dataBody, token })
  } catch (err) {
    return Response.json({ success: false, error: `Could not reach InventoryPartSet: ${err.message}` }, { status: 502 })
  }
}
