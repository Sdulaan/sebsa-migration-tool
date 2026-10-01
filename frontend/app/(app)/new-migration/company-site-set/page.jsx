'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Checkbox from '@mui/material/Checkbox'
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Collapse from '@mui/material/Collapse'
import CircularProgress from '@mui/material/CircularProgress'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import SiteMigrationDialog from './SiteMigrationDialog'
import {
  SOURCE_ENV,
  buildCompanySiteSetUrl,
  fetchLiveCompanySites,
  fetchSiteData,
  getEnvironmentConfig,
  visibleRecordFields
} from '../../../../lib/migrationStore'
import { SITE_DATA_SOURCES } from '../../../../lib/siteDataSources'

// Laid out like the IFS Cloud "Site" form: a site list on the left, and a
// header card, the "Company Site Group" card and tabbed extra info on the
// right. "Migrate data" creates the ticked sites in the destination.

// The first key present on the record wins, so a field renamed between IFS
// versions still lands in the right slot.
const SITE_FIELDS = {
  site: ['Contract'],
  description: ['Description', 'SiteDescription'],
  company: ['Company'],
  companyName: ['CompanyName', 'Name'],
  country: ['CountryDesc', 'Country', 'CountryCode', 'CountryDb']
}

const SORT_OPTIONS = [
  { id: 'site', label: 'Site' },
  { id: 'description', label: 'Site Description' },
  { id: 'company', label: 'Company' }
]

const isEmpty = (v) => v === null || v === undefined || v === ''
const display = (v) => (isEmpty(v) ? '—' : String(v))

function pickKey(record, slot) {
  return SITE_FIELDS[slot].find((key) => record && key in record)
}

function pick(record, slot) {
  const key = pickKey(record, slot)
  return key ? record[key] : undefined
}

function FieldGrid({ record }) {
  return (
    <div className="live-data-detail-grid">
      {visibleRecordFields(record).map(([label, value]) => (
        <div className="live-data-field" key={label}>
          <label>{label}</label>
          <span>{display(value)}</span>
        </div>
      ))}
    </div>
  )
}

