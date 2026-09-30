// Runs a transfer: POSTs the selected records to the destination entity by
// entity, parents first, and records every record's outcome in the
// transaction log. A record whose parent (Company for a Site, Site for an
// Inventory Part, ...) was in this transfer but didn't make it into the
// destination is not sent — it's logged as skipped, which in turn skips its
// own children.
//
// Runs in the browser, one server call per chunk, so progress is live and no
// single server call runs long enough to hit a hosting timeout.

import {
  orderEntitiesForTransfer,
  recordKey,
  missingKeyFields,
  parentKeys,
  buildEntityPayload
} from './entityRegistry'
import {
  TX_STATUS,
  TX_STATUS_LABELS,
  addLogEntry,
  hasEntry,
  statusOf,
  isParentSatisfied,
  isAlreadyExistsError
} from './transactionLog'
import { postEntityBatch } from './migrationStore'
import { runOneCompanyMigration } from './companyMigrationRunner'

function posterFor(entity) {
  return (env, config, records) => postEntityBatch(entity.id, env, config, records)
}

export const DEFAULT_CHUNK_SIZE = 50

function classify(result) {
  if (result.httpStatus === null || result.httpStatus === undefined) {
    return result.local ? TX_STATUS.FAILED : TX_STATUS.UNCONFIRMED
  }
  if (result.httpStatus >= 200 && result.httpStatus < 300) return TX_STATUS.SUCCESS
  if (isAlreadyExistsError(result)) return TX_STATUS.ALREADY_EXISTS
  return TX_STATUS.FAILED
}

function messageFor(status, result) {
  if (status === TX_STATUS.SUCCESS) return 'Created'
  if (status === TX_STATUS.UNCONFIRMED) {
    return `${result.error || 'No identifiable response'}. It may or may not have been created — check the destination before retrying.`
  }
  return result.error || ''
}

// recordsByEntity: { [entityId]: sourceRecord[] } — the selected records.
// onProgress({ entityId, sent, toSend }) is called after every chunk.
// shouldCancel() is checked between chunks; anything not yet sent is then
// logged as skipped.
export async function runTransfer({
  log,
  entityIds,
  recordsByEntity,
  destEnv,
  destConfig,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress = () => {},
  shouldCancel = () => false
}) {
  for (const entity of orderEntitiesForTransfer(entityIds)) {
    const records = recordsByEntity[entity.id] || []
    const toSend = []

    for (const [order, record] of records.entries()) {
      const key = recordKey(entity, record)
      const payload = buildEntityPayload(entity, record)

      const missing = missingKeyFields(entity, record)
      if (missing.length > 0) {
        addLogEntry(log, { entity, key, status: TX_STATUS.FAILED, message: `Missing key field(s): ${missing.join(', ')}`, payload, order })
        continue
      }
      if (hasEntry(log, entity.id, key)) {
        addLogEntry(log, { entity, key, status: TX_STATUS.SKIPPED, skippedBecause: 'Duplicate of an earlier record in this transfer', payload, order, indexed: false })
        continue
      }

      const blocked = parentKeys(entity, record).filter((p) => !isParentSatisfied(log, p.entity, p.key))
      if (blocked.length > 0) {
        const reason = blocked
          .map((p) => `${p.label} ${p.key} ${TX_STATUS_LABELS[statusOf(log, p.entity, p.key)].toLowerCase()}`)
          .join('; ')
        addLogEntry(log, { entity, key, status: TX_STATUS.SKIPPED, skippedBecause: reason, payload, order })
        continue
      }

      toSend.push({ key, payload, order })
    }

    let sent = 0
    onProgress({ entityId: entity.id, sent, toSend: toSend.length })

    // Company has a real, confirmed-working create flow (CreateNewCompany
    // for the header, then 22 sub-entity steps — Address, Tax Control,
    // Invoice, ...) that looks nothing like the generic "$batch POST to the
    // entity set" every other registry entity uses, and produces many log
    // entries (one per step, not one per company). Runs one company fully
    // before starting the next, same as the standalone CompanySet page's
    // migration dialog — reuses that exact runner so both paths behave
    // identically. Company has no `references`, so `blocked` above is moot.
    if (entity.id === 'company') {
      for (const { key, payload, order } of toSend) {
        if (shouldCancel()) {
          addLogEntry(log, { entity, key, status: TX_STATUS.SKIPPED, skippedBecause: 'Transfer cancelled', payload, order })
          continue
        }
        await runOneCompanyMigration({
          company: { co: key, record: payload },
          log,
          stepIds: null // every sub-entity step, not just the header
        })
        sent += 1
        onProgress({ entityId: entity.id, sent, toSend: toSend.length })
      }
      continue
    }

    for (let start = 0; start < toSend.length; start += chunkSize) {
      const chunk = toSend.slice(start, start + chunkSize)

      if (shouldCancel()) {
        toSend.slice(start).forEach(({ key, payload, order }) => {
          addLogEntry(log, { entity, key, status: TX_STATUS.SKIPPED, skippedBecause: 'Transfer cancelled', payload, order })
        })
        break
      }

      const res = await posterFor(entity)(destEnv, destConfig, chunk.map((c) => c.payload))

      if (!res.success) {
        // The batch as a whole was rejected before IFS looked at any record.
        chunk.forEach(({ key, payload, order }) => {
          addLogEntry(log, { entity, key, status: TX_STATUS.FAILED, message: res.error, payload, order })
        })
      } else {
        chunk.forEach(({ key, payload, order }, i) => {
          const result = res.results[i]
          const status = classify(result)
          addLogEntry(log, {
            entity,
            key,
            status,
            httpStatus: result.httpStatus,
            message: messageFor(status, result),
            errorCode: result.errorCode,
            payload,
            order
          })
        })
      }

      sent += chunk.length
      onProgress({ entityId: entity.id, sent, toSend: toSend.length })
    }
  }

  log.finishedAt = new Date().toISOString()
  return log
}
