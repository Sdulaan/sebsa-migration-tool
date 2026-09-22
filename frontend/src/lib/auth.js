const SESSION_KEY = 'sebsa_ifs_migration_session'

// Demo credentials for the front-end-only layer. Real auth arrives with the IFS backend integration.
const DEMO_USER = { email: 'admin@sebsa.com', password: 'sebsa2026' }

export function login(email, password) {
  const ok = email.trim().toLowerCase() === DEMO_USER.email && password === DEMO_USER.password
  if (!ok) return false
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email, loggedInAt: new Date().toISOString() }))
  return true
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}

export function isAuthenticated() {
  return getSession() !== null
}
