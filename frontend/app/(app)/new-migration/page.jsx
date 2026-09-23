'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { AVAILABLE_ENTITIES, ENVIRONMENTS, fetchEntitiesData, runMigration } from '../../../lib/migrationStore'
import MigrationStepper from '../../../components/MigrationStepper'

const STEPS = ['Configuration', 'Review Data', 'Migrate']

const ENTITY_ICONS = {
  customer: PersonOutlineOutlinedIcon,
  company: ApartmentOutlinedIcon,
  inventory: Inventory2OutlinedIcon,
  supplier: LocalShippingOutlinedIcon
}

export default function NewMigrationPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [fromEnv, setFromEnv] = useState('')
  const [toEnv, setToEnv] = useState('')
  const [selectedEntities, setSelectedEntities] = useState([])
  const [loading, setLoading] = useState(false)
  const [dataMap, setDataMap] = useState(null)
  const [selectedRecordIds, setSelectedRecordIds] = useState({})
  const [selectedSubItems, setSelectedSubItems] = useState({})
  const [expandedRecords, setExpandedRecords] = useState(new Set())
  const [activeEntityId, setActiveEntityId] = useState(null)
  const [migrated, setMigrated] = useState(null)

  const sameEnv = fromEnv && toEnv && fromEnv === toEnv
  const canFetch = fromEnv && toEnv && !sameEnv && selectedEntities.length > 0 && !loading

  function toggleEntity(id) {
    setSelectedEntities((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
  }

  async function handleFetch() {
    setLoading(true)
    const result = await fetchEntitiesData(selectedEntities)
    const initialSelection = {}
    const initialSubItems = {}
    selectedEntities.forEach((id) => {
      const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
      initialSelection[id] = new Set(result[id].records.map((r) => r[entity.idKey]))
      if (entity.subMenu) {
        initialSubItems[id] = {}
        result[id].records.forEach((r) => {
          initialSubItems[id][r[entity.idKey]] = new Set(entity.subMenu)
        })
      }
    })
    setDataMap(result)
    setSelectedRecordIds(initialSelection)
    setSelectedSubItems(initialSubItems)
    setExpandedRecords(new Set())
    setActiveEntityId(selectedEntities[0])
    setLoading(false)
    setStep(1)
  }

  function toggleRecord(entityId, recordId) {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev[entityId])
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return { ...prev, [entityId]: next }
    })
  }

  function toggleSelectAllForEntity(entityId) {
    const entity = AVAILABLE_ENTITIES.find((e) => e.id === entityId)
    const allIds = dataMap[entityId].records.map((r) => r[entity.idKey])
    const allSelected = selectedRecordIds[entityId]?.size === allIds.length
    setSelectedRecordIds((prev) => ({
      ...prev,
      [entityId]: allSelected ? new Set() : new Set(allIds)
    }))
  }

  function toggleExpand(entityId, recordId) {
    const key = `${entityId}:${recordId}`
    setExpandedRecords((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSubItem(entityId, recordId, item) {
    setSelectedSubItems((prev) => {
      const next = new Set(prev[entityId][recordId])
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return { ...prev, [entityId]: { ...prev[entityId], [recordId]: next } }
    })
  }

  async function handleMigrate() {
    setLoading(true)
    const breakdown = selectedEntities
      .map((id) => {
        const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
        return { id, label: entity.label, total: selectedRecordIds[id]?.size || 0 }
      })
      .filter((e) => e.total > 0)
    const entry = await runMigration(fromEnv, toEnv, breakdown)
    setMigrated(entry)
    setLoading(false)
    setStep(2)
  }

  const totalFetched = dataMap
    ? selectedEntities.reduce((sum, id) => sum + (dataMap[id]?.total || 0), 0)
    : 0
  const totalSelected = dataMap
    ? selectedEntities.reduce((sum, id) => sum + (selectedRecordIds[id]?.size || 0), 0)
    : 0

  const activeEntity = activeEntityId ? AVAILABLE_ENTITIES.find((e) => e.id === activeEntityId) : null
  const activeData = activeEntityId ? dataMap?.[activeEntityId] : null
  const activeSelectedIds = activeEntityId ? selectedRecordIds[activeEntityId] : null
  const activeAllSelected = activeData && activeSelectedIds ? activeSelectedIds.size === activeData.total : false

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

      {step === 1 && dataMap && activeEntity && (
        <>
          <div className="panel">
            <h2>Review fetched data</h2>
            <p className="login-sub" style={{ marginTop: -6 }}>{fromEnv} → {toEnv}</p>

            <div className="security-summary">
              <b>{totalSelected} of {totalFetched} records selected for migration across {selectedEntities.length} {selectedEntities.length === 1 ? 'entity' : 'entities'}</b>
            </div>
          </div>

          <div className="panel config-panel">
            <div className="config-layout">
              <div className="config-sidebar">
                {selectedEntities.map((id) => {
                  const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
                  const Icon = ENTITY_ICONS[id]
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`config-nav-item ${activeEntityId === id ? 'active' : ''}`}
                      onClick={() => setActiveEntityId(id)}
                    >
                      <Icon className="config-nav-icon" fontSize="small" />
                      <span className="config-nav-label">{entity.label}</span>
                      <span className="config-nav-count">{dataMap[id].total}</span>
                    </button>
                  )
                })}
              </div>

              <div className="config-content">
                <div className="config-content-header">
                  <div>
                    <h3>{activeEntity.label.toUpperCase()}</h3>
                    <p className="config-content-sub">
                      {activeSelectedIds?.size || 0} of {activeData.total} selected for migration
                    </p>
                  </div>
                  <button type="button" className="secondary" onClick={() => toggleSelectAllForEntity(activeEntityId)}>
                    {activeAllSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                <div className="record-list">
                  {activeData.records.map((r) => {
                    const recordId = r[activeEntity.idKey]
                    const isChecked = activeSelectedIds?.has(recordId) || false
                    const hasSubMenu = Boolean(activeEntity.subMenu)
                    const isExpanded = expandedRecords.has(`${activeEntityId}:${recordId}`)
                    const subItems = hasSubMenu ? selectedSubItems[activeEntityId]?.[recordId] : null

                    return (
                      <div className="record-group" key={recordId}>
                        <div className="record-row">
                          {hasSubMenu && (
                            <button
                              type="button"
                              className={`record-expand ${isExpanded ? 'open' : ''}`}
                              onClick={() => toggleExpand(activeEntityId, recordId)}
                              aria-label="Toggle submenu"
                            >
                              <ExpandMoreIcon fontSize="small" />
                            </button>
                          )}
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRecord(activeEntityId, recordId)}
                          />
                          <span className="record-info" onClick={() => toggleRecord(activeEntityId, recordId)}>
                            <strong>{r[activeEntity.rowPrimary]}</strong>
                            <small>{activeEntity.rowSecondary.map((key) => r[key]).join(' · ')}</small>
                          </span>
                        </div>

                        {hasSubMenu && isExpanded && (
                          <div className="record-submenu">
                            {activeEntity.subMenu.map((item) => (
                              <label className="submenu-row" key={item}>
                                <input
                                  type="checkbox"
                                  checked={subItems?.has(item) || false}
                                  onChange={() => toggleSubItem(activeEntityId, recordId, item)}
                                />
                                <span>{item}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="actions">
            <button className="ghost" onClick={() => setStep(0)}>Back</button>
            <button onClick={handleMigrate} disabled={loading || totalSelected === 0}>
              {loading ? 'Migrating…' : `Migrate ${totalSelected} records to IFS`}
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
                setSelectedRecordIds({})
                setSelectedSubItems({})
                setExpandedRecords(new Set())
                setActiveEntityId(null)
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
