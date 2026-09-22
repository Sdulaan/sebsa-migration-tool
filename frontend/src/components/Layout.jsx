import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getSession, logout } from '../lib/auth.js'

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <img src="/sebsa-logo.png" alt="SEBSA" className="brand-logo" />
        </div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/new-migration">New Migration</NavLink>
        </nav>
        <div className="notice">
          <div className="notice-text">
            <span className="sebsa-mark">IFS DATA MIGRATION</span>
            Candidate data is fetched for review.<br />Migration is confirmed by you.
          </div>
          {session && (
            <div className="session-row">
              <span title={session.email}>{session.email}</span>
              <button className="ghost link-btn" onClick={handleLogout}>Sign out</button>
            </div>
          )}
        </div>
      </aside>
      <main><Outlet /></main>
    </div>
  )
}
