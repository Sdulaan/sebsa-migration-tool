import { requestIfsToken, IfsAuthError } from '../../../../../lib/server/ifsAuth'
import { buildCreateCompanyUrl, buildCreateCompanyBatchUrl } from '../../../../../lib/migrationStore'
import { buildCompanyBatch, parseCompanyBatchResponse } from '../../../../../lib/server/ifsCompanyBatch'

// Server-side proxy that creates companies in the destination environment via
// the CreateNewCompany assistant action.
//
// Tries the $batch endpoint first, same mechanism as PartCatalog — one HTTP
// request, one changeset per company. CreateNewCompany is an *action*, not a
// plain entity-set POST, so whether IFS's OData layer accepts an action
// inside $batch is unverified. If the whole call doesn't come back as
// multipart/mixed (wrong endpoint, action unsupported in $batch, an
// unrelated failure before IFS even opens the batch), that's not a
// per-company failure — it falls back to sending the companies one request
// at a time (confirmed to work against a real environment: 200 with
// { Company, Success }, where Success is not just "TRUE" — see below).
//
// Runs on the server so the OAuth2 client secret never reaches the browser
// bundle and the call isn't blocked by CORS.

export async function POST(request) {
  const body = await request.json().catch(() => null)

  const companies = body?.records
  if (!Array.isArray(companies) || companies.length === 0) {
    return Response.json({ success: false, error: 'No records to post.' }, { status: 400 })
  }

  let createUrl
  try {
    createUrl = buildCreateCompanyUrl(body?.baseUrl)
  } catch {
    return Response.json(
      { success: false, error: 'Missing Base URL — configure it in "Configure destination environment".' },
      { status: 400 }
    )
  }

  // The client sends a cached session token when it has one; otherwise it
  // sends the environment config and we mint one here. It also always sends
  // `config` when it has one (even alongside a cached token) — creating a
  // company is slow (real DB provisioning), so the sequential fallback can
  // easily outlive the access token's TTL, and we need a way to mint a fresh
  // one mid-loop without aborting the rest of the batch.
  let accessToken = body?.accessToken
  const config = body?.config || null
  let token = null

  if (!accessToken) {
    try {
      token = await requestIfsToken({ ...(config || {}), fallbackOrigin: createUrl })
      accessToken = token.accessToken
    } catch (err) {
      const status = err instanceof IfsAuthError ? err.status : 500
      return Response.json({ success: false, error: err.message }, { status })
    }
  }

  const batchResponse = await tryBatch(companies, accessToken, body?.baseUrl, createUrl, token)
  if (batchResponse) return batchResponse

  return runSequential(companies, accessToken, config, createUrl, token)
}

// Returns a Response when the batch was genuinely attempted and answered
// (success or per-company failures), or null when it should fall back to
// the sequential path (batch endpoint rejected the request outright, or
// couldn't be reached at all).
async function tryBatch(companies, accessToken, baseUrl, createUrl, token) {
  let batchUrl
  try {
    batchUrl = buildCreateCompanyBatchUrl(baseUrl)
  } catch {
    return null
  }

  const batch = buildCompanyBatch(companies)
  if (!batch.body) return null // nothing valid to send — let the sequential path report why

  let batchRes
  let batchText
  try {
    batchRes = await fetch(batchUrl, {
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
    batchText = await batchRes.text()
  } catch {
    return null // couldn't reach the $batch endpoint at all — try sequential
  }

  const contentType = batchRes.headers.get('content-type') || ''
  if (!/multipart\/mixed/i.test(contentType)) {
    // The batch itself was rejected (wrong endpoint, action not supported in
    // $batch, malformed request, whole-batch 401, ...) rather than individual
    // companies failing — fall back rather than reporting this as 75 failures.
    return null
  }

  const { successful, failed, unconfirmed } = parseCompanyBatchResponse(batchText, contentType, batch.recordMap, batch.skipped)
  return Response.json({
    success: true,
    url: batchUrl,
    mode: 'batch',
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

// One CreateNewCompany request per company — the confirmed-working path.
async function runSequential(companies, accessToken, config, createUrl, token) {
  async function postOnce(company) {
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(company),
      cache: 'no-store'
    })
    return { res, resBody: await res.json().catch(() => null) }
  }

  const successful = []
  const failed = []
  // Set only once a 401 survives a token refresh (or there's no config to
  // refresh with) — at that point every later call would fail the same way,
  // so the rest are reported as skipped instead of calling IFS again.
  let tokenInvalid = false

  for (const company of companies) {
    const companyCode = String(company?.NewCompany ?? '').trim()
    if (!companyCode) {
      failed.push({ NewCompany: 'Unknown', error: 'Missing or invalid NewCompany', record: company })
      continue
    }
    if (tokenInvalid) {
      failed.push({ NewCompany: companyCode, error: 'Skipped — authorization failed on an earlier company in this batch.' })
      continue
    }

    let res
    let resBody
    try {
      ;({ res, resBody } = await postOnce(company))
      if (res.status === 401 && config) {
        // The access token expired partway through — mint a fresh one and
        // retry this same company once before giving up on it.
        try {
          const refreshed = await requestIfsToken({ ...config, fallbackOrigin: createUrl })
          accessToken = refreshed.accessToken
          token = refreshed
          ;({ res, resBody } = await postOnce(company))
        } catch {
          // Refresh itself failed — fall through, this counts as 401 below.
        }
      }
    } catch (err) {
      failed.push({ NewCompany: companyCode, error: `Could not reach CreateNewCompany: ${err.message}` })
      continue
    }

    if (res.status === 401) tokenInvalid = true

    // The action's Success field isn't just "TRUE"/"FALSE" — a real
    // environment also returned "OPEN_LOG" for a company that WAS created
    // (confirmed in IFS afterwards), presumably meaning "created, but see
    // the company creation log for warnings". Since we don't know the full
    // set of non-failure values, treat any response that echoes back the
    // company code as success, and surface the exact Success value either way.
    if (res.ok && resBody?.Company && resBody?.Success && resBody.Success !== 'FALSE') {
      successful.push({ NewCompany: resBody.Company, status: res.status, note: resBody.Success })
    } else {
      // Known message fields first; otherwise fall back to the raw body so a
      // 200 with Success !== "TRUE" (or an unfamiliar error shape) still
      // shows the real reason instead of a generic status line.
      const detail =
        resBody?.error?.message || resBody?.Message || resBody?.message || resBody?.ErrorMessage ||
        (resBody ? JSON.stringify(resBody).slice(0, 300) : '')
      failed.push({
        NewCompany: companyCode,
        status: res.status,
        error: (`${!res.ok ? `Request failed (${res.status}). ` : ''}${detail}`.trim()) || `Request failed (${res.status}).`
      })
    }
  }

  return Response.json({
    success: true,
    url: createUrl,
    mode: 'sequential',
    summary: { totalSubmitted: companies.length, successful: successful.length, failed: failed.length },
    successful,
    failed,
    token
  })
}
