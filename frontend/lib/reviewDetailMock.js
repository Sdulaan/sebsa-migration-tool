// UI-only mock data for the Review step's 3-column accordion master-detail.
// No API: buildReviewSubTabs() expands the Excel-derived schema
// (lib/erpEntitySchema.js) for a fetched record into the sub-tabs and form
// sections shown in the detail column. Sub-tab names and field names come
// straight from "REST APIs.xlsx"; values are seeded off the record (or taken
// from it when the field is one the record actually carries) so a given
// record always renders the same way.

import { humanizeFieldName } from './migrationStore'
import { recordKey } from './entityRegistry'
import { getEntitySubTabs } from './erpEntitySchema'

// Field names that render as a dropdown, with the options offered.
const SELECT_OPTIONS = {
  Country: ['US', 'SE', 'DE', 'PT', 'ES', 'GB', 'SG'],
  SupplyCountry: ['US', 'SE', 'DE', 'PT'],
  CountryOfOrigin: ['US', 'SE', 'DE', 'PT'],
  CurrencyCode: ['USD', 'SEK', 'EUR', 'GBP', 'SGD'],
  CertificateCurrency: ['USD', 'SEK', 'EUR', 'GBP'],
  DefaultLanguage: ['en', 'sv', 'de', 'pt', 'es'],
  PartyType: ['Customer', 'Supplier', 'Company', 'Owner'],
  CreationMethod: ['Source', 'Template', 'Existing'],
  TemplateId: ['STD', 'BASIC', 'MFG'],
  CustomerCategory: ['Customer', 'Prospect', 'OneTime'],
  SupplierCategory: ['Supplier', 'Manufacturer', 'Distributor'],
  DeliveryTerms: ['EXW', 'FCA', 'DAP', 'DDP', 'CIF', 'IN-1'],
  PurchDeliveryTerms: ['EXW', 'FCA', 'DAP', 'CIF'],
  ShipViaCode: ['MFS', 'FIS', 'AIR', 'SEA'],
  PurchShipViaCode: ['MFS', 'FIS', 'AIR'],
  MediaCode: ['E-mail', 'EDI', 'Print', 'Portal'],
  MessageClass: ['Order', 'Invoice', 'Delivery', 'Reminder'],
  SerialRule: ['Manual', 'Automatic', 'NotDefined'],
  SerialTrackingCode: ['SerialTracking', 'NotSerialTracking'],
  LotTrackingCode: ['LotTracking', 'NotLotTracking'],
  Configurable: ['Configured', 'NotConfigured'],
  SalesType: ['Sales', 'Rental', 'Both'],
  SalesUnitMeas: ['pcs', 'kg', 'box', 'ltr'],
  UnitMeas: ['pcs', 'kg', 'box', 'ltr'],
  UnitCode: ['pcs', 'kg', 'box', 'ltr'],
  PriceUnitMeas: ['pcs', 'kg', 'box'],
  PartStatus: ['A', 'O', 'I'],
  TypeCode: ['Manufactured', 'Purchased', 'Repair'],
  DeliveryType: ['Inventory', 'No inventory', 'Package'],
  AddressTypeCode: ['DELIVERY', 'INVOICE', 'VISIT', 'DOCUMENT'],
  UserSiteType: ['DefaultSite', 'NotDefaultSite'],
  DefaultPaymentWay: ['Bank', 'Cheque', 'Cash'],
  Role: ['Buyer', 'Seller', 'Manager', 'Support'],
  InventoryLocationType: ['Bin', 'Rack', 'Zone'],
  InventoryValuationMethod: ['Weighted Average', 'Standard Cost', 'FIFO'],
  MatchType: ['Order', 'Invoice', 'Receipt'],
  FeeCode: ['VAT', 'GST', 'NONE'],
  TaxCode: ['VAT25', 'VAT12', 'VAT06', 'EXEMPT'],
  ExemptCertificateType: ['Federal', 'State', 'Local']
}

const TEXT_WORDS = ['Standard', 'Primary', 'Default', 'Main', 'Central', 'Global', 'Nordic', 'Prime']

function seed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function fieldType(name) {
  if (SELECT_OPTIONS[name]) return 'select'
  if (/(Date$|Date[A-Z]|^ValidFrom$|^ValidTo$|Until$|IssueDate|ExpiryDate|CreationDate|ValidationDate|NextReview)/.test(name)) return 'date'
  if (/(Db$|^Allow|^Is[A-Z]|^Use[A-Z]|Default$|Exist$|Flag$|OneTime|^B2b|Mandatory|Blocked|^Def[A-Z].*Db|Bidirectional|VariableWeight|Exempt$)/.test(name)) return 'toggle'
  return 'text'
}

function mockText(name, s) {
  if (/name|desc/i.test(name)) return `${TEXT_WORDS[s % TEXT_WORDS.length]} ${humanizeFieldName(name)}`
  if (/(id|no|code|group|ref|series)$/i.test(name)) return `${name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${1000 + (s % 9000)}`
  if (/(qty|factor|level|amount|time|days|no$)/i.test(name)) return String(1 + (s % 500))
  return TEXT_WORDS[(s >> 3) % TEXT_WORDS.length]
}

function fieldValue(name, record, s, type) {
  // Prefer the record's own value when it actually carries this field.
  if (record && record[name] !== undefined && record[name] !== null && record[name] !== '') {
    return record[name]
  }
  if (type === 'toggle') return (s + name.length) % 2 === 0
  if (type === 'date') {
    const y = 2022 + ((s + name.length) % 4)
    const m = String(1 + ((s >> 2) % 12)).padStart(2, '0')
    const d = String(1 + ((s >> 4) % 27)).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (type === 'select') {
    const opts = SELECT_OPTIONS[name]
    return opts[(s + name.length) % opts.length]
  }
  return mockText(name, s + name.length)
}

// Splits a sub-tab's flat field list into one or two cards so the detail view
// reads like a dense data-entry screen rather than one long column.
function toSections(fieldObjs) {
  if (fieldObjs.length <= 6) {
    return [{ title: 'General Information', fields: fieldObjs }]
  }
  const half = Math.ceil(fieldObjs.length / 2)
  return [
    { title: 'General Information', fields: fieldObjs.slice(0, half) },
    { title: 'Additional Information', fields: fieldObjs.slice(half) }
  ]
}

// The sub-tab list (id + name only) for the accordion buttons — straight from
// the Excel schema for this entity.
export function reviewSubTabList(entity) {
  return getEntitySubTabs(entity?.id).map(({ tabId, tabName }) => ({ tabId, tabName }))
}

// Full sub-tabs (with form sections/fields) for one selected record.
export function buildReviewSubTabs(entity, record) {
  if (!entity) return []
  const key = recordKey(entity, record) || JSON.stringify(record || {})

  return getEntitySubTabs(entity.id).map((tab) => {
    const s = seed(`${entity.id}:${key}:${tab.tabId}`)
    const fields = tab.fields.map((name, i) => {
      const type = fieldType(name)
      return {
        id: `${tab.tabId}-${name}-${i}`,
        label: humanizeFieldName(name),
        type,
        value: fieldValue(name, record, s + i * 7, type),
        options: type === 'select' ? SELECT_OPTIONS[name] : undefined
      }
    })
    // A sub-tab the Excel lists with no captured fields still shows the record key.
    const safeFields = fields.length ? fields : [{ id: `${tab.tabId}-key`, label: 'Record Key', type: 'text', value: key }]
    return { tabId: tab.tabId, tabName: tab.tabName, sections: toSections(safeFields) }
  })
}
