// Server-only: exchanges IFS environment credentials for a real OAuth2 access
// token. Imported only by route handlers under app/api/ifs/ — never import
// this from client ('use client') code, since it's where client secrets are
// actually used against the IFS Identity Provider.

export class IfsAuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function requestIfsToken({ baseUrl, authPath, grantType, clientId, clientSecret, username, password, fallbackOrigin }) {
  if (!authPath || !clientId || !clientSecret) {
    throw new IfsAuthError(400, 'Missing authorization path, client ID or client secret.')
  }

  let tokenUrl
  try {
    tokenUrl = authPath.startsWith('http') ? authPath : new URL(authPath, baseUrl || fallbackOrigin).toString()
  } catch {
    throw new IfsAuthError(400, 'Invalid authorization path or base URL.')
  }

  const params = new URLSearchParams({
    grant_type: grantType || 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  })
  if (grantType === 'password') {
    params.set('username', username || '')
    params.set('password', password || '')
  }

  let tokenRes
  try {
    tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      cache: 'no-store'
    })
  } catch (err) {
    throw new IfsAuthError(502, `Could not reach authorization endpoint: ${err.message}`)
  }

  const tokenBody = await tokenRes.json().catch(() => null)
  if (!tokenRes.ok || !tokenBody?.access_token) {
    const detail = tokenBody?.error_description || tokenBody?.error || ''
    throw new IfsAuthError(401, `Authorization failed (${tokenRes.status}) at ${tokenUrl}. ${detail}`.trim())
  }

  return {
    accessToken: tokenBody.access_token,
    tokenType: tokenBody.token_type || 'Bearer',
    expiresIn: tokenBody.expires_in || 3600
  }
}