// Nested under the active site in the left list, like the IFS Site form: a
// collapsible "Site Data" row whose children are the site GETs in the
// workbook's order. Opening it loads the data (see CompanySiteSetContent).
function SiteSectionNav({ ready, state, open, activeSection, onToggle, onSelectSection }) {
  const sections = state?.result?.success ? state.result.sections : null
  return (
    <List dense disablePadding className="site-nav">
      <ListItemButton onClick={onToggle} disabled={!ready} className="site-nav-parent">
        <ListItemIcon className="site-nav-icon">
          <StorefrontOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary="Site Data"
          secondary={ready ? `${SITE_DATA_SOURCES.length} sections` : 'Needs a Site and a Company'}
        />
        {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </ListItemButton>
      <Collapse in={open && ready} timeout="auto" unmountOnExit>
        {(!state || state.loading) && (
          <div className="site-nav-status">
            <CircularProgress size={14} />
            <span>Loading {SITE_DATA_SOURCES.length} calls in order…</span>
          </div>
        )}
        {state && !state.loading && !state.result.success && (
          <div className="site-nav-status error">
            <ErrorOutlineIcon fontSize="small" />
            <span>Couldn't load site data</span>
          </div>
        )}
        {sections && (
          <List dense disablePadding>
            {sections.map((s, i) => (
              <ListItemButton
                key={s.id}
                selected={s.id === activeSection}
                onClick={() => onSelectSection(s.id)}
                className="site-nav-child"
              >
                <span className="site-nav-index">{i + 1}</span>
                <ListItemText primary={s.label} />
                {s.error
                  ? <ErrorOutlineIcon fontSize="small" className="site-nav-error" />
                  : <span className="site-nav-count">{s.records.length}</span>}
              </ListItemButton>
            ))}
          </List>
        )}
      </Collapse>
    </List>
  )
}

// What IFS actually sent back for a section (first page, as received), so an
// empty section can be told apart from one the page failed to read.
function RawResponse({ section }) {
  const [open, setOpen] = useState(false)
  let pretty = section.raw
  try {
    pretty = JSON.stringify(JSON.parse(section.raw), null, 2)
  } catch {}
  return (
    <div className="site-data-raw">
      <span className="site-data-meta">
        {section.httpStatus ? `HTTP ${section.httpStatus}` : 'No HTTP status'} · {section.records.length} record
        {section.records.length === 1 ? '' : 's'}
      </span>
      {section.raw != null && (
        <button type="button" className="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide raw IFS response' : 'Show raw IFS response'}
        </button>
      )}
      {open && <pre>{pretty || '(empty body)'}</pre>}
    </div>
  )
}

// The chosen Site Data section's records, shown in the Site Data tab.
function SiteDataPanel({ contract, ready, state, activeSection, onReload }) {
  if (!ready) return <div className="empty">This site needs both a Site and a Company to load its data.</div>
  if (!state || state.loading) {
    return <p>Loading site data for {contract} ({SITE_DATA_SOURCES.length} calls, in order)…</p>
  }
  if (!state.result.success) {
    return (
      <>
        <div className="auth-banner error" style={{ marginTop: 0 }}>
          <ErrorOutlineIcon fontSize="small" />
          <span>{state.result.error}</span>
        </div>
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="secondary" onClick={onReload}>
            <RefreshIcon fontSize="small" />
            Retry
          </button>
        </div>
      </>
    )
  }

  const sections = state.result.sections
  const index = Math.max(0, sections.findIndex((s) => s.id === activeSection))
  const section = sections[index]

  return (
    <div className="site-data-body">
      <div className="site-data-head">
        <h4>{index + 1}. {section.label}</h4>
        <button type="button" className="ghost" onClick={onReload} title="Reload all site data">
          <RefreshIcon fontSize="small" />
          Reload {contract}
        </button>
      </div>
      <p className="site-data-url">GET {section.url}</p>
      <RawResponse key={section.id} section={section} />
      {section.error && (
        <div className="auth-banner error" style={{ marginTop: 0 }}>
          <ErrorOutlineIcon fontSize="small" />
          <span>{section.error}</span>
        </div>
      )}
      {!section.error && section.records.length === 0 && <div className="empty">No records returned.</div>}
      {section.records.map((record, ri) => (
        <div key={ri} className="site-data-record">
          {section.records.length > 1 && <span className="site-data-record-no">Record {ri + 1}</span>}
          <FieldGrid record={record} />
        </div>
      ))}
    </div>
  )
}

function CompanySiteSetContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const env = searchParams.get('env') || SOURCE_ENV

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState(null)
  const [recordIndex, setRecordIndex] = useState(0)
  const [dataUrl, setDataUrl] = useState(null)
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [sortBy, setSortBy] = useState('site')
  const [activeTab, setActiveTab] = useState('extended')
  // Site data is loaded when its tab (or the nested "Site Data" list under
  // the active site, which mirrors it) is opened, once per site:
  // { [contract]: { loading, result } }
  const [siteData, setSiteData] = useState({})
  const [activeSection, setActiveSection] = useState(SITE_DATA_SOURCES[0].id)
  // The sites handed to the migration dialog while it's open.
  const [migrateSites, setMigrateSites] = useState(null)

  async function load() {
    setLoading(true)
    setResult(null)
    const config = getEnvironmentConfig(env)
    try {
      setDataUrl(buildCompanySiteSetUrl(config.baseUrl))
    } catch {
      setDataUrl(null)
    }
    const fetched = await fetchLiveCompanySites(env, config)
    setResult(fetched)
    setSelectedIndices(new Set())
    setSiteData({})
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env])

  const records = useMemo(() => (result?.success ? result.records : []), [result])

  // Indices into `records`, in display order. Selection and the active row
  // are tracked by original index, so re-sorting never changes what's picked.
  const order = useMemo(() => {
    const text = (i) => String(pick(records[i], sortBy) ?? '')
    return records.map((_, i) => i).sort((a, b) => text(a).localeCompare(text(b), undefined, { numeric: true }))
  }, [records, sortBy])

  // Open on the first site in display order after every load.
  useEffect(() => {
    setRecordIndex(order[0] ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  const activeRecord = records[recordIndex]
  const allSelected = records.length > 0 && selectedIndices.size === records.length

  // Everything not already shown in the Company Site Group card.
  const groupKeys = new Set(Object.keys(SITE_FIELDS).map((slot) => pickKey(activeRecord, slot)).filter(Boolean))
  const extendedFields = activeRecord
    ? visibleRecordFields(Object.fromEntries(Object.entries(activeRecord).filter(([key]) => !groupKeys.has(key))))
    : []

  const tabs = [
    { id: 'extended', label: 'Site Details' },
    { id: 'siteData', label: 'Site Data' }
  ]
  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0]

  const activeContract = isEmpty(pick(activeRecord, 'site')) ? '' : String(pick(activeRecord, 'site'))
  const activeCompany = isEmpty(pick(activeRecord, 'company')) ? '' : String(pick(activeRecord, 'company'))
  const siteDataReady = Boolean(activeContract && activeCompany)

  async function loadSiteData(contract, company) {
    setSiteData((prev) => ({ ...prev, [contract]: { loading: true } }))
    const fetched = await fetchSiteData(env, getEnvironmentConfig(env), contract, company)
    setSiteData((prev) => ({ ...prev, [contract]: { loading: false, result: fetched } }))
  }

  useEffect(() => {
    if (activeTab === 'siteData' && siteDataReady && !siteData[activeContract]) loadSiteData(activeContract, activeCompany)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeContract])

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

  // The ticked sites, in list order, as { contract, company } — the order
  // they're migrated in. Sites missing either key can't be migrated.
  function selectedSites() {
    return order
      .filter((i) => selectedIndices.has(i))
      .map((i) => ({ contract: String(pick(records[i], 'site') ?? ''), company: String(pick(records[i], 'company') ?? '') }))
      .filter((s) => s.contract && s.company)
  }

  const site = pick(activeRecord, 'site')
  const description = pick(activeRecord, 'description')
  const company = pick(activeRecord, 'company')
  const companyName = pick(activeRecord, 'companyName')

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">LIVE IFS DATA</span>
          <h1>CompanySiteSet</h1>
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
          <div className="site-layout">
            <div className="site-list">
              <div className="site-list-toolbar">
                <label className="site-sort">
                  <SwapVertIcon fontSize="small" />
                  <span>Sort by</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary" onClick={toggleSelectAll}>
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="site-list-count">{selectedIndices.size} of {records.length} selected</div>

              {order.map((i) => {
                const record = records[i]
                const isActive = recordIndex === i
                return (
                  <div key={i} className={`site-entry ${isActive ? 'active' : ''}`}>
                    <div className="site-item">
                      <Checkbox
                        size="small"
                        checked={selectedIndices.has(i)}
                        onChange={() => toggleRecordSelected(i)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="site-item-info" onClick={() => setRecordIndex(i)}>
                        <strong>{display(pick(record, 'site'))}</strong>
                        <small><span>Site Description:</span> {display(pick(record, 'description'))}</small>
                        <small><span>Company:</span> {display(pick(record, 'company'))}</small>
                        {pickKey(record, 'companyName') && (
                          <small><span>Name:</span> {display(pick(record, 'companyName'))}</small>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <SiteSectionNav
                        ready={siteDataReady}
                        state={siteData[activeContract]}
                        open={activeTab === 'siteData'}
                        activeSection={activeSection}
                        onToggle={() => setActiveTab((t) => (t === 'siteData' ? 'extended' : 'siteData'))}
                        onSelectSection={(id) => {
                          setActiveSection(id)
                          setActiveTab('siteData')
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="site-detail">
              <div className="site-card site-title-card">
                <h2>{[site, description, company].filter((v) => !isEmpty(v)).join(' - ') || `Record ${recordIndex + 1}`}</h2>
              </div>

              <div className="site-card">
                <h3>Company Site Group</h3>
                <div className="site-group-grid">
                  <div className="site-field">
                    <label>Site</label>
                    <span>{display(site)}</span>
                  </div>
                  <div className="site-field">
                    <label>Site Description</label>
                    <span className="site-value-box">{display(description)}</span>
                  </div>
                  <div className="site-field">
                    <label>Company</label>
                    <span className="site-value-ref">
                      {[company, companyName].filter((v) => !isEmpty(v)).join(' - ') || '—'}
                    </span>
                  </div>
                  <div className="site-field">
                    <label>Country</label>
                    <span className="site-value-box site-value-ref">{display(pick(activeRecord, 'country'))}</span>
                  </div>
                </div>
              </div>

              <div className="site-card site-tabs-card">
                <div className="site-tabs" role="tablist">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={currentTab.id === t.id}
                      className={`site-tab ${currentTab.id === t.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="site-tab-body">
                  {currentTab.id === 'extended' && (
                    extendedFields.length === 0 ? (
                      <div className="empty">No further fields on this site.</div>
                    ) : (
                      <div className="live-data-detail-grid">
                        {extendedFields.map(([label, value]) => (
                          <div className="live-data-field" key={label}>
                            <label>{label}</label>
                            <span>{display(value)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {currentTab.id === 'siteData' && (
                    <SiteDataPanel
                      contract={activeContract}
                      ready={siteDataReady}
                      state={siteData[activeContract]}
                      activeSection={activeSection}
                      onReload={() => loadSiteData(activeContract, activeCompany)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && result?.success && records.length > 0 && (
          <div className="actions">
            <button type="button" onClick={() => setMigrateSites(selectedSites())} disabled={selectedIndices.size === 0 || !!migrateSites}>
              <CloudUploadOutlinedIcon fontSize="small" />
              {`Migrate data (${selectedIndices.size} selected)`}
            </button>
          </div>
        )}
      </div>

      {migrateSites && (
        <SiteMigrationDialog open sites={migrateSites} onClose={() => setMigrateSites(null)} />
      )}
    </>
  )
}

export default function CompanySiteSetPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CompanySiteSetContent />
    </Suspense>
  )
}
