'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import {
  SOURCE_ENV,
  DEST_ENV,
  buildCompanySetUrl,
  buildCreateCompanyUrl,
  buildCompanyMigrationPayload,
  fetchLiveCompanies,
  postCompanies,
  getEnvironmentConfig,
  visibleRecordFields
} from '../../../../lib/migrationStore'

// Locally rejected companies can carry a blank or non-string NewCompany.
function companyLabel(result) {
  return String(result.NewCompany ?? '').trim() || 'Unknown'
}

function CompanySetContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const env = searchParams.get('env') || SOURCE_ENV

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState(null)
  const [recordIndex, setRecordIndex] = useState(0)
  const [dataUrl, setDataUrl] = useState(null)
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [postUrl, setPostUrl] = useState(null)
  const [posting, setPosting] = useState(false)
  const [postResult, setPostResult] = useState(null)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  // Set between "Migrate data" and the confirm dialog: which selected
  // companies are new vs. already present in the destination (see
  // handlePostClick — CreateNewCompany doesn't reliably fail on a duplicate,
  // see the note on the confirm dialog).
  const [pendingTransfer, setPendingTransfer] = useState(null) // { toCreate, alreadyExisting }

  async function load() {
    setLoading(true)
    setResult(null)
    const config = getEnvironmentConfig(env)
    try {
      setDataUrl(buildCompanySetUrl(config.baseUrl))
    } catch {
      setDataUrl(null)
    }
    const fetched = await fetchLiveCompanies(env, config)
    setResult(fetched)
    setRecordIndex(0)
    setSelectedIndices(new Set())
    setPostResult(null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env])

  const records = result?.success ? result.records : []
  const activeRecord = records[recordIndex]
  const allSelected = records.length > 0 && selectedIndices.size === records.length

  function toggleRecordSelected(i) {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIndices(allSelected ? new Set() : new Set(records.map((_, i) => i)))
  }

  // One CreateNewCompany-ready body per selected company, in list order.
  function selectedCompanies() {
    const selected = [...selectedIndices].sort((a, b) => a - b).map((i) => records[i])
    return buildCompanyMigrationPayload(selected)
  }

  // Migrating creates records in the destination environment, so it's gated
  // behind a confirmation that names the exact URL being called. Before that,
  // check which selected companies already exist in the destination:
  // CreateNewCompany does not reliably fail on a duplicate (a real run
  // returned an apparent success for a company that already existed there),
  // so duplicates are found here — by actually reading the destination — and
  // never sent, rather than trusted to IFS's own response.
  async function handlePostClick() {
    setPostResult(null)
    const destConfig = getEnvironmentConfig(DEST_ENV)
    let url
    try {
      url = buildCreateCompanyUrl(destConfig.baseUrl)
    } catch {
      setPostResult({
        success: false,
        error: 'No Base URL configured for the destination environment yet — set one in "Configure destination environment".'
      })
      return
    }
    setPostUrl(url)

    const toCreate = selectedCompanies()
    setCheckingDuplicates(true)
    const destCompanies = await fetchLiveCompanies(DEST_ENV, destConfig)
    setCheckingDuplicates(false)

    if (!destCompanies.success) {
      // Can't verify — don't block the migrate on a failed safety check, but
      // say so plainly rather than silently skipping it.
      setPendingTransfer({ toCreate, alreadyExisting: [], destCheckError: destCompanies.error })
      setConfirmOpen(true)
      return
    }

    const existingCodes = new Set(
      destCompanies.records.map((r) => String(r.Company ?? '').trim().toUpperCase()).filter(Boolean)
    )
    const alreadyExisting = toCreate.filter((c) => existingCodes.has(String(c.NewCompany ?? '').trim().toUpperCase()))
    const newOnes = toCreate.filter((c) => !existingCodes.has(String(c.NewCompany ?? '').trim().toUpperCase()))
    setPendingTransfer({ toCreate: newOnes, alreadyExisting, destCheckError: null })
    setConfirmOpen(true)
  }

  async function handleConfirmPost() {
    setConfirmOpen(false)
    const { toCreate, alreadyExisting } = pendingTransfer
    const skipped = alreadyExisting.map((c) => ({
      NewCompany: c.NewCompany,
      error: 'Already exists in the destination — skipped without calling CreateNewCompany.'
    }))

    if (toCreate.length === 0) {
      setPostResult({
        success: true,
        mode: 'none',
        summary: { totalSubmitted: skipped.length, successful: 0, failed: skipped.length },
        successful: [],
        failed: skipped,
        unconfirmed: []
      })
      return
    }

    setPosting(true)
    const posted = await postCompanies(DEST_ENV, getEnvironmentConfig(DEST_ENV), toCreate)
    console.log('[CompanySet post] Result:', posted)
    if (posted.success) {
      setPostResult({
        ...posted,
        summary: {
          ...posted.summary,
          totalSubmitted: posted.summary.totalSubmitted + skipped.length,
          failed: posted.summary.failed + skipped.length
        },
        failed: [...posted.failed, ...skipped]
      })
    } else {
      setPostResult(posted)
    }
    setPosting(false)
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">LIVE IFS DATA</span>
          <h1>CompanySet</h1>
          <p style={{ wordBreak: 'break-all' }}>
            {dataUrl
              ? `GET ${dataUrl} using the ${env} environment's saved authorization.`
              : `No Base URL configured for the ${env} environment yet — set one in "Configure source environment".`}
          </p>
        </div>
        {!loading && result?.success && (
          <span className="live-data-count">
            {records.length} record{records.length === 1 ? '' : 's'} found
          </span>
        )}
      </header>

      <div className="panel">
        <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 0, marginBottom: 18 }}>
          <button type="button" className="ghost" onClick={() => router.push('/new-migration')}>
            <ArrowBackOutlinedIcon fontSize="small" />
            Back to migration
          </button>
          <button type="button" className="secondary" onClick={load} disabled={loading}>
            <RefreshIcon fontSize="small" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {loading && <p>Authorizing and fetching…</p>}

        {!loading && result && !result.success && (
          <div className="auth-banner error">
            <ErrorOutlineIcon fontSize="small" />
            <span>{result.error}</span>
          </div>
        )}

        {!loading && result?.success && records.length === 0 && (
          <div className="empty">No records returned.</div>
        )}

        {!loading && result?.success && records.length > 0 && (
          <div className="live-data-layout">
            <div className="live-data-list">
              <div className="live-data-toolbar">
                <span>{selectedIndices.size} of {records.length} selected</span>
                <button type="button" className="secondary" onClick={toggleSelectAll}>
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              {records.map((record, i) => {
                const fields = visibleRecordFields(record)
                const isEmpty = (v) => v === null || v === undefined || v === ''
                const titleField = fields.find(([, value]) => !isEmpty(value))
                const subtitleFields = fields.filter((f) => f !== titleField && !isEmpty(f[1])).slice(0, 2)
                return (
                  <div
                    key={i}
                    className={`live-data-item ${recordIndex === i ? 'active' : ''}`}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedIndices.has(i)}
                      onChange={() => toggleRecordSelected(i)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="live-data-item-info" onClick={() => setRecordIndex(i)}>
                      <strong>{titleField ? String(titleField[1]) : `Record ${i + 1}`}</strong>
                      {subtitleFields.map(([label, value]) => (
                        <small key={label}>{label}: {String(value)}</small>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="live-data-detail">
              <div className="live-data-detail-grid">
                {visibleRecordFields(activeRecord).map(([label, value]) => (
                  <div className="live-data-field" key={label}>
                    <label>{label}</label>
                    <span>{value === null || value === undefined || value === '' ? '—' : String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && result?.success && records.length > 0 && (
          <div className="actions">
            <button
              type="button"
              onClick={handlePostClick}
              disabled={selectedIndices.size === 0 || posting || checkingDuplicates}
            >
              <CloudUploadOutlinedIcon fontSize="small" />
              {checkingDuplicates
                ? 'Checking destination…'
                : posting
                ? 'Migrating…'
                : `Migrate data (${selectedIndices.size} selected)`}
            </button>
          </div>
        )}

        {postResult && !postResult.success && (
          <div className="auth-banner error">
            <ErrorOutlineIcon fontSize="small" />
            <span>{postResult.error}</span>
          </div>
        )}

        {postResult?.success && (
          <>
            <p style={{ marginTop: 16 }}>
              {postResult.mode === 'batch'
                ? 'Sent as one $batch request. '
                : postResult.mode === 'sequential'
                ? 'Sent one request per company (the $batch endpoint didn’t accept it). '
                : ''}
              {postResult.summary.totalSubmitted} submitted: {postResult.summary.successful} created,{' '}
              {postResult.summary.failed} failed
              {postResult.summary.unconfirmed ? `, ${postResult.summary.unconfirmed} unconfirmed.` : '.'}
            </p>
            {postResult.successful.map((r, i) => (
              <div key={`ok-${i}`} className="auth-banner success" style={{ marginTop: 8 }}>
                <CheckCircleOutlineIcon fontSize="small" />
                <span>
                  {r.NewCompany} — Created ({r.status}
                  {r.note && r.note !== 'TRUE' ? `, ${r.note}` : ''})
                  {r.note && r.note !== 'TRUE' ? ' — check the company creation log in IFS.' : ''}
                </span>
              </div>
            ))}
            {postResult.failed.map((r, i) => (
              <div key={`failed-${i}`} className="auth-banner error" style={{ marginTop: 8 }}>
                <ErrorOutlineIcon fontSize="small" />
                <span>{companyLabel(r)} — {r.error}</span>
              </div>
            ))}
            {(postResult.unconfirmed || []).map((r, i) => (
              <div key={`unconfirmed-${i}`} className="auth-banner warning" style={{ marginTop: 8 }}>
                <ErrorOutlineIcon fontSize="small" />
                <span>{companyLabel(r)} — {r.error}. It may or may not have been created; check the destination before retrying.</span>
              </div>
            ))}
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Migrate to destination environment?</DialogTitle>
        <DialogContent>
          {pendingTransfer?.destCheckError && (
            <div className="auth-banner warning" style={{ marginBottom: 12 }}>
              <ErrorOutlineIcon fontSize="small" />
              <span>Couldn’t check the destination for existing companies ({pendingTransfer.destCheckError}) — proceeding without duplicate detection.</span>
            </div>
          )}
          <p className="login-sub" style={{ marginTop: -4, wordBreak: 'break-all' }}>
            {pendingTransfer?.toCreate.length > 0
              ? `This will create ${pendingTransfer.toCreate.length} compan${pendingTransfer.toCreate.length === 1 ? 'y' : 'ies'} in the destination environment via ${postUrl}.`
              : 'Nothing to create — every selected company already exists in the destination.'}
            {pendingTransfer?.alreadyExisting.length > 0 &&
              ` ${pendingTransfer.alreadyExisting.length} of the selected compan${pendingTransfer.alreadyExisting.length === 1 ? 'y' : 'ies'} already exist${pendingTransfer.alreadyExisting.length === 1 ? 's' : ''} in the destination and will be skipped.`}
          </p>
        </DialogContent>
        <DialogActions>
          <button type="button" className="ghost" onClick={() => setConfirmOpen(false)}>Cancel</button>
          <button type="button" onClick={handleConfirmPost}>
            {pendingTransfer?.toCreate.length > 0 ? `Migrate ${pendingTransfer.toCreate.length}` : 'Continue'}
          </button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default function CompanySetPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CompanySetContent />
    </Suspense>
  )
}
