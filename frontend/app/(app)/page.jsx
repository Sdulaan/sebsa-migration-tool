'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getHistory } from '../../lib/migrationStore'

export default function DashboardPage() {
  const [history, setHistory] = useState([])

  useEffect(() => {
    setHistory(getHistory())
  }, [])

  const totalMigrations = history.length
  const totalRecords = history.reduce((sum, h) => sum + h.totalRecords, 0)
  const last = history[0]

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">DASHBOARD</span>
          <h1>IFS data transfer</h1>
          <p>Configure environments, fetch entity data for review, then transfer it into IFS.</p>
        </div>
        <Link href="/new-migration" className="button">Start new transfer</Link>
      </header>

      <div className="banner">
        <b>Candidate data, not automatic loading.</b> Data is fetched for review; transfer only runs when you confirm it.
      </div>

      <div className="cards">
        <article>
          <label>SERVICE</label>
          <strong style={{ fontSize: 18 }}>healthy</strong>
        </article>
        <article>
          <label>TOTAL TRANSFERS</label>
          <strong>{totalMigrations}</strong>
        </article>
        <article>
          <label>RECORDS MIGRATED</label>
          <strong>{totalRecords}</strong>
        </article>
        <article>
          <label>LAST TRANSFER</label>
          <strong style={{ fontSize: 15 }}>{last ? new Date(last.completedAt).toLocaleDateString() : '—'}</strong>
        </article>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HISTORY</span>
            <h2>Recent transfers</h2>
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
