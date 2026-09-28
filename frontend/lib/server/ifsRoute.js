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

// IFS error bodies: { error: { code, message, details: [...] } }.
export function ifsErrorMessage(text) {
  try {
    const parsed = JSON.parse(text)
    return parsed?.error?.message || parsed?.message || ''
  } catch {
    return ''
  }
}
