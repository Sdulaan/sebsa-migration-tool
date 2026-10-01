'use client'

import { useEffect, useRef, useState } from 'react'
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
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import SellOutlinedIcon from '@mui/icons-material/SellOutlined'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined'
import {
  SOURCE_ENV,
  DEST_ENV,
  GRANT_TYPES,
  DEFAULT_ENV_CONFIG,
  fetchEntityRecords,
  saveHistoryEntry,
  getEnvironmentConfigs,
  getEnvironmentConfig,
  saveEnvironmentConfig,
  testEnvironmentConnection,
  suggestAuthPath,
  getSessionToken,
  getHistory
} from '../../../lib/migrationStore'
import { AVAILABLE_ENTITIES, orderEntitiesForTransfer, recordKey } from '../../../lib/entityRegistry'
import { reviewSubTabList, buildReviewSubTabs } from '../../../lib/reviewDetailMock'
import { fetchCompanyReviewSubTabs, COMPANY_REVIEW_TABS } from '../../../lib/companyReviewData'
import { TX_STATUS_LABELS, createTransactionLog, summarizeLog } from '../../../lib/transactionLog'
import { runTransfer } from '../../../lib/transferRunner'
import { fetchSupplierTree, supplierTreeTabs } from '../../../lib/supplierTransfer'
import { SUPPLIER_STAGES } from '../../../lib/supplierApi'
import { downloadTransactionLog } from '../../../lib/transactionLogExcel'
import MigrationStepper from '../../../components/MigrationStepper'

const STEPS = ['Configuration', 'Select Entities', 'Review Data', 'Transfer']

const ENTITY_ICONS = {
  company: ApartmentOutlinedIcon,
  site: RoomOutlinedIcon,
  customer: PersonOutlineOutlinedIcon,
  masterPart: Inventory2OutlinedIcon,
  inventoryPart: CategoryOutlinedIcon,
  salesPart: SellOutlinedIcon,
  supplier: LocalShippingOutlinedIcon,
  inventoryLocations: WarehouseOutlinedIcon
}

const STATUS_COLUMNS = ['SUCCESS', 'ALREADY_EXISTS', 'FAILED', 'SKIPPED', 'UNCONFIRMED']

// Review-list title for a fetched record: its title field, else its key.
function recordTitle(entity, record) {
  const title = record[entity.titleField]
  return title === null || title === undefined || title === '' ? recordKey(entity, record) : String(title)
}

const MANDATORY_ENTITIES = AVAILABLE_ENTITIES.filter((e) => e.group === 'mandatory')
const BASIC_ENTITIES = AVAILABLE_ENTITIES.filter((e) => e.group === 'basic')

