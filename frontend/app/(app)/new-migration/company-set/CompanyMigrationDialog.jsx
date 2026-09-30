'use client'

import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import CircularProgress from '@mui/material/CircularProgress'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined'
import PanoramaFishEyeIcon from '@mui/icons-material/PanoramaFishEye'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { COMPANY_MIGRATION_STEPS } from '../../../../lib/companyMigrationSteps'
import { runOneCompanyMigration, pendingRunsFor, COMPANY_MIGRATION_LOG_ENTITIES, STEP_STATUS_LABELS } from '../../../../lib/companyMigrationRunner'
import { SOURCE_ENV, DEST_ENV, getEnvironmentConfig, buildCompanySetUrl } from '../../../../lib/migrationStore'
import { createTransactionLog, summarizeLog } from '../../../../lib/transactionLog'
import { downloadTransactionLog } from '../../../../lib/transactionLogExcel'

const RECORD_STATUS_LABELS = {
  SUCCESS: 'Done',
  ALREADY_EXISTS: 'Already exists',
  NO_FIELDS: 'Nothing to send',
  FAILED: 'Failed',
  UNCONFIRMED: 'Unconfirmed'
}

// What a run covers. "Create company only" runs just the header (via
// CreateNewCompany, the proven flow) — the default, safest choice.
const RUN_SCOPES = [
  { id: 'header', label: 'Create company only', hint: 'Header only — the proven CreateNewCompany flow', stepIds: [] },
  { id: 'all', label: `Header + all ${COMPANY_MIGRATION_STEPS.length} sub-entities`, hint: 'Address, Employees, Accounting Rules, Invoice, Payment, … in order', stepIds: null }
]

// A company's overall state, from its steps.
function companyStatus(steps, running) {
  if (running) return 'RUNNING'
  if (steps.some((s) => s.status === 'FAILED')) return 'FAILED'
  if (steps.every((s) => ['PENDING', 'NOT_RUN'].includes(s.status))) return 'PENDING'
  return 'SUCCESS'
}

function StatusIcon({ status }) {
  if (status === 'RUNNING') return <CircularProgress size={16} />
  // ALREADY_EXISTS reads as a checkmark too — the record is in the
  // destination either way, which is what this icon communicates.
  if (status === 'SUCCESS' || status === 'ALREADY_EXISTS') return <CheckCircleOutlineIcon fontSize="small" className="mig-ok" />
  if (status === 'FAILED') return <ErrorOutlineIcon fontSize="small" className="mig-fail" />
  if (status === 'PENDING') return <PanoramaFishEyeIcon fontSize="small" className="mig-muted" />
  return <BlockOutlinedIcon fontSize="small" className="mig-muted" />
}

