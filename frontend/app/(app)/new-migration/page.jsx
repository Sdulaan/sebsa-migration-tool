'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AVAILABLE_ENTITIES, ENVIRONMENTS, fetchEntitiesData, runMigration } from '../../../lib/migrationStore'
import MigrationStepper from '../../../components/MigrationStepper'

const STEPS = ['Configuration', 'Review Data', 'Migrate']

export default function NewMigrationPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [fromEnv, setFromEnv] = useState('')
  const [toEnv, setToEnv] = useState('')
  const [selectedEntities, setSelectedEntities] = useState([])
  const [loading, setLoading] = useState(false)
  const [dataMap, setDataMap] = useState(null)
  const [migrated, setMigrated] = useState(null)

  const sameEnv = fromEnv && toEnv && fromEnv === toEnv
  const canFetch = fromEnv && toEnv && !sameEnv && selectedEntities.length > 0 && !loading

  function toggleEntity(id) {
    setSelectedEntities((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
  }

  async function handleFetch() {
    setLoading(true)
    const result = await fetchEntitiesData(selectedEntities)
    setDataMap(result)
    setLoading(false)
    setStep(1)
  }

  async function handleMigrate() {
    setLoading(true)
    const breakdown = selectedEntities.map((id) => {
      const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
      return { id, label: entity.label, total: dataMap[id].total }
    })
    const entry = await runMigration(fromEnv, toEnv, breakdown)
    setMigrated(entry)
    setLoading(false)
    setStep(2)
  }

  const totalRecords = dataMap
    ? selectedEntities.reduce((sum, id) => sum + (dataMap[id]?.total || 0), 0)
    : 0
  const totalFlagged = dataMap
    ? selectedEntities.reduce((sum, id) => sum + (dataMap[id]?.flagged || 0), 0)
    : 0

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">NEW MIGRATION</span>
          <h1>Migrate data to IFS</h1>
          <p>Configure the environments and entities, review what will move, then confirm the migration.</p>
        </div>
      </header>

      <MigrationStepper steps={STEPS} activeStep={step} />

      {step === 0 && (
        <div className="panel">
          <h2>Configure migration</h2>
          <p className="login-sub" style={{ marginTop: -6 }}>Select the source and destination environments, then choose the entities to migrate.</p>

          <div className="env-row">
            <label>
              From environment
              <select value={fromEnv} onChange={(e) => setFromEnv(e.target.value)}>
                <option value="">Select environment</option>
                {ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>{env}</option>
                ))}
              </select>
            </label>
            <span className="env-arrow">→</span>
            <label>
              To environment
              <select value={toEnv} onChange={(e) => setToEnv(e.target.value)}>
                <option value="">Select environment</option>
                {ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>{env}</option>
                ))}
              </select>
            </label>
          </div>
          {sameEnv && <div className="error">Source and destination environments must be different.</div>}

          <h2 style={{ marginTop: 26 }}>Entities to migrate</h2>
          <p className="login-sub" style={{ marginTop: -6 }}>Select one or more entities to fetch for review.</p>

          <div className="column-grid">
            {AVAILABLE_ENTITIES.map((ent) => {
              const isSelected = selectedEntities.includes(ent.id)
              return (
                <button
                  type="button"
                  key={ent.id}
                  className={`column-card ${isSelected ? 'selected' : ''}`}
                  style={{ position: 'relative' }}
                  onClick={() => toggleEntity(ent.id)}
                >
                  {isSelected && <span className="entity-check">✓</span>}
                  <span className="column-card-label">{ent.label}</span>
                  <small>{ent.description}</small>
                </button>
              )
            })}
          </div>

          <div className="actions">
            <button onClick={handleFetch} disabled={!canFetch}>
              {loading ? 'Fetching…' : 'Fetch selected data'}
            </button>
          </div>
        </div>
      )}

      {step === 1 && dataMap && (
        <>
          <div className="panel">
            <h2>Review fetched data</h2>
            <p className="login-sub" style={{ marginTop: -6 }}>{fromEnv} → {toEnv}</p>

            <div className="security-summary">
              <b>{totalRecords} records fetched across {selectedEntities.length} {selectedEntities.length === 1 ? 'entity' : 'entities'}</b>
              <span>{totalRecords - totalFlagged} ready</span>
              <span>{totalFlagged} needs review</span>
            </div>
          </div>

          {selectedEntities.map((id) => {
            const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
            const entityData = dataMap[id]
            return (
              <div className="panel" key={id}>
                <h2>{entity.label}</h2>
                <div className="security-summary">
                  <b>{entityData.total} {entity.label} records fetched</b>
                  <span>{entityData.total - entityData.flagged} ready</span>
                  <span>{entityData.flagged} needs review</span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {entity.columns.map((col) => <th key={col.key}>{col.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {entityData.records.slice(0, 8).map((r) => (
                        <tr key={r[entity.idKey]}>
                          {entity.columns.map((col) => (
                            <td key={col.key}>
                              {col.key === 'status'
                                ? <span className={`badge ${r.status === 'Ready' ? 'HIGH' : 'MEDIUM'}`}>{r.status}</span>
                                : r[col.key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {entityData.total > 8 && <p className="login-sub">Showing 8 of {entityData.total} records.</p>}
              </div>
            )
          })}

          <div className="actions">
            <button className="ghost" onClick={() => setStep(0)}>Back</button>
            <button onClick={handleMigrate} disabled={loading}>
              {loading ? 'Migrating…' : `Migrate ${totalRecords} records to IFS`}
            </button>
          </div>
        </>
      )}

      {step === 2 && migrated && (
        <div className="panel result-panel">
          <span className="badge HIGH" style={{ marginBottom: 10 }}>Completed</span>
          <h2>Migration complete</h2>
          <p>
            {migrated.totalRecords} records across {migrated.entities.length} {migrated.entities.length === 1 ? 'entity' : 'entities'} were
            migrated from {migrated.fromEnv} to {migrated.toEnv} at {new Date(migrated.completedAt).toLocaleString()}.
          </p>
          <div className="history-meta" style={{ marginBottom: 6 }}>
            {migrated.entities.map((e) => (
              <span key={e.id}>{e.label}: {e.total}</span>
            ))}
          </div>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => router.push('/')}>Back to dashboard</button>
            <button
              className="secondary"
              onClick={() => {
                setStep(0)
                setFromEnv('')
                setToEnv('')
                setSelectedEntities([])
                setDataMap(null)
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
