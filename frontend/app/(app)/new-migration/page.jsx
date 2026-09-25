'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined'
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined'
import {
  AVAILABLE_ENTITIES,
  SOURCE_ENV,
  DEST_ENV,
  GRANT_TYPES,
  DEFAULT_ENV_CONFIG,
  fetchEntitiesData,
  runMigration,
  getEnvironmentConfigs,
  getEnvironmentConfig,
  saveEnvironmentConfig,
  testEnvironmentConnection,
  suggestAuthPath,
  getSessionToken,
  getHistory
} from '../../../lib/migrationStore'
import MigrationStepper from '../../../components/MigrationStepper'

const STEPS = ['Configuration', 'Select Entities', 'Review Data', 'Transfer']

const ENTITY_ICONS = {
  company: ApartmentOutlinedIcon,
  site: RoomOutlinedIcon,
  customer: PersonOutlineOutlinedIcon,
  masterPart: Inventory2OutlinedIcon,
  supplier: LocalShippingOutlinedIcon,
  inventoryLocations: WarehouseOutlinedIcon
}

const MANDATORY_ENTITIES = AVAILABLE_ENTITIES.filter((e) => e.group === 'mandatory')
const BASIC_ENTITIES = AVAILABLE_ENTITIES.filter((e) => e.group === 'basic')