// Confirms, then migrates the given companies to the Destination — one
// company at a time, header first then every sub-entity step in
// lib/companyMigrationSteps.js in order — showing each step's live status.
// Finishes on the same summary + Excel-download screen the main Transfer
// step uses (lib/transactionLog.js / transactionLogExcel.js).
export default function CompanyMigrationDialog({ open, onClose, companies }) {
  const [phase, setPhase] = useState('confirm') // confirm | running | done
  const [scopeId, setScopeId] = useState(RUN_SCOPES[0].id)
  const scope = RUN_SCOPES.find((s) => s.id === scopeId)
  const [runs, setRuns] = useState(() => pendingRunsFor(companies, RUN_SCOPES[0].stepIds).map((r) => ({ ...r, running: false })))
  const [viewIndex, setViewIndex] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [error, setError] = useState(null)
  const [log, setLog] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const sourceBaseUrl = getEnvironmentConfig(SOURCE_ENV).baseUrl
  const destBaseUrl = getEnvironmentConfig(DEST_ENV).baseUrl
  let sourceUrl = null
  try {
    sourceUrl = buildCompanySetUrl(sourceBaseUrl)
  } catch {}

  function handleClose() {
    if (phase === 'running') return
    onClose()
  }

  function chooseScope(id) {
    setScopeId(id)
    const stepIds = RUN_SCOPES.find((s) => s.id === id).stepIds
    setRuns(pendingRunsFor(companies, stepIds).map((r) => ({ ...r, running: false })))
  }

  function updateRun(index, patch) {
    setRuns((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleStart() {
    if (!sourceUrl || !destBaseUrl) {
      setError('Both the source and destination environments need a Base URL configured first.')
      return
    }
    setError(null)
    setPhase('running')

    const runLog = createTransactionLog({
      fromEnv: SOURCE_ENV,
      toEnv: DEST_ENV,
      sourceBaseUrl,
      destBaseUrl,
      entities: COMPANY_MIGRATION_LOG_ENTITIES
    })

    let firstFailed = null
    // Strictly one company after another.
    for (let i = 0; i < companies.length; i++) {
      setViewIndex(i)
      setExpanded(null)
      updateRun(i, { running: true })
      const steps = await runOneCompanyMigration({
        company: runs[i],
        log: runLog,
        stepIds: scope.stepIds,
        onUpdate: (live) => updateRun(i, { steps: live })
      })
      updateRun(i, { steps, running: false })
      if (firstFailed === null && steps.some((s) => s.status === 'FAILED')) firstFailed = { index: i, steps }
    }

    runLog.finishedAt = new Date().toISOString()
    setLog(runLog)
    setPhase('done')
    // Show the first failed company with its failed step open.
    if (firstFailed) {
      setViewIndex(firstFailed.index)
      setExpanded(firstFailed.steps.find((s) => s.status === 'FAILED').id)
    }
  }

  async function handleDownload() {
    if (!log) return
    setDownloading(true)
    try {
      await downloadTransactionLog(log)
    } finally {
      setDownloading(false)
    }
  }

  const failedCompanies = runs.filter((r) => companyStatus(r.steps, r.running) === 'FAILED').length
  const view = runs[viewIndex]
  const companyWord = companies.length === 1 ? 'company' : 'companies'
  const summary = phase === 'done' && log ? summarizeLog(log) : null

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>
        {phase === 'confirm' && `Migrate ${companies.length} ${companyWord} to the destination?`}
        {phase === 'running' && `Migrating company ${viewIndex + 1} of ${companies.length}…`}
        {phase === 'done' &&
          (failedCompanies ? `Transfer finished — ${failedCompanies} of ${companies.length} ${companyWord} with errors` : `Transfer finished — ${companies.length} ${companyWord}`)}
      </DialogTitle>
      <DialogContent>
        {phase === 'confirm' && (
          <>
            <div className="mig-scopes" role="radiogroup" aria-label="What to run">
              {RUN_SCOPES.map((s) => (
                <label key={s.id} className={`mig-scope ${s.id === scopeId ? 'active' : ''}`}>
                  <input type="radio" name="company-mig-scope" checked={s.id === scopeId} onChange={() => chooseScope(s.id)} />
                  <span>
                    <strong>{s.label}</strong>
                    <small>{s.hint}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className="login-sub" style={{ marginTop: 0, wordBreak: 'break-all' }}>
              {scope.stepIds
                ? 'Each company is created in the destination via CreateNewCompany — the same flow confirmed working on its own.'
                : 'Each company runs its header, then every sub-entity step below in order: read from the Source, then write to the Destination — POST for new records, PATCH (with the Destination’s ETag) for the company’s existing default records —'}{' '}
              against {destBaseUrl || 'the destination (no Base URL set)'}. Companies run one after another.
              {!scope.stepIds && ' If a step fails, that company’s remaining steps are skipped. Address-scoped steps use only the company’s first address.'}
            </p>
          </>
        )}
        {error && (
          <div className="auth-banner error" style={{ marginTop: 0, marginBottom: 12 }}>
            <ErrorOutlineIcon fontSize="small" />
            <span>{error}</span>
          </div>
        )}

        {phase === 'done' && summary && (
          <div className="security-summary" style={{ marginBottom: 16 }}>
            <b>
              {summary.totals.SUCCESS} created, {summary.totals.ALREADY_EXISTS} already existed,{' '}
              {summary.totals.FAILED} failed, {summary.totals.SKIPPED} skipped and {summary.totals.UNCONFIRMED} unconfirmed, out of{' '}
              {summary.totals.total} records sent from {sourceBaseUrl} to {destBaseUrl}.
            </b>
          </div>
        )}

        {runs.length > 1 && (
          <div className="mig-sites">
            {runs.map((r, i) => (
              <button
                key={r.co}
                type="button"
                className={`mig-site ${i === viewIndex ? 'active' : ''}`}
                onClick={() => {
                  setViewIndex(i)
                  setExpanded(null)
                }}
              >
                <StatusIcon status={companyStatus(r.steps, r.running)} />
                {r.co}
              </button>
            ))}
          </div>
        )}

        <ol className="mig-steps">
          {view.steps.map((r, i) => {
            const hasDetail = r.error || r.message || r.records.length > 0
            const isOpen = expanded === r.id
            return (
              <li key={r.id} className={`mig-step status-${r.status.toLowerCase()}`}>
                <button
                  type="button"
                  className="mig-step-head"
                  onClick={() => hasDetail && setExpanded(isOpen ? null : r.id)}
                  disabled={!hasDetail}
                >
                  <span className="mig-step-no">{i + 1}</span>
                  <StatusIcon status={r.status} />
                  <span className="mig-step-label">{r.label}</span>
                  {r.method && r.method !== 'ACTION' && <span className="mig-method">{r.method}</span>}
                  <span className="mig-step-status">
                    {STEP_STATUS_LABELS[r.status]}
                    {r.sourceCount > 0 && ` · ${r.sourceCount} record${r.sourceCount === 1 ? '' : 's'}`}
                  </span>
                  {hasDetail && (isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />)}
                </button>
                {isOpen && (
                  <div className="mig-step-detail">
                    {r.error && <p className="mig-fail">{r.error}</p>}
                    {r.message && <p>{r.message}</p>}
                    {r.records.map((rec, ri) => (
                      <div key={ri} className="mig-record">
                        <span className={`mig-record-status ${rec.status.toLowerCase()}`}>{RECORD_STATUS_LABELS[rec.status] || rec.status}</span>
                        <span className="mig-record-label">{rec.label}</span>
                        {rec.httpStatus && <span className="mig-muted">HTTP {rec.httpStatus}</span>}
                        <code>{rec.method} {rec.url}</code>
                        {rec.error && !['SUCCESS', 'ALREADY_EXISTS', 'NO_FIELDS'].includes(rec.status) && (
                          <span className="mig-record-error">{rec.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </DialogContent>
      <DialogActions>
        {phase === 'confirm' && (
          <>
            <button type="button" className="ghost" onClick={handleClose}>Cancel</button>
            <button type="button" onClick={handleStart}>Migrate {companies.length} {companyWord}</button>
          </>
        )}
        {phase === 'running' && <span className="mig-muted" style={{ padding: '0 8px' }}>Running step by step — keep this open.</span>}
        {phase === 'done' && (
          <>
            <button type="button" className="secondary" onClick={handleDownload} disabled={downloading}>
              <FileDownloadOutlinedIcon fontSize="small" />
              {downloading ? 'Preparing…' : 'Download transaction log (Excel)'}
            </button>
            <button type="button" onClick={handleClose}>Close</button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
