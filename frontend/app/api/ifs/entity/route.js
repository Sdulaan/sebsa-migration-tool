import { getEntity, buildEntitySetUrl } from '../../../../lib/entityRegistry'
import { resolveAccessToken, ifsErrorMessage } from '../../../../lib/server/ifsRoute'

// Generic GET for any entity in lib/entityRegistry.js: fetches every record
// of its entity set from the environment the client authorizes with (the
// source). Follows OData server-driven paging (@odata.nextLink) so larger
// entity sets come back whole.

const MAX_PAGES = 100

export async function POST(request) {
  const body = await request.json().catch(() => null)

  const entity = getEntity(body?.entity)
  if (!entity) {
    return Response.json({ success: false, error: `Unknown entity "${body?.entity}".` }, { status: 400 })
  }

  let dataUrl
  try {
    dataUrl = buildEntitySetUrl(body?.baseUrl, entity)
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 })
  }

  const { accessToken, token, errorResponse } = await resolveAccessToken(body, dataUrl)
  if (errorResponse) return errorResponse

  const records = []
  let nextUrl = dataUrl
  for (let page = 0; nextUrl && page < MAX_PAGES; page++) {
    let res
    let text
    try {
      res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store'
      })
      text = await res.text()
    } catch (err) {
      return Response.json({ success: false, error: `Could not reach ${entity.entitySet}: ${err.message}` }, { status: 502 })
    }
    if (!res.ok) {
      return Response.json(
        {
          success: false,
          error: `${entity.label} (${entity.projection}/${entity.entitySet}) request failed (${res.status}). ${ifsErrorMessage(text)}`.trim(),
          tokenInvalid: res.status === 401
        },
        { status: res.status }
      )
    }
    let data = null
    try {
      data = JSON.parse(text)
    } catch {}
    records.push(...(data?.value || data?.d?.results || []))
    nextUrl = data?.['@odata.nextLink'] ? new URL(data['@odata.nextLink'], nextUrl).toString() : null
  }

  return Response.json({ success: true, url: dataUrl, records, token })
}