export default function NewMigrationPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [fromEnv, setFromEnv] = useState('')
  const [toEnv, setToEnv] = useState('')
  const [envModalOpen, setEnvModalOpen] = useState(false)
  const [modalTarget, setModalTarget] = useState('from') // 'from' | 'to'
  const [envConfigs, setEnvConfigs] = useState({})
  const [modalEnv, setModalEnv] = useState('')
  const [authForm, setAuthForm] = useState(DEFAULT_ENV_CONFIG)
  const [testStatus, setTestStatus] = useState('idle') // idle | testing | success | error
  const [testMessage, setTestMessage] = useState('')
  const [sessionTokenInfo, setSessionTokenInfo] = useState(null)
  const [selectedEntities, setSelectedEntities] = useState([])
  const [loading, setLoading] = useState(false)
  const [dataMap, setDataMap] = useState({})
  const [selectedRecordIds, setSelectedRecordIds] = useState({})
  const [selectedSubItems, setSelectedSubItems] = useState({})
  const [expandedRecords, setExpandedRecords] = useState(new Set())
  const [activeEntityId, setActiveEntityId] = useState(null)
  const [migrated, setMigrated] = useState(null)
  const [transferredEntityIds, setTransferredEntityIds] = useState(new Set())

  const sameEnv = fromEnv && toEnv && fromEnv === toEnv
  const canProceedConfig = fromEnv && toEnv && !sameEnv

  // fromEnv/toEnv are display labels (the configured Base URL host); settings
  // themselves are stored under the fixed SOURCE_ENV / DEST_ENV keys.
  function envLabel(baseUrl, fallback) {
    try {
      return new URL(baseUrl).host
    } catch {
      return baseUrl?.trim() || fallback
    }
  }

  function envButtonStatus(env, role) {
    const config = env ? envConfigs[role] : null
    if (!env) return 'base'
    if (sameEnv) return 'error'
    if (config?.status === 'authorized') return 'success'
    if (config?.status === 'error') return 'error'
    return 'base'
  }

  const fromEnvStatus = envButtonStatus(fromEnv, SOURCE_ENV)
  const toEnvStatus = envButtonStatus(toEnv, DEST_ENV)
  const modalOtherEnv = modalTarget === 'from' ? toEnv : fromEnv
  const modalLabel = envLabel(authForm.baseUrl, modalEnv)
  const modalOtherLabel = modalTarget === 'from' ? 'destination' : 'source'

  // Scoped to the current from→to pair: an entity already sitting in a
  // different destination doesn't mean it exists in *this* one.
  function refreshTransferredEntities() {
    const ids = new Set()
    getHistory()
      .filter((entry) => entry.fromEnv === fromEnv && entry.toEnv === toEnv)
      .forEach((entry) => entry.entities.forEach((e) => ids.add(e.id)))
    setTransferredEntityIds(ids)
  }

  useEffect(() => {
    setEnvConfigs(getEnvironmentConfigs())
  }, [])

  useEffect(() => {
    refreshTransferredEntities()
  }, [fromEnv, toEnv])

  function toggleEntity(id) {
    setSelectedEntities((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
  }

  function loadEnvIntoForm(env) {
    const config = getEnvironmentConfig(env)
    setModalEnv(env)
    setAuthForm(config)
    setTestStatus(config.status === 'authorized' ? 'success' : config.status === 'error' ? 'error' : 'idle')
    setTestMessage(config.status === 'error' ? config.lastError || '' : '')
    setSessionTokenInfo(getSessionToken(env))
  }

  function openEnvModal(target) {
    setModalTarget(target)
    loadEnvIntoForm(target === 'from' ? SOURCE_ENV : DEST_ENV)
    setEnvModalOpen(true)
  }

  function updateAuthField(field, value) {
    setAuthForm((prev) => {
      const next = { ...prev, [field]: value }
      // The authorization path follows the Base URL until the user edits it
      // themselves (a hand-typed path is never overwritten).
      if (field === 'baseUrl' && (!prev.authPath || prev.authPath === suggestAuthPath(prev.baseUrl))) {
        next.authPath = suggestAuthPath(value)
      }
      return next
    })
    setTestStatus('idle')
    setTestMessage('')
  }

  async function handleTestConnection() {
    setTestStatus('testing')
    const result = await testEnvironmentConnection(modalEnv, authForm)
    if (result.success) {
      setTestStatus('success')
      setTestMessage(result.tokenPreview)
      setSessionTokenInfo(getSessionToken(modalEnv))
    } else {
      setTestStatus('error')
      setTestMessage(result.error)
      setSessionTokenInfo(null)
    }
  }

  function handleSaveEnvConfig() {
    const status = testStatus === 'success' ? 'authorized' : testStatus === 'error' ? 'error' : 'unconfigured'
    const saved = saveEnvironmentConfig(modalEnv, {
      ...authForm,
      status,
      lastError: testStatus === 'error' ? testMessage : null,
      lastTestedAt: testStatus === 'success' || testStatus === 'error' ? new Date().toISOString() : null
    })
    setEnvConfigs((prev) => ({ ...prev, [modalEnv]: saved }))
    const label = envLabel(saved.baseUrl, modalEnv)
    if (modalTarget === 'from') setFromEnv(label)
    else setToEnv(label)
    if (label !== modalOtherEnv) setEnvModalOpen(false)
  }

  async function fetchGroup(entityIds) {
    if (entityIds.length === 0) return
    setLoading(true)
    const result = await fetchEntitiesData(entityIds)
    const initialSelection = {}
    const initialSubItems = {}
    entityIds.forEach((id) => {
      const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
      initialSelection[id] = new Set(result[id].records.map((r) => r[entity.idKey]))
      if (entity.subMenu) {
        initialSubItems[id] = {}
        result[id].records.forEach((r) => {
          initialSubItems[id][r[entity.idKey]] = new Set(entity.subMenu)
        })
      }
    })
    setDataMap((prev) => ({ ...prev, ...result }))
    setSelectedRecordIds((prev) => ({ ...prev, ...initialSelection }))
    setSelectedSubItems((prev) => ({ ...prev, ...initialSubItems }))
    setExpandedRecords(new Set())
    setActiveEntityId(entityIds[0])
    setLoading(false)
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

  async function handleTransfer() {
    setLoading(true)
    const breakdown = selectedEntities
      .map((id) => {
        const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
        return { id, label: entity.label, total: selectedRecordIds[id]?.size || 0 }
      })
      .filter((e) => e.total > 0)
    const entry = await runMigration(fromEnv, toEnv, breakdown)
    setMigrated(entry)
    refreshTransferredEntities()
    setLoading(false)
    setStep(3)
  }

  const totalFetched = selectedEntities.reduce((sum, id) => sum + (dataMap[id]?.total || 0), 0)
  const totalSelected = selectedEntities.reduce((sum, id) => sum + (selectedRecordIds[id]?.size || 0), 0)

  function resetAll() {
    setStep(0)
    setFromEnv('')
    setToEnv('')
    setSelectedEntities([])
    setDataMap({})
    setSelectedRecordIds({})
    setSelectedSubItems({})
    setExpandedRecords(new Set())
    setActiveEntityId(null)
    setMigrated(null)
  }

  function renderEntityReview(groupEntities) {
    const groupIds = groupEntities.map((e) => e.id)
    const selectedInGroup = selectedEntities.filter((id) => groupIds.includes(id))
    const fetchedIds = selectedInGroup.filter((id) => dataMap[id])
    const displayEntityId = fetchedIds.includes(activeEntityId) ? activeEntityId : fetchedIds[0]
    const displayEntity = displayEntityId ? AVAILABLE_ENTITIES.find((e) => e.id === displayEntityId) : null
    const displayData = displayEntityId ? dataMap[displayEntityId] : null
    const displaySelectedIds = displayEntityId ? selectedRecordIds[displayEntityId] : null
    const displayAllSelected = displayData && displaySelectedIds ? displaySelectedIds.size === displayData.total : false

    if (fetchedIds.length === 0 || !displayEntity) return null

    return (
      <>
        <div className="panel config-panel">
          <div className="config-layout">
            <div className="config-sidebar">
              {fetchedIds.map((id) => {
                const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
                const Icon = ENTITY_ICONS[id]
                return (
                  <button
                    type="button"
                    key={id}
                    className={`config-nav-item ${displayEntityId === id ? 'active' : ''}`}
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
                  <h3>{displayEntity.label.toUpperCase()}</h3>
                  <p className="config-content-sub">
                    {displaySelectedIds?.size || 0} of {displayData.total} selected for transfer
                  </p>
                </div>
                <button type="button" className="secondary" onClick={() => toggleSelectAllForEntity(displayEntityId)}>
                  {displayAllSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="record-list">
                {displayData.records.map((r) => {
                  const recordId = r[displayEntity.idKey]
                  const isChecked = displaySelectedIds?.has(recordId) || false
                  const hasSubMenu = Boolean(displayEntity.subMenu)
                  const isExpanded = expandedRecords.has(`${displayEntityId}:${recordId}`)
                  const subItems = hasSubMenu ? selectedSubItems[displayEntityId]?.[recordId] : null

                  return (
                    <div className="record-group" key={recordId}>
                      <div className="record-row">
                        {hasSubMenu && (
                          <button
                            type="button"
                            className={`record-expand ${isExpanded ? 'open' : ''}`}
                            onClick={() => toggleExpand(displayEntityId, recordId)}
                            aria-label="Toggle submenu"
                          >
                            <ExpandMoreIcon fontSize="small" />
                          </button>
                        )}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRecord(displayEntityId, recordId)}
                        />
                        <span className="record-info" onClick={() => toggleRecord(displayEntityId, recordId)}>
                          <strong>{r[displayEntity.rowPrimary]}</strong>
                          <small>{displayEntity.rowSecondary.map((key) => r[key]).join(' · ')}</small>
                        </span>
                      </div>

                      {hasSubMenu && isExpanded && (
                        <div className="record-submenu">
                          {displayEntity.subMenu.map((item) => (
                            <label className="submenu-row" key={item}>
                              <input
                                type="checkbox"
                                checked={subItems?.has(item) || false}
                                onChange={() => toggleSubItem(displayEntityId, recordId, item)}
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
      </>
    )
  }

  function getUnmetDependencies(ent, selectedInGroup) {
    return (ent.dependsOn || []).filter((depId) => !selectedInGroup.includes(depId))
  }

  // Hardcoded via each entity's dependsOn for now — flattens the group's entities
  // plus their prerequisites into a single ordered transfer sequence. Real
  // cross-entity validation will replace this later.
  function computeTransferOrder(groupEntities) {
    const ordered = []
    const visited = new Set()
    function visit(entity) {
      if (!entity || visited.has(entity.id)) return
      visited.add(entity.id)
      ;(entity.dependsOn || []).forEach((depId) => visit(AVAILABLE_ENTITIES.find((e) => e.id === depId)))
      ordered.push(entity)
    }
    groupEntities.forEach(visit)
    return ordered
  }

  async function handleFetchAndProceed() {
    await fetchGroup(selectedEntities)
    setStep(2)
  }

  function renderEntityCard(ent) {
    const isSelected = selectedEntities.includes(ent.id)
    const isTransferred = transferredEntityIds.has(ent.id)
    return (
      <button
        type="button"
        key={ent.id}
        className={`column-card ${isSelected ? 'selected' : ''} ${isTransferred ? 'transferred' : ''}`}
        style={{ position: 'relative' }}
        onClick={() => toggleEntity(ent.id)}
      >
        {isSelected && <span className="entity-check">✓</span>}
        <span className="column-card-label">{ent.label}</span>
        <small>{ent.description}</small>
      </button>
    )
  }

  function renderSelectEntitiesStep() {
    const dependencyIssues = AVAILABLE_ENTITIES
      .filter((ent) => selectedEntities.includes(ent.id))
      .map((ent) => ({ ent, missing: getUnmetDependencies(ent, selectedEntities) }))
      .filter((issue) => issue.missing.length > 0)
    const canProceed = selectedEntities.length > 0 && dependencyIssues.length === 0 && !loading

    return (
      <>
        <div className="panel">
          <h2>Select entities</h2>
          <p className="login-sub" style={{ marginTop: -6 }}>Choose the entities to transfer. Company and Site are required before other entities can be transferred.</p>

          <div className="group-layout">
            <div className="group-main">
              <h3 className="entity-group-heading">Mandatory</h3>
              <div className="column-grid">
                {MANDATORY_ENTITIES.map(renderEntityCard)}
              </div>

              <h3 className="entity-group-heading" style={{ marginTop: 22 }}>Basic</h3>
              <div className="column-grid">
                {BASIC_ENTITIES.map(renderEntityCard)}
              </div>

              {dependencyIssues.length > 0 && (
                <div className="error" style={{ marginTop: 14 }}>
                  {dependencyIssues.map(({ ent, missing }) => (
                    <div key={ent.id}>
                      {ent.label} requires {missing.map((id) => AVAILABLE_ENTITIES.find((e) => e.id === id).label).join(', ')} to be selected.
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dependency-panel">
              <h4>Transfer order</h4>
              {selectedEntities.length === 0 ? (
                <p className="field-hint">Select entities to see the transfer order.</p>
              ) : (
                <div className="dependency-steps">
                  {computeTransferOrder(AVAILABLE_ENTITIES.filter((e) => selectedEntities.includes(e.id))).map((ent, i) => {
                    const isSelected = selectedEntities.includes(ent.id)
                    return (
                      <div className={`dependency-step ${isSelected ? 'selected' : ''}`} key={ent.id}>
                        <span className="dependency-step-index">{i + 1}</span>
                        <span className="dependency-step-label">{ent.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="ghost" onClick={() => setStep(0)}>Back</button>
          <button onClick={handleFetchAndProceed} disabled={!canProceed}>
            {loading ? 'Fetching…' : 'Fetch Data'}
          </button>
        </div>
      </>
    )
  }

  function renderReviewDataStep() {
    return (
      <>
        <div className="panel">
          <h2>Review fetched data</h2>
          <p className="login-sub" style={{ marginTop: -6 }}>{fromEnv} → {toEnv}</p>

          <div className="security-summary">
            <b>{totalSelected} of {totalFetched} records selected for transfer across {selectedEntities.length} {selectedEntities.length === 1 ? 'entity' : 'entities'}</b>
          </div>
        </div>

        {renderEntityReview(AVAILABLE_ENTITIES)}

        <div className="actions">
          <button className="ghost" onClick={() => setStep(1)}>Back</button>
          <button onClick={handleTransfer} disabled={loading || totalSelected === 0}>
            {loading ? 'Transferring…' : `Transfer ${totalSelected} records to IFS`}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">NEW MIGRATION</span>
          <h1>Migrate data to IFS</h1>
          <p>Configure the environments, select entities to transfer, review the data, then confirm the transfer.</p>
        </div>
      </header>

      <MigrationStepper steps={STEPS} activeStep={step} />

      {step === 0 && (
        <div className="panel">
          <h2>Configure Migration</h2>
          <p className="login-sub" style={{ marginTop: -6 }}>Select the source and destination environments.</p>

          <div className="env-row">
            <label>
              Source Environment
              <button
                type="button"
                className={`env-select-btn env-status-${fromEnvStatus}`}
                onClick={() => openEnvModal('from')}
              >
                {fromEnvStatus === 'success' && <CheckCircleOutlineIcon fontSize="small" />}
                {fromEnvStatus === 'error' && <ErrorOutlineIcon fontSize="small" />}
                <span>{fromEnv || 'Select environment'}</span>
              </button>
            </label>
            <span className="env-arrow">→</span>
            <label>
              Destination Environment
              <button
                type="button"
                className={`env-select-btn env-status-${toEnvStatus}`}
                onClick={() => openEnvModal('to')}
              >
                {toEnvStatus === 'success' && <CheckCircleOutlineIcon fontSize="small" />}
                {toEnvStatus === 'error' && <ErrorOutlineIcon fontSize="small" />}
                <span>{toEnv || 'Select environment'}</span>
              </button>
            </label>
          </div>
          {sameEnv && <div className="error">Source and destination environments must be different.</div>}

          <Dialog open={envModalOpen} onClose={() => setEnvModalOpen(false)} fullWidth maxWidth="sm">
            <DialogTitle>Configure {modalTarget === 'from' ? 'source' : 'destination'} environment (IFS API)</DialogTitle>
            <DialogContent>
              <p className="login-sub" style={{ marginTop: -4 }}>
                These settings define how the tool authorizes against the IFS Cloud REST API for this
                environment before issuing GET requests to fetch entities.
              </p>

              {modalOtherEnv && modalLabel === modalOtherEnv && (
                <div className="error" style={{ marginTop: 10 }}>
                  {modalLabel} is already configured as the {modalOtherLabel} environment.
                </div>
              )}

              <div className="env-form">
                <label>
                  Base URL
                  <input
                    type="text"
                    placeholder="https://ifscloud.yourorganization.com"
                    value={authForm.baseUrl}
                    onChange={(e) => updateAuthField('baseUrl', e.target.value)}
                  />
                </label>

                <label>
                  Authorization path
                  <input
                    type="text"
                    placeholder="{Base URL}/auth/realms/{YourNamespace}/protocol/openid-connect/token"
                    value={authForm.authPath}
                    onChange={(e) => updateAuthField('authPath', e.target.value)}
                  />
                  <small className="field-hint">
                    {'Filled in from the Base URL — replace {YourNamespace} with your own namespace, which you can find in Solution Manager > Setup > System Parameters > parameter "Namespace".'}
                  </small>
                </label>

                <label>
                  Grant type
                  <select value={authForm.grantType} onChange={(e) => updateAuthField('grantType', e.target.value)}>
                    {GRANT_TYPES.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </label>

                <div className="env-form-pair">
                  <label>
                    Client ID
                    <input
                      type="text"
                      placeholder="sebsa-migration-tool"
                      value={authForm.clientId}
                      onChange={(e) => updateAuthField('clientId', e.target.value)}
                    />
                  </label>
                  <label>
                    Client secret
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={authForm.clientSecret}
                      onChange={(e) => updateAuthField('clientSecret', e.target.value)}
                    />
                  </label>
                </div>

                {authForm.grantType === 'password' && (
                  <div className="env-form-pair">
                    <label>
                      Username
                      <input
                        type="text"
                        value={authForm.username}
                        onChange={(e) => updateAuthField('username', e.target.value)}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={authForm.password}
                        onChange={(e) => updateAuthField('password', e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </div>

              {testStatus === 'success' && (
                <div className="auth-banner success">
                  <CheckCircleOutlineIcon fontSize="small" />
                  <span>Authorized successfully. {testMessage}</span>
                </div>
              )}
              {testStatus === 'error' && (
                <div className="auth-banner error">
                  <ErrorOutlineIcon fontSize="small" />
                  <span>{testMessage}</span>
                </div>
              )}
              {sessionTokenInfo && (
                <p className="field-hint" style={{ marginTop: 10 }}>
                  Session token cached for {modalEnv} — expires {new Date(sessionTokenInfo.expiresAt).toLocaleTimeString()}.
                  It will be reused (no re-authorization) until then.
                </p>
              )}
            </DialogContent>
            <DialogActions>
              <button type="button" className="ghost" onClick={() => setEnvModalOpen(false)}>Cancel</button>
              <button type="button" className="secondary" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
                {testStatus === 'testing' ? 'Authorizing…' : 'Test connection'}
              </button>
              <button type="button" onClick={handleSaveEnvConfig}>
                Save &amp; use environment
              </button>
            </DialogActions>
          </Dialog>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => router.push(`/new-migration/sales-part-set?env=${encodeURIComponent(SOURCE_ENV)}`)}
              disabled={!fromEnv}
            >
              <CloudDownloadOutlinedIcon fontSize="small" />
              Get live data (SalesPartSet)
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => router.push(`/new-migration/part-catalog-set?env=${encodeURIComponent(SOURCE_ENV)}`)}
              disabled={!fromEnv}
            >
              <CloudDownloadOutlinedIcon fontSize="small" />
              Get live data (PartCatalogSet)
            </button>
            <button onClick={() => setStep(1)} disabled={!canProceedConfig}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 1 && renderSelectEntitiesStep()}

      {step === 2 && renderReviewDataStep()}

      {step === 3 && migrated && (
        <div className="panel result-panel">
          <span className="badge HIGH" style={{ marginBottom: 10 }}>Completed</span>
          <h2>Transfer complete</h2>
          <p>
            {migrated.totalRecords} records across {migrated.entities.length} {migrated.entities.length === 1 ? 'entity' : 'entities'} were
            transferred from {migrated.fromEnv} to {migrated.toEnv} at {new Date(migrated.completedAt).toLocaleString()}.
          </p>
          <div className="history-meta" style={{ marginBottom: 6 }}>
            {migrated.entities.map((e) => (
              <span key={e.id}>{e.label}: {e.total}</span>
            ))}
          </div>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => router.push('/')}>Back to dashboard</button>
            <button className="secondary" onClick={resetAll}>
              Start another transfer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
