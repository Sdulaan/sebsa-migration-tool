'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getHistory } from '../../lib/migrationStore'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import SyncAltIcon from '@mui/icons-material/SyncAlt'
import StorageIcon from '@mui/icons-material/Storage'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

export default function DashboardPage() {
  const [history, setHistory] = useState([])

  useEffect(() => {
    setHistory(getHistory())
  }, [])

  const totalTransfers = history.length
  const totalRecords = history.reduce((sum, h) => sum + h.totalRecords, 0)
  const last = history[0]

  return (
    <>
      <header style={{ marginBottom: '24px' }}>
        <div>
          <span className="eyebrow">DASHBOARD</span>
          <h1>IFS Data Transfer</h1>
          <p>Monitor your transfer environments and initiate new data transfers.</p>
        </div>
      </header>

      <div style={{ 
        background: 'linear-gradient(135deg, var(--grad-start), var(--grad-end))', 
        borderRadius: 'var(--radius-lg)', 
        padding: '32px 40px', 
        color: '#fff', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        marginBottom: '32px',
        boxShadow: '0 10px 30px rgba(76, 29, 140, 0.15)'
      }}>
        <div style={{ maxWidth: '500px' }}>
          <h2 style={{ color: '#fff', fontSize: '24px', marginBottom: '8px' }}>Ready to transfer data?</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: '15px', lineHeight: 1.5 }}>
            Configure source and destination environments, fetch candidate data for review, and safely transfer master entities into IFS.
          </p>
        </div>
        <Link href="/new-migration" className="button" style={{ background: '#fff', color: 'var(--accent-strong)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          Start new transfer
        </Link>
      </div>

      <div className="cards" style={{ margin: '0 0 32px' }}>
        <article style={{ display: 'flex', flexDirection: 'column', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <label>SERVICE</label>
            <CheckCircleOutlinedIcon style={{ color: 'var(--success-text)', background: 'var(--success-bg)', borderRadius: '50%', padding: '4px', fontSize: '28px' }} />
          </div>
          <strong style={{ fontSize: '24px', marginTop: 'auto', paddingTop: '16px' }}>Healthy</strong>
        </article>
        
        <article style={{ display: 'flex', flexDirection: 'column', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <label>TRANSFERS</label>
            <SyncAltIcon style={{ color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: '50%', padding: '4px', fontSize: '28px' }} />
          </div>
          <strong style={{ marginTop: 'auto', paddingTop: '16px' }}>{totalTransfers}</strong>
        </article>

        <article style={{ display: 'flex', flexDirection: 'column', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <label>RECORDS</label>
            <StorageIcon style={{ color: '#E85D04', background: '#FFEDD5', borderRadius: '50%', padding: '4px', fontSize: '28px' }} />
          </div>
          <strong style={{ marginTop: 'auto', paddingTop: '16px' }}>{totalRecords}</strong>
        </article>

        <article style={{ display: 'flex', flexDirection: 'column', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <label>LAST RUN</label>
            <CalendarTodayIcon style={{ color: '#0284C7', background: '#E0F2FE', borderRadius: '50%', padding: '4px', fontSize: '28px' }} />
          </div>
          <strong style={{ fontSize: '18px', marginTop: 'auto', paddingTop: '16px' }}>
            {last ? new Date(last.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </strong>
        </article>
      </div>

      <div className="panel" style={{ padding: '0' }}>
        <div className="section-heading" style={{ padding: '24px 24px 16px', margin: 0, borderBottom: '1px solid var(--border-soft)' }}>
          <div>
            <span className="eyebrow">ACTIVITY</span>
            <h2 style={{ margin: '4px 0 0' }}>Recent Transfers</h2>
          </div>
          <Link href="/history" className="ghost link-btn" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}>View all history</Link>
        </div>

        {history.length === 0 ? (
          <div className="empty" style={{ padding: '60px 20px', background: 'var(--surface)', borderRadius: '0 0 12px 12px' }}>
            No transfers yet. Start your first one above.
          </div>
        ) : (
          <div className="history-list" style={{ padding: '0 24px' }}>
            {history.slice(0, 3).map((h) => (
              <div className="history-row" key={h.id} style={{ padding: '20px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border-soft)', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
                    <SyncAltIcon />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {h.fromEnv} <ArrowForwardIcon style={{ fontSize: '14px', color: 'var(--text-faint)' }} /> {h.toEnv}
                    </h3>
                    <div className="history-meta" style={{ marginTop: '4px' }}>
                      {h.entities.map((e) => (
                        <span key={e.id} style={{ background: '#fff' }}>{e.label}: {e.total}</span>
                      ))}
                      <span style={{ border: 'none', background: 'transparent', padding: '5px 0' }}>{new Date(h.completedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <span className={`badge ${h.status.toUpperCase() === 'COMPLETED' ? 'HIGH' : ''}`} style={{ padding: '6px 12px' }}>
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </>
  )
}
