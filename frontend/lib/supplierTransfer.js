import { SOURCE_ENV, fetchSupplierStage, postSupplierStage, visibleRecordFields } from './migrationStore'
import { SUPPLIER_STAGES, supplierPayload } from './supplierApi'
import { TX_STATUS, addLogEntry, isAlreadyExistsError } from './transactionLog'

const children = [
  { stage: 'supplier_address', parent: 'supplier_general_information' },
  { stage: 'address_types', parent: 'supplier_address' },
  { stage: 'communication_method', parent: 'supplier_address' },
  { stage: 'contact', parent: 'supplier_address' },
  { stage: 'delivery_tax_information', parent: 'supplier_address' },
  { stage: 'taxes', parent: 'delivery_tax_information' },
  { stage: 'purchase_address_information', parent: 'supplier_address' },
  { stage: 'outbound_address_information', parent: 'supplier_address' },
  { stage: 'supplier_message_setup', parent: 'supplier_general_information' },
  { stage: 'supplier_invoice', parent: 'supplier_general_information' },
  { stage: 'supplier_payment', parent: 'supplier_general_information' },
  { stage: 'payment_methods', parent: 'supplier_payment' },
  { stage: 'supplier_purchase', parent: 'supplier_general_information' }
]

export async function fetchSupplierTree(supplier, sourceConfig) {
  const root = { id: 'root', stage: 'supplier_general_information', record: supplier, route: { SupplierId: supplier.SupplierId }, parentId: null }
  const nodes = [root]
  const errors = []
  for (const { stage, parent } of children) {
    const parents = nodes.filter((node) => node.stage === parent)
    const responses = await Promise.all(parents.map((node) => fetchSupplierStage(SOURCE_ENV, sourceConfig, stage, node.route)))
    responses.forEach((res, i) => {
      const parentNode = parents[i]
      if (!res.success) {
        errors.push({ stage, parentId: parentNode.id, error: res.error })
        return
      }
      ;(res.records || []).forEach((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          errors.push({ stage, parentId: parentNode.id, error: `Source returned an invalid record at position ${index + 1}.` })
          return
        }
        if (record.SupplierId != null && record.SupplierId !== supplier.SupplierId) {
          errors.push({ stage, parentId: parentNode.id, error: `Source returned a record for a different supplier at position ${index + 1}.` })
          return
        }
        if (parent !== 'supplier_general_information' && record.AddressId != null && parentNode.route.AddressId != null && record.AddressId !== parentNode.route.AddressId) {
          errors.push({ stage, parentId: parentNode.id, error: `Source returned a record for a different address at position ${index + 1}.` })
          return
        }
        if (stage === 'contact' && record.SupplierAddress != null && record.SupplierAddress !== parentNode.route.AddressId) {
          errors.push({ stage, parentId: parentNode.id, error: `Source returned a contact for a different address at position ${index + 1}.` })
          return
        }
        if (stage === 'payment_methods' && ['Company', 'Identity', 'PartyType'].some((field) => record[field] != null && record[field] !== parentNode.route[field])) {
          errors.push({ stage, parentId: parentNode.id, error: `Source returned a payment method for a different payment at position ${index + 1}.` })
          return
        }
        const id = `${stage}:${parentNode.id}:${index}`
        const route = { ...parentNode.route }
        for (const field of ['AddressId', 'Company', 'Identity', 'PartyType', 'VendorNo']) {
          if (record[field] != null) route[field] = record[field]
        }
        if (record.SupplierAddress != null) route.SupplierAddress = record.SupplierAddress
        else if (record.AddressId != null) route.SupplierAddress = record.AddressId
        nodes.push({ id, stage, parentId: parentNode.id, record, route })
      })
    })
  }
  return { nodes, errors }
}

