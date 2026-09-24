'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Checkbox from '@mui/material/Checkbox'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import {
  ENVIRONMENTS,
  buildSalesPartSetUrl,
  buildSalesPartMigrationPayload,
  fetchLiveSalesParts,
  getEnvironmentConfig,
  visibleRecordFields
} from '../../../../lib/migrationStore'

function SalesPartSetContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const env = searchParams.get('env') || ENVIRONMENTS[0]

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState(null)
  const [recordIndex, setRecordIndex] = useState(0)
  const [dataUrl, setDataUrl] = useState(null)
  const [selectedIndices, setSelectedIndices] = useState(new Set())

  async function load() {
    setLoading(true)
    setResult(null)
    const config = getEnvironmentConfig(env)
    try {
      setDataUrl(buildSalesPartSetUrl(config.baseUrl))
    } catch {
      setDataUrl(null)
    }
    const fetched = await fetchLiveSalesParts(env, config)
    setResult(fetched)
    setRecordIndex(0)
    setSelectedIndices(new Set())
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

  function handleMigrateData() {
    const selected = [...selectedIndices].sort((a, b) => a - b).map((i) => records[i])
    const payload = buildSalesPartMigrationPayload(selected)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sales-part-transfer-${env}-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">LIVE IFS DATA</span>
          <h1>SalesPartSet</h1>
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
            Back to transfer
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
                // first field — several leading fields on this projection
                // (e.g. Objgrants) are always null, which otherwise made
                // every row's title collapse to a generic "Record N".
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
            <button type="button" onClick={handleMigrateData} disabled={selectedIndices.size === 0}>
              <CloudUploadOutlinedIcon fontSize="small" />
              Transfer data ({selectedIndices.size} selected)
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default function SalesPartSetPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SalesPartSetContent />
    </Suspense>
  )
}
