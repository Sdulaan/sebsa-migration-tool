'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SyncAltOutlinedIcon from '@mui/icons-material/SyncAltOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import { getHistory } from '../../lib/migrationStore'

export default function DashboardPage() {
  const [history, setHistory] = useState([])

  useEffect(() => {
    setHistory(getHistory())
  }, [])

  const totalMigrations = history.length
  const totalRecords = history.reduce((sum, h) => sum + (h.totalRecords || 0), 0)
  const failedRecords = history.reduce((sum, h) => sum + (h.counts?.FAILED || 0), 0)
  const last = history[0]
  const lastTransfer = last ? new Date(last.completedAt).toLocaleDateString() : '—'

  const summaryCards = [
    { label: 'Total Transfers', value: totalMigrations, icon: SyncAltOutlinedIcon, tone: 'accent' },
    { label: 'Records Migrated', value: totalRecords, icon: StorageOutlinedIcon, tone: 'success' },
    { label: 'Failed Records', value: failedRecords, icon: ErrorOutlineIcon, tone: failedRecords > 0 ? 'danger' : 'muted' },
    { label: 'Last Transfer', value: lastTransfer, icon: ScheduleOutlinedIcon, tone: 'muted', small: true }
  ]

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">DASHBOARD</span>
          <h1>IFS Data Transfer</h1>
          <p>Configure environments, fetch entity data for review, then transfer it into IFS.</p>
        </div>
        <Link href="/new-migration" className="button">Start new transfer</Link>
      </header>

      {/* <div className="banner">
        <b>Candidate data, not automatic loading.</b> Data is fetched for review; transfer only runs when you confirm it.
      </div> */}

      <div className="cards">
        {summaryCards.map(({ label, value, icon: Icon, tone, small }) => (
          <article className="stat-card" key={label}>
            <div className="stat-card-head">
              <label>{label}</label>
              <span className={`stat-card-icon tone-${tone}`}>
                <Icon fontSize="small" />
              </span>
            </div>
            <strong className={small ? 'stat-card-value-sm' : ''}>{value}</strong>
          </article>
        ))}
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HISTORY</span>
            <h2>Recent Transfers</h2>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="empty">No transfers yet. Start your first one above.</div>
        ) : (
          <div className="history-list">
            {history.slice(0, 5).map((h) => (
              <Link className="history-row history-row-link" href="/history" key={h.id}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14 }}>{h.fromEnv} → {h.toEnv}</h3>
                  <div className="history-meta">
                    {h.entities.map((e) => (
                      <span key={e.id}>{e.label}: {e.total}</span>
                    ))}
                    <span>{new Date(h.completedAt).toLocaleString()}</span>
                  </div>
                </div>
                <span className={`badge ${h.status === 'Completed' ? 'HIGH' : 'MEDIUM'}`}>{h.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
