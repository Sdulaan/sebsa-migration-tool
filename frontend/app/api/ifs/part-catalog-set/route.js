import { requestIfsToken, IfsAuthError } from '../../../../lib/server/ifsAuth'
import { buildPartCatalogSetUrl } from '../../../../lib/migrationStore'

// Server-side proxy for the IFS Cloud PartHandling projection's PartCatalogSet.
// Same shape as ../sales-part-set/route.js, but hands back the raw response
// body untouched (the client extracts the records, and can log it in full).

export async function POST(request) {
  const body = await request.json().catch(() => null)

  let dataUrl
  try {
    dataUrl = buildPartCatalogSetUrl(body?.baseUrl)
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
          error: `PartCatalogSet request failed (${dataRes.status}). ${dataBody?.message || ''}`.trim(),
          response: dataBody,
          tokenInvalid: dataRes.status === 401
        },
        { status: dataRes.status }
      )
    }
    return Response.json({ success: true, url: dataUrl, status: dataRes.status, response: dataBody, token })
  } catch (err) {
    return Response.json({ success: false, error: `Could not reach PartCatalogSet: ${err.message}` }, { status: 502 })
  }
}
