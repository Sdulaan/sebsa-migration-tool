import { SOURCE_ENV, fetchSupplierStage, getEnvironmentConfig, humanizeFieldName, postSupplierStage } from './migrationStore'
import { SUPPLIER_STAGES, supplierPayload } from './supplierApi'
import { TX_STATUS, addLogEntry, isAlreadyExistsError } from './transactionLog'

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
function routeKeys(parent, record) {
  const keys = {}
  for (const key of ['SupplierId', 'AddressId', 'Company', 'Identity', 'PartyType']) {
    if (parent[key] != null && record[key] != null && String(parent[key]) !== String(record[key])) {
      throw new Error(`${key} in the Source child does not match its parent Supplier record.`)
    }
    const value = parent[key] ?? record[key]
    if (value != null) keys[key] = value
  }
  return keys
}

export async function fetchSupplierTree(supplier, sourceConfig = getEnvironmentConfig(SOURCE_ENV)) {
  if (!isObject(supplier) || !String(supplier.SupplierId || '').trim()) {
    throw new Error('SupplierId is required to fetch Supplier child records.')
  }
  async function load(parentId, keys) {
    const stages = SUPPLIER_STAGES.filter((stage) => stage.parent === parentId)
    const nodes = []
    for (const stage of stages) {
      const response = await fetchSupplierStage(SOURCE_ENV, sourceConfig, stage.id, keys)
      const node = { stage, keys, records: [], error: response.success ? null : response.error || 'Source request failed.' }
      if (response.success) {
        for (const record of response.records || []) {
          if (!isObject(record)) {
            node.error = 'Source returned an invalid Supplier record.'
            break
          }
          try {
            const childKeys = routeKeys(keys, record)
            node.records.push({ record, keys: childKeys, children: await load(stage.id, childKeys) })
          } catch (err) {
            node.error = err.message
            node.records = []
            break
          }
        }
      }
      nodes.push(node)
    }
    return nodes
  }
  return { supplier, children: await load('supplier_general_information', { SupplierId: supplier.SupplierId }) }
}

function displayFields(record, stageId) {
  const payload = supplierPayload(stageId, record) || {}
  return Object.entries(payload).map(([key, value], index) => ({
    id: `${key}-${index}`,
    label: humanizeFieldName(key),
    type: typeof value === 'boolean' ? 'toggle' : 'text',
    value: value == null ? '' : value,
    readOnly: true
  }))
}

export function supplierTreeTabs(tree) {
  const allNodes = []
  function collect(nodes) {
    nodes.forEach((node) => {
      allNodes.push(node)
      node.records.forEach((item) => collect(item.children))
    })
  }
  collect(tree.children)
  return SUPPLIER_STAGES.map((stage) => {
    const records = stage.id === 'supplier_general_information' ? [tree.supplier]
      : allNodes.filter((node) => node.stage.id === stage.id).flatMap((node) => node.records.map((item) => item.record))
    const sections = records.map((record, index) => ({
      title: records.length === 1 ? stage.label : `${stage.label} ${index + 1}`,
      fields: displayFields(record, stage.id)
    }))
    allNodes.filter((node) => node.stage.id === stage.id && node.error).forEach((node) => {
      sections.push({ title: `${stage.label} — Source error: ${node.error}`, fields: [] })
    })
    if (sections.length === 0) sections.push({ title: `No ${stage.label} records`, fields: [] })
    return { tabId: stage.id, tabName: stage.label, sections }
  })
}

function childStatus(result) {
  if (!result) return TX_STATUS.UNCONFIRMED
  if (result.local) return TX_STATUS.FAILED
  if (result.httpStatus == null) return TX_STATUS.UNCONFIRMED
  if (result.httpStatus >= 200 && result.httpStatus < 300) return TX_STATUS.SUCCESS
  return isAlreadyExistsError(result) ? TX_STATUS.ALREADY_EXISTS : TX_STATUS.FAILED
}

export async function transferSupplierChildren({ supplier, destEnv, destConfig, log, shouldCancel = () => false, chunkSize = 50, onProgress = () => {} }) {
  const entity = { id: 'supplier', label: 'Supplier' }
  const supplierId = supplier.SupplierId
  let tree
  try {
    tree = await fetchSupplierTree(supplier)
  } catch (err) {
    addLogEntry(log, { entity, key: `${supplierId} / child records`, status: TX_STATUS.FAILED, message: `Could not fetch Supplier child records: ${err.message}`, indexed: false })
    return
  }
  async function transferNodes(nodes) {
    for (const node of nodes) {
      const stage = node.stage
      onProgress({ stageLabel: stage.label })
      if (node.error) {
        addLogEntry(log, { entity, key: `${supplierId} / ${stage.label}`, status: TX_STATUS.FAILED, message: node.error, indexed: false })
        continue
      }
      for (let start = 0; start < node.records.length; start += chunkSize) {
        const chunk = node.records.slice(start, start + chunkSize)
        if (shouldCancel()) {
          chunk.concat(node.records.slice(start + chunk.length)).forEach((item) => {
            addLogEntry(log, { entity, key: `${supplierId} / ${stage.label}`, status: TX_STATUS.SKIPPED, skippedBecause: 'Transfer cancelled', payload: supplierPayload(stage.id, item.record), indexed: false })
          })
          return
        }
        const response = await postSupplierStage(destEnv, destConfig, stage.id, chunk.map((item) => ({ record: item.record, keys: node.keys })))
        for (const [index, item] of chunk.entries()) {
          const result = response.success ? response.results?.[index] : { httpStatus: null, error: response.error || 'Supplier batch failed.', local: true }
          const status = childStatus(result)
          const suffix = item.record.AddressId || item.record.Company || item.record.WayId || item.record.SequenceNo || index + start + 1
          addLogEntry(log, {
            entity,
            key: `${supplierId} / ${stage.label} / ${suffix}`,
            status,
            httpStatus: result?.httpStatus ?? null,
            message: status === TX_STATUS.UNCONFIRMED ? 'No identifiable response. Check destination before retrying.' : result?.error || '',
            errorCode: result?.errorCode || null,
            payload: supplierPayload(stage.id, item.record),
            indexed: false
          })
          if (status === TX_STATUS.SUCCESS || status === TX_STATUS.ALREADY_EXISTS) await transferNodes(item.children)
          else if (item.children.length > 0) {
            addLogEntry(log, { entity, key: `${supplierId} / ${stage.label} / dependent records`, status: TX_STATUS.SKIPPED, skippedBecause: `${stage.label} was not confirmed in destination`, indexed: false })
          }
        }
      }
    }
  }
  await transferNodes(tree.children)
}
