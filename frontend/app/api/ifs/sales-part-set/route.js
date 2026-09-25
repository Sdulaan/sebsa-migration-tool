import { requestIfsToken, IfsAuthError } from '../../../../lib/server/ifsAuth'
import { buildSalesPartSetUrl } from '../../../../lib/migrationStore'

// Server-side proxy for the IFS Cloud SalesPartHandling projection.
// Runs on the server so the OAuth2 client secret never reaches the browser
// bundle and so the call isn't blocked by the browser's CORS policy.

export async function POST(request) {
  const body = await request.json().catch(() => null)

  // The data endpoint is built from the environment's own configured Base
  // URL, not a fixed host, so it follows whichever IFS tenant the source
  // environment modal was set up for.
  let dataUrl
  try {
    dataUrl = buildSalesPartSetUrl(body?.baseUrl)
  } catch {
    return Response.json(
      { success: false, error: 'Missing Base URL — configure it in "Configure source environment".' },
      { status: 400 }
    )
  }

  // The client sends a cached session token when it has one (no re-auth
  // needed); otherwise it sends the environment config and we mint one here.
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
      // Next.js's server-side fetch() caches GET requests by default —
      // this is live, authenticated data and must never be served stale.
      cache: 'no-store'
    })
    const dataBody = await dataRes.json().catch(() => null)
    if (!dataRes.ok) {
      return Response.json(
        {
          success: false,
          error: `SalesPartSet request failed (${dataRes.status}). ${dataBody?.message || ''}`.trim(),
          tokenInvalid: dataRes.status === 401
        },
        { status: dataRes.status }
      )
    }
    const records = dataBody?.value || dataBody?.d?.results || (Array.isArray(dataBody) ? dataBody : [])
    return Response.json({ success: true, records, token })
  } catch (err) {
    return Response.json({ success: false, error: `Could not reach SalesPartSet: ${err.message}` }, { status: 502 })
  }
}
