// Browser sign-in to IFS Cloud (OAuth2 authorization code + PKCE), client
// side. Browser-only: uses window, crypto and sessionStorage.
//
//   1. A popup opens IFS's own login page (IFS IAM / Keycloak), so the user's
//      IFS username, password and any SSO/MFA are entered there — never in
//      this app.
//   2. IFS redirects the popup to /api/ifs/oauth/callback, which posts the
//      one-time code back here and closes.
//   3. /api/ifs/oauth/token swaps the code (+ PKCE verifier, + client secret
//      when the IAM client has one) for an access token and refresh token.
//
// The IAM client must have Standard flow enabled and
// `${origin}/api/ifs/oauth/callback` as a valid redirect URI.

import { setSessionToken, setRefreshToken } from './migrationStore'

const SCOPE = 'openid microprofile-jwt'
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

export function ifsRedirectUri() {
  return typeof window === 'undefined' ? '' : `${window.location.origin}/api/ifs/oauth/callback`
}

// The IFS login page (Auth URL). An Auth URL entered in the dialog wins;
// otherwise it's derived from the token URL:
// ".../protocol/openid-connect/token" → ".../protocol/openid-connect/auth".
export function ifsAuthorizeUrl(authPath, baseUrl, authUrl = '') {
  const explicit = (authUrl || '').trim()
  if (explicit) {
    if (!/^https?:\/\//.test(explicit)) throw new Error('The Auth URL must be a full address starting with https://.')
    if (explicit.includes('{')) throw new Error('Replace {YourNamespace} in the Auth URL with your IFS namespace first.')
    return explicit.replace(/\?.*$/, '')
  }
  if (!authPath) throw new Error('Set the Authorization path (the token URL) first.')
  if (authPath.includes('{')) throw new Error('Replace {YourNamespace} in the Authorization path with your IFS namespace first.')
  const tokenUrl = authPath.startsWith('http') ? authPath : new URL(authPath, baseUrl).toString()
  if (!/\/protocol\/openid-connect\/token\/?$/.test(tokenUrl)) {
    throw new Error('The Authorization path must end in /protocol/openid-connect/token for browser sign-in.')
  }
  return tokenUrl.replace(/\/token\/?$/, '/auth')
}

function base64Url(bytes) {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLength = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

// Waits for the callback page's message for this sign-in (matched by state),
// or fails if the popup is closed first or it takes too long.
// The callback page sends it both via postMessage and, as a fallback for a
// popup whose link to this window was severed, a same-origin BroadcastChannel.
function waitForCallback(popup, state) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ifs-oauth') : null
    function cleanup() {
      window.removeEventListener('message', onMessage)
      if (channel) channel.close()
      clearInterval(timer)
    }
    function accept(data) {
      if (data?.type !== 'ifs-oauth-callback' || data.state !== state) return
      cleanup()
      resolve(data)
    }
    function onMessage(event) {
      if (event.origin !== window.location.origin) return
      accept(event.data)
    }
    if (channel) channel.onmessage = (event) => accept(event.data)
    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup()
        reject(new Error('The IFS sign-in window was closed before sign-in finished.'))
      } else if (Date.now() - started > SIGN_IN_TIMEOUT_MS) {
        cleanup()
        popup.close()
        reject(new Error('IFS sign-in timed out — try again.'))
      }
    }, 500)
    window.addEventListener('message', onMessage)
  })
}


// The login-page address for one sign-in attempt, with a fresh PKCE verifier
// and state.
async function buildSignInRequest(config, redirectUri) {
  if (!config?.clientId) throw new Error('Enter the IAM Client ID first.')
  const authorizeUrl = ifsAuthorizeUrl(config.authPath, config.baseUrl, config.authUrl)
  const codeVerifier = randomString(48)
  const state = randomString(16)
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state,
    nonce: randomString(16),
    code_challenge: await pkceChallenge(codeVerifier),
    code_challenge_method: 'S256'
  })
  return { url: `${authorizeUrl}?${params}`, state, codeVerifier }
}

// Swaps the one-time code for tokens (server-side) and caches them for `env`.
async function exchangeAndStore(env, config, code, codeVerifier, redirectUri) {
  const res = await fetch('/api/ifs/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: { baseUrl: config.baseUrl, authPath: config.authPath, clientId: config.clientId, clientSecret: config.clientSecret },
      code,
      codeVerifier,
      redirectUri
    })
  })
  const body = await res.json()
  if (!res.ok || !body.success) throw new Error(body.error || `Sign-in failed (${res.status}).`)

  const token = setSessionToken(env, body)
  setRefreshToken(env, body.refreshToken)
  return {
    success: true,
    user: body.user,
    tokenPreview: `${body.user ? `Signed in as ${body.user}. ` : ''}${token.tokenType} •••• (expires ${new Date(token.expiresAt).toLocaleTimeString()})`
  }
}

function openSignInPopup() {
  return window.open('', 'ifs-sign-in', 'width=520,height=720')
}

const POPUP_BLOCKED = 'The browser blocked the IFS sign-in window — allow pop-ups for this site and try again.'

