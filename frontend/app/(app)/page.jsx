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
          <h1>IFS data migration</h1>
          <p>Configure environments, fetch entity data for review, then migrate it into IFS.</p>
        </div>
        <Link href="/new-migration" className="button">Start new migration</Link>
      </header>

      <div className="banner">
        <b>Candidate data, not automatic loading.</b> Data is fetched for review; migration only runs when you confirm it.
      </div>

      <div className="cards">
        <article>
          <label>SERVICE</label>
          <strong style={{ fontSize: 18 }}>healthy</strong>
        </article>
        <article>
          <label>TOTAL MIGRATIONS</label>
          <strong>{totalMigrations}</strong>
        </article>
        <article>
          <label>RECORDS MIGRATED</label>
          <strong>{totalRecords}</strong>
        </article>
        <article>
          <label>LAST MIGRATION</label>
          <strong style={{ fontSize: 15 }}>{last ? new Date(last.completedAt).toLocaleDateString() : '—'}</strong>
        </article>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HISTORY</span>
            <h2>Recent migrations</h2>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="empty">No migrations yet. Start your first one above.</div>
        ) : (
          <div className="history-list">
            {history.map((h) => (
              <div className="history-row" key={h.id}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14 }}>{h.fromEnv} → {h.toEnv}</h3>
                  <div className="history-meta">
                    {h.entities.map((e) => (
                      <span key={e.id}>{e.label}: {e.total}</span>
                    ))}
                    <span>{new Date(h.completedAt).toLocaleString()}</span>
                  </div>
                </div>
                <span className="badge HIGH">{h.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
