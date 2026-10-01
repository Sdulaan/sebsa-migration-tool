// SupplierHandling navigation paths and create fields from the supplied IFS examples.
// Parent keys are used only for routing; the JSON body keeps the source values.
import tabs from './entityTabsConfig.json'

const tabFields = Object.fromEntries(tabs.supplier.map((tab) => [tab.tabId, tab.fields]))

export const SUPPLIER_STAGES = [
  { id: 'supplier_general_information', label: 'General Information', nav: '', keys: [], identity: ['SupplierId'] },
  { id: 'supplier_address', label: 'Address', nav: 'SupplierInfoAddresses', keys: ['SupplierId'], identity: ['AddressId'] },
  { id: 'address_types', label: 'Address Types', nav: 'AddressTypes', keys: ['SupplierId', 'AddressId'], identity: ['AddressTypeCode'] },
  { id: 'communication_method', label: 'Communication Method', nav: 'AddressCommunicationMethods', keys: ['SupplierId', 'AddressId'], identity: ['MethodId', 'Value'] },
  { id: 'contact', label: 'Contact', nav: 'SupplierInfoContacts', keys: ['SupplierId', 'SupplierAddress'], identity: ['PersonId'] },
  { id: 'delivery_tax_information', label: 'Delivery Tax Information', nav: 'SupplierDeliveryTaxInfoArray', keys: ['SupplierId', 'AddressId'], identity: ['Company'] },
  { id: 'taxes', label: 'Taxes', nav: 'SupplierDeliveryTaxCodeArray', keys: ['SupplierId', 'AddressId', 'Company'], identity: ['TaxCode'] },
  { id: 'purchase_address_information', label: 'Purchase Address Information', nav: 'SupplierAddresses', keys: ['SupplierId', 'AddressId'], identity: ['AddressId'] },
  { id: 'outbound_address_information', label: 'Outbound Address Information', nav: 'SuppOutboundAddrInfoArray', keys: ['SupplierId', 'AddressId'], identity: ['AddressId'] },
  { id: 'supplier_message_setup', label: 'Message Setup', nav: 'MessageSetups', keys: ['SupplierId'], identity: ['SequenceNo'] },
  { id: 'supplier_invoice', label: 'Invoice', nav: 'SupplierInvoiceCompanies', keys: ['SupplierId'], identity: ['Company'] },
  { id: 'supplier_payment', label: 'Payment', nav: 'SupplierPayments', keys: ['SupplierId'], identity: ['Company', 'Identity'] },
  { id: 'payment_methods', label: 'Payment Methods', nav: 'PaymentWayArray', keys: ['SupplierId', 'Company', 'Identity', 'PartyType'], identity: ['WayId'] },
  { id: 'supplier_purchase', label: 'Purchase', nav: 'SupplierPurchases', keys: ['SupplierId'], identity: ['VendorNo'] }
]

export function supplierStage(id) {
  return SUPPLIER_STAGES.find((stage) => stage.id === id) || null
}

function key(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required for supplier URL routing.`)
  return encodeURIComponent(value.replace(/'/g, "''"))
}

export function supplierRelativePath(stageId, values) {
  const stage = supplierStage(stageId)
  if (!stage) throw new Error(`Unknown supplier stage "${stageId}".`)
  let path = 'SupplierInfoGeneralSet'
  if (!stage.nav) return path
  const supplierId = values.SupplierId || values.Identity || values.VendorNo
  const supplier = key(supplierId, 'SupplierId')
  path += `(SupplierId='${supplier}')`
  if (stage.keys.includes('AddressId') || stageId === 'contact') {
    const addressId = stageId === 'contact' ? values.SupplierAddress : values.AddressId
    const address = key(addressId, 'AddressId')
    path += `/SupplierInfoAddresses(SupplierId='${supplier}',AddressId='${address}')`
    if (stageId === 'taxes') {
      const company = key(values.Company, 'Company')
      path += `/SupplierDeliveryTaxInfoArray(SupplierId='${supplier}',AddressId='${address}',Company='${company}')`
    }
  }
  if (stageId === 'payment_methods') {
    const company = key(values.Company, 'Company')
    const identity = key(values.Identity, 'Identity')
    const partyType = key(values.PartyType, 'PartyType')
    path += `/SupplierPayments(Company='${company}',Identity='${identity}',PartyType=IfsApp.SupplierHandling.PartyType'${partyType}')`
  }
  return `${path}/${stage.nav}`
}

export function supplierPayload(stageId, record) {
  const fields = tabFields[stageId]
  if (!fields) throw new Error(`Unknown supplier stage "${stageId}".`)
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {}
  // Tax fields were missing from the generated tab schema; use the supplied sample.
  const allowed = stageId === 'taxes' ? ['SupplierId', 'AddressId', 'Company', 'TaxCode', 'ValidationDate']
    : stageId === 'supplier_message_setup' ? ['Address', ...fields] : fields
  return Object.fromEntries(allowed.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]]))
}
