'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSession, logout } from '../lib/auth'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined'
import HistoryIcon from '@mui/icons-material/History'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'

export default function AppShell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState(null)

  useEffect(() => {
    setSession(getSession())
  }, [])

  function handleLogout() {
    logout()
    router.replace('/login')
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <img src="/sebsa-logo.png" alt="SEBSA" className="brand-logo" />
        </div>
        <nav>
          <Link href="/" className={pathname === '/' ? 'active' : ''}>
            <DashboardOutlinedIcon fontSize="small" /> Dashboard
          </Link>
          <Link href="/new-migration" className={pathname === '/new-migration' ? 'active' : ''}>
            <AddCircleOutlinedIcon fontSize="small" /> New Migration
          </Link>
          <Link href="/history" className={pathname === '/history' ? 'active' : ''}>
            <HistoryIcon fontSize="small" /> Migration History
          </Link>
          <Link href="/settings" className={pathname === '/settings' ? 'active' : ''}>
            <SettingsOutlinedIcon fontSize="small" /> Settings
          </Link>
        </nav>
        <div className="notice" style={{ borderTop: 'none', padding: 0 }}>
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
      <main>{children}</main>
    </div>
  )
}
