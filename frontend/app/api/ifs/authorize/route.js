import { requestIfsToken, IfsAuthError } from '../../../../lib/server/ifsAuth'

// Real OAuth2 token exchange against the environment's configured
// authorization path. Called by "Test connection" in the source environment
// modal — the resulting token is handed back to the client to cache in
// sessionStorage for the lifetime of the browser session.
export async function POST(request) {
  const config = await request.json().catch(() => null)
  try {
    const token = await requestIfsToken(config || {})
    return Response.json({ success: true, ...token })
  } catch (err) {
    const status = err instanceof IfsAuthError ? err.status : 500
    return Response.json({ success: false, error: err.message }, { status })
  }
}
