// The transaction log for one transfer run: one entry per selected record,
// saying what happened to it in the destination. The transfer runner uses it
// to decide whether a child record's parents made it (see isParentSatisfied)
// and it is what the Excel export is built from. Plain data, kept in memory
// for the run — the Excel file is the permanent record.

export const TX_STATUS = {
  SUCCESS: 'SUCCESS',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  UNCONFIRMED: 'UNCONFIRMED'
}

export const TX_STATUS_LABELS = {
  SUCCESS: 'Success',
  ALREADY_EXISTS: 'Already exists',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
  UNCONFIRMED: 'Unconfirmed'
}

// Statuses that mean the record is in the destination, so its children can go.
const SATISFIED = new Set([TX_STATUS.SUCCESS, TX_STATUS.ALREADY_EXISTS])

export function createTransactionLog({ fromEnv, toEnv, sourceBaseUrl, destBaseUrl, entities }) {
  return {
    runId: `${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    fromEnv,
    toEnv,
    sourceBaseUrl,
    destBaseUrl,
    entities: entities.map((e) => ({ id: e.id, label: e.label })),
    entries: [],
    // entityId -> key -> status, for parent lookups.
    statusIndex: {}
  }
}

export function addLogEntry(log, { entity, key, status, httpStatus = null, message = '', errorCode = null, skippedBecause = '', payload = null, order = null, indexed = true }) {
  const entry = {
    entity: entity.id,
    entityLabel: entity.label,
    key,
    status,
    httpStatus,
    message,
    errorCode,
    skippedBecause,
    payload,
    // Position among the entity's selected records, so the Excel sheet can
    // list records in source order.
    order,
    timestamp: new Date().toISOString()
  }
  log.entries.push(entry)
  if (key && indexed) {
    log.statusIndex[entity.id] = log.statusIndex[entity.id] || {}
    log.statusIndex[entity.id][key] = status
  }
  return entry
}

export function statusOf(log, entityId, key) {
  return log.statusIndex[entityId]?.[key]
}

export function hasEntry(log, entityId, key) {
  return statusOf(log, entityId, key) !== undefined
}

// A parent record that wasn't part of this transfer is assumed to already be
// in the destination (if it isn't, IFS rejects the child and it's logged as
// failed). One that was part of it must have succeeded or already existed.
export function isParentSatisfied(log, entityId, key) {
  const status = statusOf(log, entityId, key)
  return status === undefined || SATISFIED.has(status)
}

// IFS refuses to create a record whose key is taken. For this tool that means
// the record is already in the destination, which is what we wanted.
export function isAlreadyExistsError({ httpStatus, error, errorCode }) {
  if (httpStatus === 409) return true
  return /already exists?|\.EXIST\b|DUPLICATE|unique constraint/i.test(`${errorCode || ''} ${error || ''}`)
}

function emptyCounts() {
  return { total: 0, SUCCESS: 0, ALREADY_EXISTS: 0, FAILED: 0, SKIPPED: 0, UNCONFIRMED: 0 }
}

// Counts per entity (in log.entities order) plus overall totals.
export function summarizeLog(log) {
  const byEntity = Object.fromEntries(log.entities.map((e) => [e.id, { ...e, ...emptyCounts() }]))
  const totals = emptyCounts()
  log.entries.forEach((entry) => {
    const counts = byEntity[entry.entity]
    if (!counts) return
    counts.total += 1
    counts[entry.status] += 1
    totals.total += 1
    totals[entry.status] += 1
  })
  return { entities: Object.values(byEntity), totals }
}