// Automatic browser sign-in: IFS returns to this app's own callback, which
// hands the code back here. Needs ifsRedirectUri() registered on the IAM
// client. Call it straight from a click handler: the popup is opened before
// anything is awaited, so popup blockers let it through.
export async function signInWithIfsBrowser(env, config) {
  const popup = openSignInPopup()
  if (!popup) return { success: false, error: POPUP_BLOCKED }

  try {
    const redirectUri = ifsRedirectUri()
    const request = await buildSignInRequest(config, redirectUri)
    popup.location.href = request.url

    const callback = await waitForCallback(popup, request.state)
    if (callback.error) {
      throw new Error(`IFS sign-in failed: ${callback.errorDescription || callback.error}`)
    }
    return await exchangeAndStore(env, config, callback.code, request.codeVerifier, redirectUri)
  } catch (err) {
    if (!popup.closed) popup.close()
    return { success: false, error: err.message }
  }
}

// ---- Paste fallback: any redirect URI other than this app's -----------------
// For when the app's own redirect URI isn't registered on the IAM client yet
// but another one is (e.g. Postman's callback). IFS sends the popup there with
// the code in its address; this app can't read another site's page, so the
// user copies that address and pastes it back (finishPastedSignIn). The code
// alone is useless without the PKCE verifier (kept here) and the client secret.

export const POSTMAN_CALLBACK_URI = 'https://oauth.pstmn.io/v1/callback'
const PENDING_KEY = 'sebsa_ifs_pending_signin'
const PENDING_MAX_AGE_MS = 10 * 60 * 1000

// The redirect URI a sign-in will use: the one entered in the dialog, else
// this app's own callback. (Configs saved before the field existed may carry
// redirectMode: 'postman' instead.)
export function effectiveRedirectUri(config) {
  const entered = (config?.redirectUri || '').trim()
  if (entered) return entered
  return config?.redirectMode === 'postman' ? POSTMAN_CALLBACK_URI : ifsRedirectUri()
}

// True when IFS will return to this app itself, so the popup can hand the
// code back automatically; any other redirect URI needs copy & paste.
export function isAppRedirectUri(uri) {
  return uri.replace(/\/+$/, '') === ifsRedirectUri()
}

function checkRedirectUri(uri) {
  if (!/^https?:\/\/[^/\s]+/i.test(uri)) throw new Error('The Redirect URI must be a full address starting with https:// (or http://localhost).')
}

// Step 1: opens IFS's login page, set to return to the given (external)
// redirect URI, and remembers this attempt's PKCE verifier, state and redirect
// URI for step 2 (this tab only).
export async function startPastedSignIn(env, config) {
  const popup = openSignInPopup()
  if (!popup) return { success: false, error: POPUP_BLOCKED }

  try {
    const redirectUri = effectiveRedirectUri(config)
    checkRedirectUri(redirectUri)
    const request = await buildSignInRequest(config, redirectUri)
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ env, state: request.state, codeVerifier: request.codeVerifier, redirectUri, startedAt: Date.now() })
    )
    popup.location.href = request.url
    return { success: true, pending: true }
  } catch (err) {
    popup.close()
    return { success: false, error: err.message }
  }
}

// The code (and state) from what the user pasted: the whole address the
// popup ended on, or just its query string.
function parsePasted(pasted) {
  const text = String(pasted || '').trim()
  if (!text) throw new Error('Paste the address the sign-in window ended on.')
  let params
  try {
    params = new URL(text).searchParams
  } catch {
    params = new URLSearchParams(text.replace(/^[^?]*\?/, ''))
  }
  const error = params.get('error')
  if (error) throw new Error(`IFS sign-in failed: ${params.get('error_description') || error}`)
  const code = params.get('code')
  if (!code) throw new Error('That address has no ?code=… in it — copy the full address from the sign-in window after logging in.')
  return { code, state: params.get('state') }
}

// Step 2: exchanges the pasted code for tokens.
export async function finishPastedSignIn(env, config, pasted) {
  try {
    let pending = null
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null')
    } catch {}
    if (!pending || pending.env !== env) throw new Error('Start the sign-in first ("Sign in with IFS Cloud"), then paste the address.')
    if (Date.now() - pending.startedAt > PENDING_MAX_AGE_MS) {
      sessionStorage.removeItem(PENDING_KEY)
      throw new Error('This sign-in attempt is too old — click "Sign in with IFS Cloud" again.')
    }

    const { code, state } = parsePasted(pasted)
    if (state !== pending.state) {
      throw new Error("That address is from a different sign-in attempt — use the address from the window this dialog just opened.")
    }

    // The exchange must name the same redirect URI the login used.
    const result = await exchangeAndStore(env, config, code, pending.codeVerifier, pending.redirectUri || POSTMAN_CALLBACK_URI)
    sessionStorage.removeItem(PENDING_KEY)
    return result
  } catch (err) {
    const hint = /code not valid|invalid_grant/i.test(err.message)
      ? ' The code can only be used once and expires after about a minute — if the browser offered to open the Postman app, choose Cancel. Click "Sign in with IFS Cloud" again and paste promptly.'
      : ''
    const message = /[.!?]$/.test(err.message) ? err.message : `${err.message}.`
    return { success: false, error: `${message}${hint}` }
  }
}