export function supplierTreeTabs(tree) {
  return SUPPLIER_STAGES.map((stage) => {
    const stageNodes = tree.nodes.filter((node) => node.stage === stage.id)
    const stageErrors = tree.errors.filter((error) => error.stage === stage.id)
    const sections = stageNodes.map((node, index) => ({
      title: `${stage.label} ${stageNodes.length > 1 ? index + 1 : ''}`.trim(),
      fields: visibleRecordFields(node.record).map(([label, value], i) => ({ id: `${label}-${i}`, label, type: 'text', value: value == null ? '' : String(value) }))
    }))
    stageErrors.forEach(({ error }) => sections.push({ title: 'Could not load', fields: [{ id: 'error', label: 'Error', type: 'text', value: error }] }))
    if (sections.length === 0) sections.push({ title: 'No records found', fields: [] })
    return { tabId: stage.id, tabName: stage.label, sections }
  })
}

function resultStatus(result) {
  if (result?.local) return TX_STATUS.FAILED
  if (result?.httpStatus == null) return TX_STATUS.UNCONFIRMED
  if (result.httpStatus >= 200 && result.httpStatus < 300) return TX_STATUS.SUCCESS
  return isAlreadyExistsError(result) ? TX_STATUS.ALREADY_EXISTS : TX_STATUS.FAILED
}

export async function transferSupplierChildren({ supplier, sourceConfig, destEnv, destConfig, log, shouldCancel, onProgress = () => {}, chunkSize = 50 }) {
  const tree = await fetchSupplierTree(supplier, sourceConfig)
  const statusById = { root: TX_STATUS.SUCCESS }
  for (const error of tree.errors) {
    const stage = SUPPLIER_STAGES.find((item) => item.id === error.stage)
    addLogEntry(log, { entity: { id: 'supplier', label: `Supplier / ${stage.label}` }, key: `${supplier.SupplierId} / ${stage.label}`, status: TX_STATUS.FAILED, message: `Supplier source error: ${error.error}`, indexed: false })
  }
  for (const { stage: stageId } of children) {
    const stage = SUPPLIER_STAGES.find((item) => item.id === stageId)
    const nodes = tree.nodes.filter((node) => node.stage === stageId)
    const ready = []
    for (const node of nodes) {
      const payload = supplierPayload(stageId, node.record)
      const key = `${supplier.SupplierId} / ${stage.label} / ${stage.identity.map((field) => node.record[field] ?? '').join(' / ')}`
      const entry = { node, key, payload }
      if (![TX_STATUS.SUCCESS, TX_STATUS.ALREADY_EXISTS].includes(statusById[node.parentId])) {
        statusById[node.id] = TX_STATUS.SKIPPED
        addLogEntry(log, { entity: { id: 'supplier', label: `Supplier / ${stage.label}` }, key, status: TX_STATUS.SKIPPED, skippedBecause: 'Parent record was not created', payload, indexed: false })
      } else ready.push(entry)
    }
    for (let start = 0; start < ready.length; start += chunkSize) {
      const chunk = ready.slice(start, start + chunkSize)
      const cancelled = shouldCancel()
      const response = cancelled ? null : await postSupplierStage(destEnv, destConfig, stageId,
        chunk.map((item) => item.payload), chunk.map(({ node }) => node.route))
      chunk.forEach(({ node, key, payload }, i) => {
        const result = response?.results?.[i]
        const status = cancelled ? TX_STATUS.SKIPPED : response?.success ? resultStatus(result) : TX_STATUS.FAILED
        statusById[node.id] = status
        addLogEntry(log, {
          entity: { id: 'supplier', label: `Supplier / ${stage.label}` }, key, status,
          httpStatus: result?.httpStatus ?? null,
          errorCode: result?.errorCode ?? null,
          message: cancelled ? '' : response?.success ? result?.error || (status === TX_STATUS.SUCCESS ? 'Created' : '') : response?.error || 'Supplier batch failed',
          skippedBecause: cancelled ? 'Transfer cancelled' : '', payload, indexed: false
        })
      })
      onProgress({ stageLabel: stage.label })
    }
  }
}
