'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSession, logout } from '../lib/auth'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined'
import HistoryIcon from '@mui/icons-material/History'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'

export default function AppShell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setSession(getSession())
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  function handleLogout() {
    logout()
    router.replace('/login')
  }

  return (
    <div className={`shell ${menuOpen ? 'sidebar-open' : ''}`}>
      <aside className="app-sidebar" id="app-navigation" aria-label="Main navigation">
        <div className="app-sidebar-head">
          <div className="brand">
            <img src="/sebsa-logo.png" alt="SEBSA" className="brand-logo" />
          </div>
        </div>
        <nav className="app-nav" aria-label="Main navigation">
          <Link href="/" onClick={() => setMenuOpen(false)} className={pathname === '/' ? 'active' : ''}>
            <DashboardOutlinedIcon fontSize="small" /> Dashboard
          </Link>
          <Link href="/new-migration" onClick={() => setMenuOpen(false)} className={pathname === '/new-migration' ? 'active' : ''}>
            <AddCircleOutlinedIcon fontSize="small" /> New Transfer
          </Link>
          <Link href="/configuration" onClick={() => setMenuOpen(false)} className={pathname === '/configuration' ? 'active' : ''}>
            <TuneOutlinedIcon fontSize="small" /> Configuration
          </Link>
          <Link href="/history" onClick={() => setMenuOpen(false)} className={pathname === '/history' ? 'active' : ''}>
            <HistoryIcon fontSize="small" /> Transfer History
          </Link>
          <Link href="/settings" onClick={() => setMenuOpen(false)} className={pathname === '/settings' ? 'active' : ''}>
            <SettingsOutlinedIcon fontSize="small" /> Settings
          </Link>
        </nav>
        <div className="notice app-session" style={{ borderTop: 'none', padding: 0 }}>
          {session && (
            <button
              className="sign-out-btn"
              onClick={handleLogout}
              style={{ width: '100%', padding: '12px', fontSize: '14px', justifyContent: 'center', borderRadius: 'var(--radius)' }}
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
      <button type="button" className="app-sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
      <button
        type="button"
        className="app-menu-toggle"
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen}
        aria-controls="app-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <CloseIcon /> : <MenuIcon />}
      </button>
      <div className="app-main-column">
        <div className="app-mobile-toolbar">
          <img src="/sebsa-logo.png" alt="SEBSA" className="brand-logo" />
        </div>
        <main>{children}</main>
      </div>
    </div>
  )
}
