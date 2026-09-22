import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AVAILABLE_COLUMNS, fetchColumnData, runMigration } from '../lib/migrationStore.js'

const STEPS = ['Select column', 'Review data', 'Migrate']

export default function NewMigration() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [columnId, setColumnId] = useState('lu')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [migrated, setMigrated] = useState(null)

  const column = AVAILABLE_COLUMNS.find((c) => c.id === columnId)

  async function handleFetch() {
    setLoading(true)
    const result = await fetchColumnData(columnId)
    setData(result)
    setLoading(false)
    setStep(1)
  }

  async function handleMigrate() {
    setLoading(true)
    const entry = await runMigration(columnId, data.total)
    setMigrated(entry)
    setLoading(false)
    setStep(2)
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">NEW MIGRATION</span>
          <h1>Migrate data to IFS</h1>
          <p>Choose a column, review what will move, then confirm the migration.</p>
        </div>
      </header>

      <div className="stepper">
        {STEPS.map((label, i) => (
          <div key={label} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
            <span className="step-index">{i < step ? '✓' : i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="panel">
          <h2>Select a column to migrate</h2>
          <p className="login-sub" style={{ marginTop: -6 }}>Only LU's are enabled in this first release. More columns arrive with the full IFS integration.</p>

          <div className="column-grid">
            {AVAILABLE_COLUMNS.map((c) => (
              <button
                type="button"
                key={c.id}
                disabled={!c.enabled}
                className={`column-card ${columnId === c.id ? 'selected' : ''}`}
                onClick={() => c.enabled && setColumnId(c.id)}
              >
                <span className="column-card-label">{c.label}</span>
                <small>{c.description}</small>
                {!c.enabled && <span className="badge MEDIUM" style={{ marginTop: 8 }}>Coming soon</span>}
              </button>
            ))}
          </div>

          <div className="actions">
            <button onClick={handleFetch} disabled={loading || !column?.enabled}>
              {loading ? 'Fetching…' : `Fetch ${column?.label} data`}
            </button>
          </div>
        </div>
      )}

      {step === 1 && data && (
        <div className="panel">
          <h2>Review fetched data</h2>

          <div className="security-summary">
            <b>{data.total} {column.label} records fetched</b>
            <span>{data.total - data.flagged} ready</span>
            <span>{data.flagged} needs review</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>LU Code</th>
                  <th>Description</th>
                  <th>Site</th>
                  <th>UoM</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.records.slice(0, 12).map((r) => (
                  <tr key={r.luCode}>
                    <td>{r.luCode}</td>
                    <td>{r.description}</td>
                    <td>{r.site}</td>
                    <td>{r.uom}</td>
                    <td><span className={`badge ${r.status === 'Ready' ? 'HIGH' : 'MEDIUM'}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > 12 && <p className="login-sub">Showing 12 of {data.total} records.</p>}

          <div className="actions">
            <button className="ghost" onClick={() => setStep(0)}>Back</button>
            <button onClick={handleMigrate} disabled={loading}>
              {loading ? 'Migrating…' : `Migrate ${data.total} records to IFS`}
            </button>
          </div>
        </div>
      )}

      {step === 2 && migrated && (
        <div className="panel result-panel">
          <span className="badge HIGH" style={{ marginBottom: 10 }}>Completed</span>
          <h2>Migration complete</h2>
          <p>
            {migrated.recordCount} {column.label} records were migrated to IFS at{' '}
            {new Date(migrated.completedAt).toLocaleString()}.
          </p>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => navigate('/')}>Back to dashboard</button>
            <button
              className="secondary"
              onClick={() => {
                setStep(0)
                setData(null)
                setMigrated(null)
              }}
            >
              Start another migration
            </button>
          </div>
        </div>
      )}
    </>
  )
}
