import { exchangeIfsAuthCode, IfsAuthError } from '../../../../../lib/server/ifsAuth'

// Browser sign-in, step 2: exchanges the code from IFS's login page (plus the
// PKCE verifier) for tokens at the environment's token endpoint. Runs on the
// server so the client secret isn't sent to IFS from the browser and the call
// isn't blocked by CORS.
//
// Body: { config: { baseUrl, authPath, clientId, clientSecret }, code, codeVerifier, redirectUri }

export async function POST(request) {
  const body = await request.json().catch(() => null)
  try {
    const token = await exchangeIfsAuthCode({
      baseUrl: body?.config?.baseUrl,
      authPath: body?.config?.authPath,
      clientId: body?.config?.clientId,
      clientSecret: body?.config?.clientSecret,
      code: body?.code,
      codeVerifier: body?.codeVerifier,
      redirectUri: body?.redirectUri
    })
    return Response.json({ success: true, ...token })
  } catch (err) {
    const status = err instanceof IfsAuthError ? err.status : 500
    return Response.json({ success: false, error: err.message }, { status })
  }
}
