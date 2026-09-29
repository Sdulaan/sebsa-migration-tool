import { requestIfsToken, IfsAuthError } from './ifsAuth'

// Server-only helpers shared by the generic /api/ifs routes.

// The client sends a cached session token when it has one; otherwise it
// sends the environment config and a token is minted here (and handed back
// as `token` so the client can cache it). Returns { accessToken, token } or
// { errorResponse } ready to return from the route.
export async function resolveAccessToken(body, fallbackOrigin) {
  if (body?.accessToken) return { accessToken: body.accessToken, token: null }
  try {
    const token = await requestIfsToken({ ...(body?.config || {}), fallbackOrigin })
    return { accessToken: token.accessToken, token }
  } catch (err) {
    const status = err instanceof IfsAuthError ? err.status : 500
    return { errorResponse: Response.json({ success: false, error: err.message }, { status }) }
  }
}

const MAX_PAGES = 100

// GETs every page of one OData URL. A single-entity URL (e.g.
// ...(Company='X')) returns the entity itself rather than a `value` array; it
// comes back as one record. Returns { records, status } or { error, status }.
export async function getAllRecords(url, accessToken) {
  const records = []
  let nextUrl = url
  for (let page = 0; nextUrl && page < MAX_PAGES; page++) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store'
    })
    const text = await res.text()
    if (!res.ok) {
      return { error: `Request failed (${res.status}). ${ifsErrorMessage(text)}`.trim(), status: res.status }
    }
    let data
    try {
      data = JSON.parse(text)
    } catch {
      // Not "no records": IFS answered with something else (e.g. an HTML page).
      return { error: `IFS answered ${res.status} but the body isn't JSON (${res.headers.get('content-type') || 'no content type'}).`, status: res.status }
    }
    if (Array.isArray(data?.value)) records.push(...data.value)
    else if (Array.isArray(data?.d?.results)) records.push(...data.d.results)
    else if (data && typeof data === 'object') {
      const { '@odata.context': _ctx, ...entity } = data
      records.push(entity)
    }
    nextUrl = data?.['@odata.nextLink'] ? new URL(data['@odata.nextLink'], nextUrl).toString() : null
  }
  return { records, status: 200 }
}

// IFS error bodies: { error: { code, message, details: [...] } }.
export function ifsErrorMessage(text) {
  try {
    const parsed = JSON.parse(text)
    return parsed?.error?.message || parsed?.message || ''
  } catch {
    return ''
  }
}
