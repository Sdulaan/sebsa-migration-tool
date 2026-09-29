import { SITE_DATA_SOURCES, SITE_PROJECTION, odataKey, buildProjectionUrl } from '../../../../lib/siteDataSources'
import { resolveAccessToken, ifsErrorMessage } from '../../../../lib/server/ifsRoute'

// Runs every site GET in lib/siteDataSources.js for one site, one call at a
// time in the listed order, with a single token. A failing call doesn't stop
// the rest: its section carries the error instead.
//
// Body: { baseUrl, contract, company, accessToken } | { baseUrl, contract, company, config }

const MAX_PAGES = 100
// The first page's raw body is handed back so the page can show exactly what
// IFS returned; beyond this it's cut short.
const MAX_RAW_CHARS = 20000

const snippet = (text) => (text.length > MAX_RAW_CHARS ? `${text.slice(0, MAX_RAW_CHARS)}\n… (${text.length - MAX_RAW_CHARS} more characters)` : text)

// Fetches every page of one URL. A single-entity URL returns the entity
// itself rather than a `value` array; it comes back as one record. A body
// that isn't JSON is an error, not "no records".
async function getAll(url, accessToken) {
  const records = []
  let raw = null
  let nextUrl = url
  for (let page = 0; nextUrl && page < MAX_PAGES; page++) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store'
    })
    const text = await res.text()
    if (page === 0) raw = snippet(text)
    if (!res.ok) {
      return { error: `Request failed (${res.status}). ${ifsErrorMessage(text)}`.trim(), status: res.status, raw }
    }
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return { error: `IFS answered ${res.status} but the body isn't JSON (${res.headers.get('content-type') || 'no content type'}).`, status: res.status, raw }
    }
    if (Array.isArray(data?.value)) records.push(...data.value)
    else if (Array.isArray(data?.d?.results)) records.push(...data.d.results)
    else if (data && typeof data === 'object') {
      const { '@odata.context': _ctx, ...entity } = data
      records.push(entity)
    }
    nextUrl = data?.['@odata.nextLink'] ? new URL(data['@odata.nextLink'], nextUrl).toString() : null
  }
  return { records, status: 200, raw }
}

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const contract = String(body?.contract ?? '').trim()
  const company = String(body?.company ?? '').trim()
  if (!contract || !company) {
    return Response.json({ success: false, error: 'The site needs both a Site (Contract) and a Company.' }, { status: 400 })
  }

  const ctx = { c: odataKey(contract), co: odataKey(company) }

  let firstUrl
  try {
    firstUrl = buildProjectionUrl(body?.baseUrl, `${SITE_PROJECTION}/${SITE_DATA_SOURCES[0].path(ctx)}`)
  } catch {
    return Response.json(
      { success: false, error: 'Missing Base URL — configure it in "Configure source environment".' },
      { status: 400 }
    )
  }

  const { accessToken, token, errorResponse } = await resolveAccessToken(body, firstUrl)
  if (errorResponse) return errorResponse

  let tokenInvalid = false
  const sections = []

  for (const source of SITE_DATA_SOURCES) {
    const url = buildProjectionUrl(body.baseUrl, `${SITE_PROJECTION}/${source.path(ctx)}`)
    let result
    try {
      result = await getAll(url, accessToken)
    } catch (err) {
      result = { error: `Could not reach IFS: ${err.message}`, status: 502 }
    }
    if (result.status === 401) tokenInvalid = true
    sections.push({
      id: source.id,
      label: source.label,
      url,
      httpStatus: result.status,
      records: result.records || [],
      error: result.error,
      raw: result.raw
    })
  }

  return Response.json({ success: true, contract, sections, token, tokenInvalid })
}
