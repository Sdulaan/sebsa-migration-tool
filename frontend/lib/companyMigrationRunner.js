// Migrates one or more companies from the Source to the Destination:
// header first (CreateNewCompany, via postCompanyHeaderBatch — the proven,
// confirmed-working flow, unchanged), then every sub-entity step in
// lib/companyMigrationSteps.js, strictly in order, for each company in turn.
// Once a step fails for a company, that company's remaining steps are
// skipped (its header still counts, so later companies aren't affected).
//
// Every outcome (one company-migration run, across every company and step)
// is written into a single lib/transactionLog.js log, so the finished screen
// and the Excel download are the exact same summary/export the main
// Transfer step uses.

import { COMPANY_MIGRATION_STEPS } from './companyMigrationSteps'
import {
  SOURCE_ENV,
  DEST_ENV,
  getEnvironmentConfig,
  getSessionToken,
  setSessionToken,
  clearSessionToken,
  postCompanyHeaderBatch
} from './migrationStore'
import { TX_STATUS, addLogEntry } from './transactionLog'

export const STEP_STATUS_LABELS = {
  PENDING: 'Waiting',
  RUNNING: 'Running…',
  SUCCESS: 'Done',
  NOTHING: 'Nothing to migrate',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
  NOT_RUN: 'Not in this run'
}

const CONTINUES = new Set(['SUCCESS', 'NOTHING'])

// The header is step 0 for display purposes, even though it runs through a
// different mechanism than the rest (see companyMigrationSteps.js).
export const HEADER_STEP = { id: 'header', label: 'Company (header)', method: 'ACTION' }

export const ALL_STEPS_FOR_DISPLAY = [HEADER_STEP, ...COMPANY_MIGRATION_STEPS]

// Entities for the shared transaction log — one per step, so the Excel
// export gets one sheet per step, same convention as the main Transfer.
export const COMPANY_MIGRATION_LOG_ENTITIES = ALL_STEPS_FOR_DISPLAY.map((s) => ({ id: s.id, label: s.label }))

function envAuth(env) {
  const config = getEnvironmentConfig(env)
  const cached = getSessionToken(env)
  return { baseUrl: config.baseUrl, ...(cached ? { accessToken: cached.accessToken } : { config }) }
}

function txStatus(status) {
  if (status === 'SUCCESS') return TX_STATUS.SUCCESS
  if (status === 'ALREADY_EXISTS') return TX_STATUS.ALREADY_EXISTS
  if (status === 'NO_FIELDS' || status === 'NOTHING') return TX_STATUS.SKIPPED
  if (status === 'UNCONFIRMED') return TX_STATUS.UNCONFIRMED
  return TX_STATUS.FAILED
}

async function runHeader(company, order) {
  const destConfig = getEnvironmentConfig(DEST_ENV)
  const posted = await postCompanyHeaderBatch(DEST_ENV, destConfig, [company.record])
  if (!posted.success) {
    return { status: 'FAILED', error: posted.error, records: [] }
  }
  const result = posted.results[0]
  const status = result.httpStatus != null && result.httpStatus >= 200 && result.httpStatus < 300
    ? 'SUCCESS'
    : result.error && /already exists/i.test(result.error)
    ? 'ALREADY_EXISTS'
    : 'FAILED'
  return {
    status,
    error: status === 'FAILED' ? result.error : undefined,
    sourceCount: 1,
    records: [{ label: company.co, method: 'POST', url: 'CreateNewCompany', status, httpStatus: result.httpStatus, error: result.error, payload: company.record }]
  }
}

async function runStep(step, ctx) {
  try {
    const res = await fetch('/api/ifs/company-migration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepId: step.id,
        company: ctx.co,
        addressId: ctx.addr,
        source: envAuth(SOURCE_ENV),
        destination: envAuth(DEST_ENV)
      })
    })
    const body = await res.json()
    if (body.tokens?.source) setSessionToken(SOURCE_ENV, body.tokens.source)
    if (body.tokens?.destination) setSessionToken(DEST_ENV, body.tokens.destination)
    if (body.tokenInvalid?.source) clearSessionToken(SOURCE_ENV)
    if (body.tokenInvalid?.destination) clearSessionToken(DEST_ENV)
    if (!res.ok || !body.success) {
      return { status: 'FAILED', error: body.error || `Request failed (${res.status}).`, records: [] }
    }
    return body
  } catch (err) {
    return { status: 'FAILED', error: err.message, records: [] }
  }
}

