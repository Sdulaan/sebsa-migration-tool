'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSession, logout } from '../lib/auth'

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
          <Link href="/" className={pathname === '/' ? 'active' : ''}>Dashboard</Link>
          <Link href="/new-migration" className={pathname === '/new-migration' ? 'active' : ''}>New Migration</Link>
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
      <main>{children}</main>
    </div>
  )
}