// One mock form control for the detail column. Uncontrolled (defaultValue /
// defaultChecked): the form is remounted via `key` when the selection changes,
// so each field shows its new value without per-field state wiring.
function ReviewFormField({ field, readOnly = false }) {
  return (
    <div className="erp-field">
      <label>{field.label}</label>
      {field.type === 'select' ? (
        <select defaultValue={field.value}>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : field.type === 'date' ? (
        <input type="date" defaultValue={field.value} />
      ) : field.type === 'toggle' ? (
        <label className="erp-toggle">
          <input type="checkbox" defaultChecked={Boolean(field.value)} />
          <span className="erp-toggle-track"><span className="erp-toggle-thumb" /></span>
        </label>
      ) : (
        <input type="text" defaultValue={field.value == null ? '' : String(field.value)} readOnly={readOnly} />
      )}
    </div>
  )
}

// Columns 2 (record accordion) and 3 (detail form) of the Review step. Keyed
// by entity id in the parent, so switching category resets the selection back
// to the empty state. Sub-tabs are vertical items inside an explicitly
// expanded record; checking a record selects its detail without opening them.
function ReviewAccordion({ entity, records, selectedIds, allSelected, onToggleRecord, onToggleSelectAll }) {
  const [expandedRecordId, setExpandedRecordId] = useState(null)
  const [selectedRecordId, setSelectedRecordId] = useState(null)
  const [selectedSubTabId, setSelectedSubTabId] = useState(null)
  // Company only: its sub-tabs are real GET data (see companyReviewData.js),
  // fetched for the whole record when it's selected — everything else still
  // uses the instant mock from reviewDetailMock.js.
  const [liveSubTabs, setLiveSubTabs] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState(null)

  const isLiveEntity = entity.id === 'company' || entity.id === 'supplier'
  // Company's tab list is fixed to match the real IFS Aurena page (see
  // companyReviewData.js) — not the Excel-generated 24-tab schema
  // reviewSubTabList() would otherwise show.
  const subTabList = entity.id === 'company' ? COMPANY_REVIEW_TABS : entity.id === 'supplier'
    ? SUPPLIER_STAGES.map(({ id, label }) => ({ tabId: id, tabName: label })) : reviewSubTabList(entity)
  const selectedRecord = selectedRecordId != null ? records[selectedRecordId] : null

  useEffect(() => {
    if (!isLiveEntity || !selectedRecord) {
      setLiveSubTabs(null)
      setLiveError(null)
      return
    }
    let cancelled = false
    setLiveLoading(true)
    setLiveError(null)
    const request = entity.id === 'supplier'
      ? fetchSupplierTree(selectedRecord, getEnvironmentConfig(SOURCE_ENV)).then((tree) => ({ success: true, subTabs: supplierTreeTabs(tree) }))
      : fetchCompanyReviewSubTabs(selectedRecord)
    request.then((result) => {
      if (cancelled) return
      setLiveLoading(false)
      if (result.success) setLiveSubTabs(result.subTabs)
      else setLiveError(result.error)
    }).catch((err) => {
      if (cancelled) return
      setLiveLoading(false)
      setLiveError(err.message)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveEntity, selectedRecordId])

  const subTabs = isLiveEntity ? liveSubTabs || [] : selectedRecord ? buildReviewSubTabs(entity, selectedRecord) : []
  const selectedSubTab = subTabs.find((t) => t.tabId === selectedSubTabId) || null
  const hasSelection = Boolean(selectedRecord && (selectedSubTab || (isLiveEntity && (liveLoading || liveError))))

  function toggleExpand(index) {
    setExpandedRecordId((prev) => (prev === index ? null : index))
  }

  function selectSubTab(recordIndex, subTabId) {
    setSelectedRecordId(recordIndex)
    setSelectedSubTabId(subTabId)
  }

  // Ticking a checkbox selects the detail view without expanding the row.
  // The record button remains the explicit accordion toggle.
  function handleCheckboxChange(index) {
    const wasChecked = selectedIds?.has(index) || false
    onToggleRecord(index)
    setExpandedRecordId(null)
    if (!wasChecked) {
      setSelectedRecordId(index)
      setSelectedSubTabId(subTabList[0]?.tabId ?? null)
    } else if (selectedRecordId === index) {
      setSelectedRecordId(null)
      setSelectedSubTabId(null)
    }
  }

  return (
    <>
      {/* Column 2 — record accordion */}
      <div className="erp-records">
        <div className="erp-records-head">
          <span className="erp-records-title">{entity.label} Records</span>
          <button type="button" className="secondary" onClick={onToggleSelectAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="erp-records-scroll">
          {records.map((record, index) => {
            const isExpanded = expandedRecordId === index
            const isChecked = selectedIds?.has(index) || false
            return (
              <div className="erp-record" key={index}>
                <div className={`erp-record-row ${isExpanded ? 'expanded' : ''}`}>
                  <input
                    type="checkbox"
                    className="erp-record-check"
                    checked={isChecked}
                    onChange={() => handleCheckboxChange(index)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Select for transfer"
                  />
                  <button
                    type="button"
                    className="erp-record-toggle"
                    onClick={() => toggleExpand(index)}
                    aria-expanded={isExpanded}
                  >
                    <span className="erp-record-info">
                      <strong>{recordTitle(entity, record)}</strong>
                      <small>{entity.keyFields.map((key) => `${key}: ${record[key] ?? '—'}`).join(' · ')}</small>
                    </span>
                    <ExpandMoreIcon className={`erp-record-chevron ${isExpanded ? 'open' : ''}`} fontSize="small" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="erp-subtabs">
                    {subTabList.map((tab) => {
                      const isActive = selectedRecordId === index && selectedSubTabId === tab.tabId
                      return (
                        <button
                          type="button"
                          key={tab.tabId}
                          className={`erp-subtab ${isActive ? 'active' : ''}`}
                          onClick={() => selectSubTab(index, tab.tabId)}
                        >
                          {tab.tabName}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Column 3 — detail form / empty state */}
      <div className="erp-detail">
        {!hasSelection ? (
          <div className="erp-empty">
            <ViewSidebarOutlinedIcon className="erp-empty-icon" />
            <h3>Nothing Selected</h3>
            <p>Please select a record and a sub-tab from the middle panel to view details.</p>
          </div>
        ) : (
          <>
            <div className="erp-detail-header">
              <div>
                <div className="erp-breadcrumb">
                  {entity.label} · {recordTitle(entity, selectedRecord)}
                  {selectedSubTab ? ` · ${selectedSubTab.tabName}` : ''}
                </div>
                <h2 className="erp-detail-title">{recordTitle(entity, selectedRecord)}</h2>
                <p className="erp-detail-sub">{recordKey(entity, selectedRecord) || '—'}</p>
              </div>
            </div>

            {isLiveEntity && liveLoading && <p className="field-hint">Fetching live data from IFS…</p>}

            {isLiveEntity && !liveLoading && liveError && (
              <div className="auth-banner error">
                <ErrorOutlineIcon fontSize="small" />
                <span>{liveError}</span>
              </div>
            )}

            {selectedSubTab && (
              <div className="erp-form" key={`${selectedRecordId}:${selectedSubTab.tabId}`}>
                {selectedSubTab.sections.map((section, i) => (
                  <section className="erp-card" key={`${section.title}-${i}`}>
                    <h4>{section.title}</h4>
                    <div className="erp-grid">
                      {section.fields.map((field) => (
                        <ReviewFormField key={field.id} field={field} readOnly={isLiveEntity} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

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
  const [fetchErrors, setFetchErrors] = useState({})
  const [transferLog, setTransferLog] = useState(null)
  const [transferProgress, setTransferProgress] = useState(null)
  const [transferError, setTransferError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false)
  const cancelRequested = useRef(false)
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
    // Records are identified in the review list by their index in the fetched
    // list — source keys aren't guaranteed unique or even present.
    const sourceConfig = getEnvironmentConfig(SOURCE_ENV)
    const fetched = await Promise.all(entityIds.map((id) => fetchEntityRecords(id, SOURCE_ENV, sourceConfig)))
    const result = {}
    const errors = {}
    const initialSelection = {}
    const initialSubItems = {}
    entityIds.forEach((id, i) => {
      const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
      if (!fetched[i].success) {
        errors[id] = fetched[i].error
        return
      }
      const records = fetched[i].records
      result[id] = { records, total: records.length }
      // Records start UNCHECKED — the user ticks the ones to transfer.
      initialSelection[id] = new Set()
      if (entity.subMenu) {
        initialSubItems[id] = {}
        records.forEach((_, index) => {
          initialSubItems[id][index] = new Set(entity.subMenu)
        })
      }
    })
    setFetchErrors(errors)
    setDataMap((prev) => ({ ...prev, ...result }))
    setSelectedRecordIds((prev) => ({ ...prev, ...initialSelection }))
    setSelectedSubItems((prev) => ({ ...prev, ...initialSubItems }))
    setExpandedRecords(new Set())
    setActiveEntityId(entityIds.find((id) => result[id]) || null)
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
    const allIds = dataMap[entityId].records.map((_, index) => index)
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

  // Sends the selected records to the destination parents-first, logging
  // every record's outcome; children of a parent that didn't make it are
  // skipped (see lib/transferRunner.js).
  async function handleTransfer() {
    const sourceConfig = getEnvironmentConfig(SOURCE_ENV)
    const destConfig = getEnvironmentConfig(DEST_ENV)
    const recordsByEntity = {}
    selectedEntities.forEach((id) => {
      const records = dataMap[id]?.records || []
      recordsByEntity[id] = [...(selectedRecordIds[id] || [])].sort((a, b) => a - b).map((index) => records[index])
    })
    const entities = orderEntitiesForTransfer(selectedEntities).filter((e) => recordsByEntity[e.id]?.length > 0)
    const log = createTransactionLog({
      fromEnv,
      toEnv,
      sourceBaseUrl: sourceConfig.baseUrl,
      destBaseUrl: destConfig.baseUrl,
      entities
    })

    cancelRequested.current = false
    setLoading(true)
    setTransferLog(null)
    setTransferError('')
    setHistoryError('')
    setDownloadError('')
    setTransferProgress({ summary: summarizeLog(log), entityId: entities[0]?.id, sent: 0, toSend: 0 })
    setStep(3)

    try {
      await runTransfer({
        log,
        entityIds: entities.map((e) => e.id),
        recordsByEntity,
        destEnv: DEST_ENV,
        destConfig,
        sourceConfig,
        shouldCancel: () => cancelRequested.current,
        onProgress: (progress) => setTransferProgress({ ...progress, summary: summarizeLog(log) })
      })

      const { entities: counts, totals } = summarizeLog(log)
      try {
        saveHistoryEntry({
          id: Number(log.runId),
          fromEnv,
          toEnv,
          // An entity counts as transferred (for the "transferred" marker and the
          // dashboard) by the records that are now in the destination.
          entities: counts
            .map((c) => ({ id: c.id, label: c.label, total: c.SUCCESS + c.ALREADY_EXISTS }))
            .filter((c) => c.total > 0),
          totalRecords: totals.SUCCESS,
          counts: totals,
          completedAt: log.finishedAt,
          status: totals.total === totals.SUCCESS + totals.ALREADY_EXISTS ? 'Completed' : 'Completed with errors'
        })
        refreshTransferredEntities()
      } catch (err) {
        setHistoryError(`Transfer finished, but the history summary could not be saved: ${err.message}. Download the transaction log for the full results.`)
      }
    } catch (err) {
      log.finishedAt = new Date().toISOString()
      setTransferError(`Transfer stopped unexpectedly: ${err.message}. Check the destination before retrying any unconfirmed records.`)
    } finally {
      setTransferLog(log)
      setTransferProgress(null)
      setLoading(false)
    }
  }

  async function handleDownloadLog() {
    setDownloading(true)
    setDownloadError('')
    try {
      await downloadTransactionLog(transferLog)
    } catch (err) {
      setDownloadError(`Could not build the Excel file: ${err.message}`)
    }
    setDownloading(false)
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
    setFetchErrors({})
    setTransferLog(null)
    setTransferProgress(null)
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
      <div className="erp-layout">
        {/* Column 1 — category sidebar (fetched entities) */}
        <aside className="erp-categories">
          {fetchedIds.map((id) => {
            const entity = AVAILABLE_ENTITIES.find((e) => e.id === id)
            const Icon = ENTITY_ICONS[id]
            return (
              <button
                type="button"
                key={id}
                className={`erp-cat-item ${displayEntityId === id ? 'active' : ''}`}
                onClick={() => setActiveEntityId(id)}
              >
                {Icon && <Icon className="erp-cat-icon" fontSize="small" />}
                <span className="erp-cat-label">{entity.label}</span>
                <span className="erp-cat-count">{dataMap[id].total}</span>
              </button>
            )
          })}
        </aside>

        {/* Columns 2 & 3 — record accordion + detail form */}
        <ReviewAccordion
          key={displayEntityId}
          entity={displayEntity}
          records={displayData.records}
          selectedIds={displaySelectedIds}
          allSelected={displayAllSelected}
          onToggleRecord={(index) => toggleRecord(displayEntityId, index)}
          onToggleSelectAll={() => toggleSelectAllForEntity(displayEntityId)}
        />
      </div>
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
        <div className="review-screen">
          <div className="panel review-screen-head">
            <h2>Review fetched data</h2>
            <p className="login-sub" style={{ marginTop: -6 }}>{fromEnv} → {toEnv}</p>

            <div className="security-summary">
              <b>{totalSelected} of {totalFetched} records selected for transfer across {selectedEntities.length} {selectedEntities.length === 1 ? 'entity' : 'entities'}</b>
            </div>

            {Object.entries(fetchErrors).map(([id, error]) => (
              <div className="auth-banner error" key={id}>
                <ErrorOutlineIcon fontSize="small" />
                <span>{AVAILABLE_ENTITIES.find((e) => e.id === id).label}: {error}</span>
              </div>
            ))}
          </div>

          <div className="review-screen-body">
            {renderEntityReview(AVAILABLE_ENTITIES)}
          </div>

          <div className="actions review-screen-footer">
            <button className="ghost" onClick={() => setStep(1)}>Back</button>
            <button onClick={() => setConfirmTransferOpen(true)} disabled={loading || totalSelected === 0}>
              {loading ? 'Transferring…' : `Transfer ${totalSelected} records to IFS`}
            </button>
          </div>
        </div>

        <Dialog open={confirmTransferOpen} onClose={() => setConfirmTransferOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>Create records in the destination environment?</DialogTitle>
          <DialogContent>
            <p className="login-sub" style={{ marginTop: -4 }}>
              This starts with {totalSelected} selected record{totalSelected === 1 ? '' : 's'} in {toEnv}, one entity at a time in
              this order: {orderEntitiesForTransfer(selectedEntities).map((e) => e.label).join(' → ')}. Records whose
              parent record fails are skipped. {selectedRecordIds.supplier?.size > 0 ? 'Selected suppliers also include their child records from Source. ' : ''}
              You can download the full transaction log as Excel at the end.
            </p>
          </DialogContent>
          <DialogActions>
            <button type="button" className="ghost" onClick={() => setConfirmTransferOpen(false)}>Cancel</button>
            <button
              type="button"
              onClick={() => {
                setConfirmTransferOpen(false)
                handleTransfer()
              }}
            >
              Transfer {totalSelected}
            </button>
          </DialogActions>
        </Dialog>
      </>
    )
  }

  function renderStatusCounts(summary) {
    return (
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="tx-table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Records</th>
              {STATUS_COLUMNS.map((s) => <th key={s}>{TX_STATUS_LABELS[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {summary.entities.map((e) => (
              <tr key={e.id}>
                <td>{e.label}</td>
                <td>{e.total}</td>
                {STATUS_COLUMNS.map((s) => (
                  <td key={s} className={e[s] > 0 ? `tx-count tx-${s}` : 'tx-count'}>{e[s]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  function renderTransferStep() {
    if (transferProgress) {
      const entity = AVAILABLE_ENTITIES.find((e) => e.id === transferProgress.entityId)
      return (
        <div className="panel">
          <h2>Transferring…</h2>
          <p className="login-sub" style={{ marginTop: -6 }}>
            {entity ? `${entity.label}${transferProgress.stageLabel ? ` / ${transferProgress.stageLabel}` : ''}: ${transferProgress.sent} of ${transferProgress.toSend} selected headers processed` : 'Starting…'}
          </p>
          {renderStatusCounts(transferProgress.summary)}
          <div className="actions">
            <button type="button" className="ghost" onClick={() => { cancelRequested.current = true }}>
              Cancel after current batch
            </button>
          </div>
        </div>
      )
    }
    if (!transferLog) return null

    const summary = summarizeLog(transferLog)
    const { totals } = summary
    const clean = !transferError && totals.total === totals.SUCCESS + totals.ALREADY_EXISTS
    return (
      <div className="panel">
        <span className={`badge ${clean ? 'HIGH' : 'MEDIUM'}`} style={{ marginBottom: 10 }}>
          {transferError ? 'Interrupted' : clean ? 'Completed' : 'Completed with errors'}
        </span>
        <h2>{transferError ? 'Transfer interrupted' : 'Transfer finished'}</h2>
        {transferError && <div className="auth-banner error"><ErrorOutlineIcon fontSize="small" /><span>{transferError}</span></div>}
        {historyError && <div className="auth-banner warning"><ErrorOutlineIcon fontSize="small" /><span>{historyError}</span></div>}
        <p>
          {totals.SUCCESS} created, {totals.ALREADY_EXISTS} already existed, {totals.FAILED} failed,{' '}
          {totals.SKIPPED} skipped and {totals.UNCONFIRMED} unconfirmed, across {totals.total} logged outcomes
          from {transferLog.fromEnv} to {transferLog.toEnv}.
        </p>
        {renderStatusCounts(summary)}
        {totals.UNCONFIRMED > 0 && (
          <div className="auth-banner warning">
            <ErrorOutlineIcon fontSize="small" />
            <span>IFS gave no clear answer for {totals.UNCONFIRMED} record{totals.UNCONFIRMED === 1 ? '' : 's'}. Check the destination before retrying them.</span>
          </div>
        )}
        {downloadError && (
          <div className="auth-banner error">
            <ErrorOutlineIcon fontSize="small" />
            <span>{downloadError}</span>
          </div>
        )}
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button onClick={handleDownloadLog} disabled={downloading}>
            <FileDownloadOutlinedIcon fontSize="small" />
            {downloading ? 'Building Excel…' : 'Download transaction log (Excel)'}
          </button>
          <button className="secondary" onClick={() => router.push('/')}>Back to dashboard</button>
          <button className="ghost" onClick={resetAll}>Start another transfer</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">NEW TRANSFER</span>
          <h1>Transfer data to IFS</h1>
          <p>Configure the environments, select entities to transfer, review the data, then confirm the transfer.</p>
        </div>
      </header>

      <MigrationStepper steps={STEPS} activeStep={step} />

      {step === 0 && (
        <div className="panel">
          <h2>Configure Transfer</h2>
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
            <button
              type="button"
              className="secondary"
              onClick={() => router.push(`/new-migration/company-set?env=${encodeURIComponent(SOURCE_ENV)}`)}
              disabled={!fromEnv}
            >
              <CloudDownloadOutlinedIcon fontSize="small" />
              Get live data (CompanySet)
            </button>
            <button onClick={() => setStep(1)} disabled={!canProceedConfig}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 1 && renderSelectEntitiesStep()}

      {step === 2 && renderReviewDataStep()}

      {step === 3 && renderTransferStep()}
    </>
  )
}
