import tabsConfig from './entityTabsConfig.json'

// Source navigation and destination POST bodies from the supplied SupplierHandling examples.
// Parent keys route a request; only fields listed for its POST become body attributes.
const definitions = [
  ['supplier_general_information', 'SupplierInfoGeneralSet', null, []],
  ['supplier_address', 'SupplierInfoAddresses', 'supplier_general_information', ['SupplierId']],
  ['address_types', 'AddressTypes', 'supplier_address', ['SupplierId', 'AddressId']],
  ['communication_method', 'AddressCommunicationMethods', 'supplier_address', ['SupplierId', 'AddressId']],
  ['contact', 'SupplierInfoContacts', 'supplier_address', ['SupplierId', 'AddressId']],
  ['delivery_tax_information', 'SupplierDeliveryTaxInfoArray', 'supplier_address', ['SupplierId', 'AddressId']],
  ['taxes', 'SupplierDeliveryTaxCodeArray', 'delivery_tax_information', ['SupplierId', 'AddressId', 'Company']],
  ['purchase_address_information', 'SupplierAddresses', 'supplier_address', ['SupplierId', 'AddressId']],
  ['outbound_address_information', 'SuppOutboundAddrInfoArray', 'supplier_address', ['SupplierId', 'AddressId']],
  ['supplier_message_setup', 'MessageSetups', 'supplier_general_information', ['SupplierId']],
  ['supplier_invoice', 'SupplierInvoiceCompanies', 'supplier_general_information', ['SupplierId']],
  ['supplier_payment', 'SupplierPayments', 'supplier_general_information', ['SupplierId']],
  ['payment_methods', 'PaymentWayArray', 'supplier_payment', ['SupplierId', 'Company', 'Identity', 'PartyType']],
  ['supplier_purchase', 'SupplierPurchases', 'supplier_general_information', ['SupplierId']]
]

export const SUPPLIER_STAGES = definitions.map(([id, collection, parent, parentKeys]) => {
  const tab = tabsConfig.supplier.find((item) => item.tabId === id)
  const extraFields = id === 'taxes' ? ['SupplierId', 'AddressId', 'Company', 'TaxCode', 'ValidationDate']
    : id === 'supplier_message_setup' ? ['Address'] : []
  return { id, label: tab.tabName, collection, parent, parentKeys, fields: [...new Set([...tab.fields, ...extraFields])] }
})

export const SUPPLIER_GENERAL_FIELDS = SUPPLIER_STAGES[0].fields

export function supplierStage(id) {
  return SUPPLIER_STAGES.find((stage) => stage.id === id) || null
}

export function supplierPayload(id, record) {
  const stage = supplierStage(id)
  if (!stage || !record || typeof record !== 'object' || Array.isArray(record)) return null
  return Object.fromEntries(stage.fields.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]))
}

function quoted(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required for Supplier URL routing.`)
  return encodeURIComponent(value.replace(/'/g, "''"))
}

export function supplierStagePath(id, keys = {}) {
  const stage = supplierStage(id)
  if (!stage) throw new Error(`Unknown Supplier stage "${id}".`)
  if (id === 'supplier_general_information') return stage.collection
  const supplier = quoted(keys.SupplierId, 'SupplierId')
  let path = `SupplierInfoGeneralSet(SupplierId='${supplier}')`
  if (stage.parentKeys.includes('AddressId')) {
    const address = quoted(keys.AddressId, 'AddressId')
    path += `/SupplierInfoAddresses(SupplierId='${supplier}',AddressId='${address}')`
  }
  if (id === 'payment_methods') {
    const company = quoted(keys.Company, 'Company')
    const identity = quoted(keys.Identity, 'Identity')
    const partyType = quoted(keys.PartyType, 'PartyType')
    path += `/SupplierPayments(Company='${company}',Identity='${identity}',PartyType=IfsApp.SupplierHandling.PartyType'${partyType}')`
  }
  if (id === 'taxes') {
    const company = quoted(keys.Company, 'Company')
    path += `/SupplierDeliveryTaxInfoArray(SupplierId='${supplier}',AddressId='${quoted(keys.AddressId, 'AddressId')}',Company='${company}')`
  }
  return `${path}/${stage.collection}`
}
