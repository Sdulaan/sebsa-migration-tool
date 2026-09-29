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
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { SITE_MIGRATION_STEPS } from '../../../../lib/siteMigrationSteps'
import { runSiteMigration, STEP_STATUS_LABELS } from '../../../../lib/siteMigrationRunner'
import { DEST_ENV, getEnvironmentConfig, buildCompanySiteHandlingBatchUrl } from '../../../../lib/migrationStore'

const RECORD_STATUS_LABELS = {
  SUCCESS: 'Done',
  ALREADY_EXISTS: 'Already exists',
  NO_FIELDS: 'Nothing to send',
  FAILED: 'Failed',
  UNCONFIRMED: 'Unconfirmed'
}

// What a run covers. "Create site only" runs just step 1 (POST CompanySiteSet)
// so site creation can be tried on its own first.
const RUN_SCOPES = [
  { id: 'site', label: 'Create site only', hint: 'Step 1 — POST CompanySiteSet', stepIds: ['site'] },
  { id: 'all', label: `All ${SITE_MIGRATION_STEPS.length} steps`, hint: 'Every POST and PATCH, in the workbook order', stepIds: null }
]

const pendingSteps = (stepIds) =>
  SITE_MIGRATION_STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    method: s.method,
    status: stepIds && !stepIds.includes(s.id) ? 'NOT_RUN' : s.notMigrated ? 'NOT_MIGRATED' : 'PENDING',
    records: []
  }))

// A site's overall state, from its steps.
function siteStatus(steps, running) {
  if (running) return 'RUNNING'
  if (steps.some((s) => s.status === 'FAILED')) return 'FAILED'
  if (steps.every((s) => ['PENDING', 'NOT_MIGRATED', 'NOT_RUN'].includes(s.status))) return 'PENDING'
  return 'SUCCESS'
}

function StatusIcon({ status }) {
  if (status === 'RUNNING') return <CircularProgress size={16} />
  if (status === 'SUCCESS') return <CheckCircleOutlineIcon fontSize="small" className="mig-ok" />
  if (status === 'FAILED') return <ErrorOutlineIcon fontSize="small" className="mig-fail" />
  if (status === 'PENDING') return <PanoramaFishEyeIcon fontSize="small" className="mig-muted" />
  return <BlockOutlinedIcon fontSize="small" className="mig-muted" />
}

// Confirms, then migrates the given sites to the Destination — one site at a
// time, and within each site every step of lib/siteMigrationSteps.js in the
// workbook's order — showing each step's live status.
export default function SiteMigrationDialog({ open, onClose, sites }) {
  const [phase, setPhase] = useState('confirm') // confirm | running | done
  const [scopeId, setScopeId] = useState(RUN_SCOPES[0].id)
  const scope = RUN_SCOPES.find((s) => s.id === scopeId)
  const [runs, setRuns] = useState(() => sites.map((s) => ({ ...s, steps: pendingSteps(RUN_SCOPES[0].stepIds), running: false })))
  const [viewIndex, setViewIndex] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [error, setError] = useState(null)

  const destBaseUrl = getEnvironmentConfig(DEST_ENV).baseUrl
  let batchUrl = null
  try {
    batchUrl = buildCompanySiteHandlingBatchUrl(destBaseUrl)
  } catch {}

  function handleClose() {
    if (phase === 'running') return
    onClose()
  }

  function chooseScope(id) {
    setScopeId(id)
    const stepIds = RUN_SCOPES.find((s) => s.id === id).stepIds
    setRuns((prev) => prev.map((r) => ({ ...r, steps: pendingSteps(stepIds) })))
  }

  function updateRun(index, patch) {
    setRuns((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleStart() {
    if (!batchUrl) {
      setError('No Base URL configured for the destination environment yet — set one in "Configure destination environment".')
      return
    }
    setError(null)
    setPhase('running')
    let firstFailed = null
    // Strictly one site after another.
    for (let i = 0; i < sites.length; i++) {
      setViewIndex(i)
      setExpanded(null)
      updateRun(i, { running: true })
      const steps = await runSiteMigration({
        contract: sites[i].contract,
        company: sites[i].company,
        stepIds: scope.stepIds,
        onUpdate: (live) => updateRun(i, { steps: live })
      })
      updateRun(i, { steps, running: false })
      if (firstFailed === null && steps.some((s) => s.status === 'FAILED')) firstFailed = { index: i, steps }
    }
    setPhase('done')
    // Show the first failed site with its failed step open.
    if (firstFailed) {
      setViewIndex(firstFailed.index)
      setExpanded(firstFailed.steps.find((s) => s.status === 'FAILED').id)
    }
  }

  const failedSites = runs.filter((r) => siteStatus(r.steps, r.running) === 'FAILED').length
  const view = runs[viewIndex]
  const siteWord = sites.length === 1 ? 'site' : 'sites'

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>
        {phase === 'confirm' && `Migrate ${sites.length} ${siteWord} to the destination?`}
        {phase === 'running' && `Migrating site ${viewIndex + 1} of ${sites.length}…`}
        {phase === 'done' &&
          (failedSites ? `Migration finished — ${failedSites} of ${sites.length} ${siteWord} with errors` : `Migrated ${sites.length} ${siteWord}`)}
      </DialogTitle>
      <DialogContent>
        {phase === 'confirm' && (
          <>
            <div className="mig-scopes" role="radiogroup" aria-label="What to run">
              {RUN_SCOPES.map((s) => (
                <label key={s.id} className={`mig-scope ${s.id === scopeId ? 'active' : ''}`}>
                  <input type="radio" name="mig-scope" checked={s.id === scopeId} onChange={() => chooseScope(s.id)} />
                  <span>
                    <strong>{s.label}</strong>
                    <small>{s.hint}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className="login-sub" style={{ marginTop: 0, wordBreak: 'break-all' }}>
              {scope.stepIds
                ? 'Each site is read from the Source and created in the Destination'
                : 'Each site runs every step below in this order, one at a time: read from the Source, then write to the Destination — POST for new records, PATCH (with the Destination’s ETag) for existing ones —'}{' '}
              through {batchUrl || 'CompanySiteHandling $batch (no destination Base URL set)'}. Sites run one after another.
              {!scope.stepIds && ' If a step fails, that site’s remaining steps are skipped.'}
            </p>
          </>
        )}
        {error && (
          <div className="auth-banner error" style={{ marginTop: 0, marginBottom: 12 }}>
            <ErrorOutlineIcon fontSize="small" />
            <span>{error}</span>
          </div>
        )}

        {runs.length > 1 && (
          <div className="mig-sites">
            {runs.map((r, i) => (
              <button
                key={r.contract}
                type="button"
                className={`mig-site ${i === viewIndex ? 'active' : ''}`}
                onClick={() => {
                  setViewIndex(i)
                  setExpanded(null)
                }}
              >
                <StatusIcon status={siteStatus(r.steps, r.running)} />
                {r.contract}
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
                  {r.method && <span className="mig-method">{r.method}</span>}
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
                        {rec.status === 'NO_FIELDS' && <span className="mig-muted">{rec.error}</span>}
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
            <button type="button" onClick={handleStart}>Migrate {sites.length} {siteWord}</button>
          </>
        )}
        {phase === 'running' && <span className="mig-muted" style={{ padding: '0 8px' }}>Running step by step — keep this open.</span>}
        {phase === 'done' && <button type="button" onClick={handleClose}>Close</button>}
      </DialogActions>
    </Dialog>
  )
}
