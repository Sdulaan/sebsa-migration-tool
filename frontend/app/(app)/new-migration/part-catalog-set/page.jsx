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
  buildPartCatalogSetUrl,
  buildPartHandlingBatchUrl,
  buildPartCatalogMigrationPayload,
  fetchLivePartCatalog,
  postPartCatalogParts,
  getEnvironmentConfig,
  visibleRecordFields
} from '../../../../lib/migrationStore'

// Locally rejected parts can carry a blank or non-string PartNo.
function partLabel(result) {
  return String(result.PartNo ?? '').trim() || 'Unknown'
}

function PartCatalogSetContent() {
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

  async function load() {
    setLoading(true)
    setResult(null)
    const config = getEnvironmentConfig(env)
    try {
      setDataUrl(buildPartCatalogSetUrl(config.baseUrl))
    } catch {
      setDataUrl(null)
    }
    const fetched = await fetchLivePartCatalog(env, config)
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

  // One POST-ready body per selected part, in list order. Always an array,
  // even for one part — that's the input the $batch builder expects.
  function selectedParts() {
    const selected = [...selectedIndices].sort((a, b) => a - b).map((i) => records[i])
    return buildPartCatalogMigrationPayload(selected)
  }

  // Migrating creates records in the destination environment, so it's gated
  // behind a confirmation that names the exact URL being called.
  function handlePostClick() {
    setPostResult(null)
    try {
      setPostUrl(buildPartHandlingBatchUrl(getEnvironmentConfig(DEST_ENV).baseUrl))
      setConfirmOpen(true)
    } catch {
      setPostResult({
        success: false,
        error: 'No Base URL configured for the destination environment yet — set one in "Configure destination environment".'
      })
    }
  }

  async function handleConfirmPost() {
    setConfirmOpen(false)
    setPosting(true)
    const posted = await postPartCatalogParts(DEST_ENV, getEnvironmentConfig(DEST_ENV), selectedParts())
    console.log('[PartCatalogSet post] Result:', posted)
    setPostResult(posted)
    setPosting(false)
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">LIVE IFS DATA</span>
          <h1>PartCatalogSet</h1>
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
                // Titles the row by its first non-empty field, not just the
                // first field — leading fields on IFS projections (e.g.
                // Objgrants) are often always null, which would otherwise
                // collapse every row's title to a generic "Record N".
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
            <button type="button" onClick={handlePostClick} disabled={selectedIndices.size === 0 || posting}>
              <CloudUploadOutlinedIcon fontSize="small" />
              {posting ? 'Migrating…' : `Migrate data (${selectedIndices.size} selected)`}
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
              {postResult.summary.totalSubmitted + postResult.summary.locallySkipped} submitted:{' '}
              {postResult.summary.successful} created, {postResult.summary.failed} failed,{' '}
              {postResult.summary.unconfirmed} unconfirmed.
            </p>
            {postResult.successful.map((r, i) => (
              <div key={`ok-${i}`} className="auth-banner success" style={{ marginTop: 8 }}>
                <CheckCircleOutlineIcon fontSize="small" />
                <span>{r.PartNo} — Created ({r.status})</span>
              </div>
            ))}
            {postResult.failed.map((r, i) => (
              <div key={`failed-${i}`} className="auth-banner error" style={{ marginTop: 8 }}>
                <ErrorOutlineIcon fontSize="small" />
                <span>{partLabel(r)} — {r.error}</span>
              </div>
            ))}
            {postResult.unconfirmed.map((r, i) => (
              <div key={`unconfirmed-${i}`} className="auth-banner warning" style={{ marginTop: 8 }}>
                <ErrorOutlineIcon fontSize="small" />
                <span>{partLabel(r)} — {r.error}. It may or may not have been created; check the destination before retrying.</span>
              </div>
            ))}
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Migrate to destination environment?</DialogTitle>
        <DialogContent>
          <p className="login-sub" style={{ marginTop: -4, wordBreak: 'break-all' }}>
            This will create {selectedIndices.size} part{selectedIndices.size === 1 ? '' : 's'} in the destination
            environment by sending one $batch request to {postUrl}, with a separate changeset per part.
          </p>
        </DialogContent>
        <DialogActions>
          <button type="button" className="ghost" onClick={() => setConfirmOpen(false)}>Cancel</button>
          <button type="button" onClick={handleConfirmPost}>Migrate {selectedIndices.size}</button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default function PartCatalogSetPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <PartCatalogSetContent />
    </Suspense>
  )
}
