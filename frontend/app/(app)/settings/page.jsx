'use client'

import { useEffect, useState } from 'react'
import { getSession } from '../../../lib/auth'
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined'

export default function ProfileSettingsPage() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    setSession(getSession())
  }, [])

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h1>User Profile</h1>
          <p>Manage your account settings and preferences.</p>
        </div>
      </header>

      <div className="panel" style={{ maxWidth: '720px', padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PersonOutlineOutlinedIcon style={{ fontSize: '32px' }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px' }}>Profile Details</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Personal information and account status.</div>
          </div>
        </div>
        
        <div style={{ display: 'grid', gap: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '20px' }}>
            <div style={{ minWidth: '200px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '4px' }}>Email Address</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>The email address associated with your account.</div>
            </div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', background: 'var(--bg)', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              {session?.email || 'Loading...'}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '20px' }}>
            <div style={{ minWidth: '200px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '4px' }}>Account Role</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Your current permission level.</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: '12px', color: 'var(--accent-strong)', background: 'var(--accent-soft)', padding: '6px 12px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Administrator
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ minWidth: '200px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '4px' }}>Last Login</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>The last time you accessed the system.</div>
            </div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-muted)' }}>
              {session?.loggedInAt ? new Date(session.loggedInAt).toLocaleString() : 'Loading...'}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
