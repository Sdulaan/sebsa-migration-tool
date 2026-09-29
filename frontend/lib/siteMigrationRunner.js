import { SITE_MIGRATION_STEPS } from './siteMigrationSteps'
import {
  SOURCE_ENV,
  DEST_ENV,
  getEnvironmentConfig,
  getSessionToken,
  setSessionToken,
  clearSessionToken
} from './migrationStore'

// Migrates one site from the Source to the Destination by running every step
// in lib/siteMigrationSteps.js strictly in order: each step is awaited before
// the next starts. Once a step fails, the site's remaining steps are skipped.
//
// Step statuses: SUCCESS, NOTHING (Source had no records), NOT_MIGRATED
// (step not implemented yet), FAILED, SKIPPED. The first three let the run
// carry on.

export const STEP_STATUS_LABELS = {
  PENDING: 'Waiting',
  RUNNING: 'Running…',
  SUCCESS: 'Done',
  NOTHING: 'Nothing to migrate',
  NOT_MIGRATED: 'Not migrated yet',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
  NOT_RUN: 'Not in this run'
}

const CONTINUES = new Set(['SUCCESS', 'NOTHING', 'NOT_MIGRATED'])

// Reuses the environment's cached session token, else sends its config so
// the route can mint one.
function envAuth(env) {
  const config = getEnvironmentConfig(env)
  const cached = getSessionToken(env)
  return { baseUrl: config.baseUrl, ...(cached ? { accessToken: cached.accessToken } : { config }) }
}

async function runStep(step, contract, company) {
  try {
    const res = await fetch('/api/ifs/site-migration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepId: step.id,
        contract,
        company,
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

// onUpdate(results) is called with a fresh copy of every step's state each
// time one changes, for live progress. stepIds, when given, limits the run to
// those steps (still in the workbook's order); the rest show as NOT_RUN.
export async function runSiteMigration({ contract, company, stepIds = null, onUpdate = () => {} }) {
  const included = (step) => !stepIds || stepIds.includes(step.id)
  const results = SITE_MIGRATION_STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    method: step.method,
    status: included(step) ? 'PENDING' : 'NOT_RUN',
    records: []
  }))
  const publish = () => onUpdate(results.map((r) => ({ ...r })))
  let failedStep = null

  for (let i = 0; i < SITE_MIGRATION_STEPS.length; i++) {
    const step = SITE_MIGRATION_STEPS[i]
    if (!included(step)) continue
    if (failedStep) {
      results[i] = { ...results[i], status: 'SKIPPED', message: `Skipped because step ${failedStep.index + 1} (${failedStep.label}) failed.` }
      publish()
      continue
    }

    results[i] = { ...results[i], status: 'RUNNING' }
    publish()

    const outcome = await runStep(step, contract, company)
    results[i] = {
      ...results[i],
      status: outcome.status,
      error: outcome.error,
      message: outcome.message,
      sourceCount: outcome.sourceCount,
      readUrl: outcome.readUrl,
      records: outcome.records || []
    }
    if (!CONTINUES.has(outcome.status)) failedStep = { index: i, label: step.label }
    publish()
  }

  return results
}
