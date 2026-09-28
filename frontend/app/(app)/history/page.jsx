'use client'

import { useEffect, useState } from 'react'
import { getHistory } from '../../../lib/migrationStore'

export default function HistoryPage() {
  const [history, setHistory] = useState([])

  useEffect(() => {
    setHistory(getHistory())
  }, [])

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">HISTORY</span>
          <h1>Transfer History</h1>
          <p>Review all past transfers executed in the system.</p>
        </div>
      </header>

      <div className="panel">
        {history.length === 0 ? (
          <div className="empty">No transfers yet.</div>
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
