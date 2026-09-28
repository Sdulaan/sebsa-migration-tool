import { requestIfsToken, IfsAuthError } from '../../../../../lib/server/ifsAuth'
import { buildCompanySubEntityUrl } from '../../../../../lib/migrationStore'

// Server-side proxy for a Company sub-entity — a navigation property off
// CompanySet, e.g. CompanySet(Company='X')/CompanyAddresses. Used only by
// the Review Data step (read-only); nothing here is ever POSTed back.

export async function POST(request) {
  const body = await request.json().catch(() => null)

  let dataUrl
  try {
    dataUrl = buildCompanySubEntityUrl(body?.baseUrl, body?.company, body?.tabId, body?.addressId)
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 })
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
          error: `Request failed (${dataRes.status}). ${dataBody?.message || ''}`.trim(),
          tokenInvalid: dataRes.status === 401
        },
        { status: dataRes.status }
      )
    }
    // A nav property to a single-cardinality relation comes back as one
    // object, not an array wrapped in `value` — normalize either shape.
    const records = dataBody?.value || dataBody?.d?.results || (Array.isArray(dataBody) ? dataBody : dataBody ? [dataBody] : [])
    return Response.json({ success: true, url: dataUrl, records, token })
  } catch (err) {
    return Response.json({ success: false, error: `Could not reach ${dataUrl}: ${err.message}` }, { status: 502 })
  }
}
