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

function resolveTokenUrl(authPath, baseUrl, fallbackOrigin) {
  try {
    return authPath.startsWith('http') ? authPath : new URL(authPath, baseUrl || fallbackOrigin).toString()
  } catch {
    throw new IfsAuthError(400, 'Invalid authorization path or base URL.')
  }
}

// The account a token was issued to, for display only (the token isn't
// verified here — IFS verifies it on every call).
function tokenUsername(accessToken) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'))
    return payload.preferred_username || payload.upn || payload.sub || null
  } catch {
    return null
  }
}

async function postTokenRequest(tokenUrl, params) {
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
    expiresIn: tokenBody.expires_in || 3600,
    refreshToken: tokenBody.refresh_token || null,
    user: tokenUsername(tokenBody.access_token)
  }
}

// Browser sign-in, step 2: swaps the one-time code IFS's login page handed
// back (authorization code + PKCE) for tokens. The client secret is optional —
// a public IAM client relies on PKCE alone.
export async function exchangeIfsAuthCode({ baseUrl, authPath, clientId, clientSecret, code, codeVerifier, redirectUri }) {
  if (!authPath || !clientId || !code || !codeVerifier || !redirectUri) {
    throw new IfsAuthError(400, 'Missing authorization path, client ID, code or PKCE verifier.')
  }
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri
  })
  if (clientSecret) params.set('client_secret', clientSecret)
  return postTokenRequest(resolveTokenUrl(authPath, baseUrl), params)
}

export async function requestIfsToken({ baseUrl, authPath, grantType, clientId, clientSecret, username, password, refreshToken, fallbackOrigin }) {
  // Browser sign-in: a new access token can only come from the refresh token
  // the sign-in produced; without one, the user has to sign in again.
  if (grantType === 'authorization_code') {
    if (!authPath || !clientId) throw new IfsAuthError(400, 'Missing authorization path or client ID.')
    if (!refreshToken) {
      throw new IfsAuthError(401, 'Your IFS sign-in has expired — open the environment settings and click "Sign in with IFS Cloud" again.')
    }
    const params = new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken })
    if (clientSecret) params.set('client_secret', clientSecret)
    try {
      return await postTokenRequest(resolveTokenUrl(authPath, baseUrl, fallbackOrigin), params)
    } catch (err) {
      throw new IfsAuthError(401, `Your IFS sign-in could not be renewed — sign in with IFS Cloud again. (${err.message})`)
    }
  }

  if (!authPath || !clientId || !clientSecret) {
    throw new IfsAuthError(400, 'Missing authorization path, client ID or client secret.')
  }

  const tokenUrl = resolveTokenUrl(authPath, baseUrl, fallbackOrigin)

  const params = new URLSearchParams({
    grant_type: grantType || 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  })
  if (grantType === 'password') {
    params.set('username', username || '')
    params.set('password', password || '')
  }

  // Client credentials / password tokens are re-minted from the config, so
  // no refresh token is kept for them.
  const { refreshToken: _unused, ...token } = await postTokenRequest(tokenUrl, params)
  return token
}
