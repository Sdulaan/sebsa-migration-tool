'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Checkbox from '@mui/material/Checkbox'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import { SOURCE_ENV, buildCompanySetUrl, fetchLiveCompanies, getEnvironmentConfig, visibleRecordFields } from '../../../../lib/migrationStore'
import CompanyMigrationDialog from './CompanyMigrationDialog'

function CompanySetContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const env = searchParams.get('env') || SOURCE_ENV

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState(null)
  const [recordIndex, setRecordIndex] = useState(0)
  const [dataUrl, setDataUrl] = useState(null)
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [migrateOpen, setMigrateOpen] = useState(false)

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
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env])

  const records = result?.success ? result.records : []
  const activeRecord = records[recordIndex]
  const allSelected = records.length > 0 && selectedIndices.size === records.length
  // Raw source records, in selection order — what CompanyMigrationDialog
  // (via companyMigrationRunner.js) reads header fields and re-fetches
  // sub-entities from.
  const selectedCompanies = [...selectedIndices].sort((a, b) => a - b).map((i) => records[i])

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

  function handleMigrationClosed() {
    setMigrateOpen(false)
    // The destination may have changed (companies created/updated) — refresh
    // so re-opening "Migrate data" checks against current data.
    load()
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
            <button type="button" onClick={() => setMigrateOpen(true)} disabled={selectedIndices.size === 0}>
              <CloudUploadOutlinedIcon fontSize="small" />
              Migrate data ({selectedIndices.size} selected)
            </button>
          </div>
        )}
      </div>

      {migrateOpen && (
        <CompanyMigrationDialog open={migrateOpen} onClose={handleMigrationClosed} companies={selectedCompanies} />
      )}
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