// Header always runs regardless of `stepIds` — keep in sync with `included()`
// inside runCompanyMigration below.
const pendingSteps = (stepIds) =>
  ALL_STEPS_FOR_DISPLAY.map((s) => ({
    id: s.id,
    label: s.label,
    method: s.method,
    status: stepIds && s.id !== 'header' && !stepIds.includes(s.id) ? 'NOT_RUN' : 'PENDING',
    records: []
  }))

export function pendingRunsFor(companies, stepIds) {
  return companies.map((record) => ({
    co: record.Company,
    label: record.Name || record.Company,
    record,
    steps: pendingSteps(stepIds)
  }))
}

// Migrates ONE company: header first, then every included sub-entity step,
// strictly in order — mirrors runSiteMigration's shape (one call per
// company, the dialog loops over companies itself so it can show accurate
// per-company running/done state). `company` is one entry from
// pendingRunsFor() (carries the raw source record and its pending steps).
// log: a transactionLog.js log (already created by the caller with
// COMPANY_MIGRATION_LOG_ENTITIES). onUpdate(steps) fires after every step
// changes, for live progress. stepIds, when given, limits the run to those
// steps (header always runs). Returns the final steps array.
export async function runOneCompanyMigration({ company, log, stepIds = null, onUpdate = () => {} }) {
  const included = (id) => !stepIds || id === 'header' || stepIds.includes(id)
  const results = pendingSteps(stepIds)
  const publish = () => onUpdate(results.map((r) => ({ ...r })))
  let order = 0
  let failed = false
  let addressId = null

  // Step 0: header.
  if (included('header')) {
    results[0] = { ...results[0], status: 'RUNNING' }
    publish()
    const outcome = await runHeader(company, order)
    results[0] = { ...results[0], status: outcome.status, error: outcome.error, sourceCount: outcome.sourceCount, records: outcome.records || [] }
    ;(outcome.records || []).forEach((r) => {
      addLogEntry(log, {
        entity: HEADER_STEP,
        key: r.label,
        status: txStatus(r.status),
        httpStatus: r.httpStatus,
        message: r.status === 'SUCCESS' ? 'Created' : r.error || '',
        payload: r.payload,
        order: order++
      })
    })
    if (!CONTINUES.has(outcome.status) && outcome.status !== 'ALREADY_EXISTS') failed = true
    publish()
  }

  for (let si = 0; si < COMPANY_MIGRATION_STEPS.length; si++) {
    const step = COMPANY_MIGRATION_STEPS[si]
    const ri = si + 1 // +1 for the header row
    if (!included(step.id)) continue
    if (failed) {
      results[ri] = { ...results[ri], status: 'SKIPPED', message: 'Skipped because an earlier step failed.' }
      publish()
      continue
    }
    if (step.needsAddress && !addressId) {
      results[ri] = { ...results[ri], status: 'NOTHING', message: 'This company has no address on file — skipped.' }
      publish()
      continue
    }

    results[ri] = { ...results[ri], status: 'RUNNING' }
    publish()

    const outcome = await runStep(step, { co: company.co, addr: step.needsAddress ? addressId : undefined })
    if (step.id === 'address' && outcome.primaryAddressId) addressId = outcome.primaryAddressId

    results[ri] = {
      ...results[ri],
      status: outcome.status,
      error: outcome.error,
      message: outcome.message,
      sourceCount: outcome.sourceCount,
      records: outcome.records || []
    }
    ;(outcome.records || []).forEach((r) => {
      addLogEntry(log, {
        entity: step,
        key: `${company.co} · ${r.label}`,
        status: txStatus(r.status),
        httpStatus: r.httpStatus,
        message: r.status === 'SUCCESS' ? 'Created' : r.status === 'ALREADY_EXISTS' ? 'Already exists' : r.error || '',
        payload: r.payload,
        order: order++
      })
    })
    if (!CONTINUES.has(outcome.status)) failed = true
    publish()
  }

  return results
}
