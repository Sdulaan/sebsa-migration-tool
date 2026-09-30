// Browser sign-in, the redirect URI registered on the IFS IAM client:
//   {app origin}/api/ifs/oauth/callback
// IFS's login page sends the sign-in popup here with ?code=…&state=… (or
// ?error=…). This page only hands those back to the window that opened the
// popup — same origin only — and closes. The code is exchanged for tokens by
// /api/ifs/oauth/token, using the PKCE verifier that only the opener holds.

export function GET(request) {
  const url = new URL(request.url)
  const message = {
    type: 'ifs-oauth-callback',
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    error: url.searchParams.get('error'),
    errorDescription: url.searchParams.get('error_description')
  }

  // JSON.stringify output is safe inside a <script> once "<" is escaped.
  const payload = JSON.stringify(message).replace(/</g, '\\u003c')
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>IFS sign-in</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;color:#1E2433">
<p id="msg">Finishing IFS sign-in…</p>
<script>
  var message = ${payload};
  var delivered = false;
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(message, window.location.origin);
    delivered = true;
  }
  // Same-origin fallback for when the login page's headers severed the
  // popup's link to its opener.
  if (typeof BroadcastChannel !== 'undefined') {
    var channel = new BroadcastChannel('ifs-oauth');
    channel.postMessage(message);
    channel.close();
    delivered = true;
  }
  if (delivered) {
    window.close();
  } else {
    document.getElementById('msg').textContent =
      'This sign-in window lost its connection to the migration tool. Close it and click "Sign in with IFS Cloud" again.';
  }
</script>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })
}
