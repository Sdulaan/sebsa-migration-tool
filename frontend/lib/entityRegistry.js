// The one place every transferable IFS entity is described. Adding an entity
// to the transfer flow means adding an entry here — the generic GET route
// (/api/ifs/entity), the generic $batch route (/api/ifs/batch), the transfer
// runner and the Excel log all work from these definitions. Safe to import
// from both client and server code (no secrets, no browser APIs).
//
// Entry shape:
//   id          stable id (also stored in migration history — don't rename)
//   label       display name
//   group       'mandatory' | 'basic' (which "Transfer ..." step it belongs to)
//   projection  IFS projection service, e.g. 'PartHandling.svc'
//   entitySet   entity set to GET from and POST to, e.g. 'PartCatalogSet'
//   keyFields   fields that identify one record (its key in the transaction log)
//   titleField  field shown as the record's title in the review list
//   references  record-level parents: [{ entity, fields: { childField: parentField } }].
//               A record is skipped when a referenced parent record was part
//               of the same transfer and did not make it into the destination.
//   dependsOn   entity-level prerequisites for the Select Entities step and
//               the transfer order (referenced entities are added automatically)
//   fields      optional POST allow-list (and order); without one, the
//               source record is sent minus OData/system bookkeeping fields
//   fixedValues optional { field: value } always sent in place of the
//               source record's value (only with `fields`)
//   verified    what has been confirmed against a real tenant: 'post' | 'get' | null.
//               Unverified entries use the standard IFS Cloud projection
//               names — check them against your tenant's API Explorer.

import {
  SALES_PART_MIGRATION_FIELDS,
  PART_CATALOG_MIGRATION_FIELDS,
  INVENTORY_PART_MIGRATION_FIELDS,
  PURCHASE_PART_MIGRATION_FIELDS,
  PART_CATALOG_FIXED_VALUES,
  pickPayloadFields
} from './migrationFields'

export const ENTITY_GROUPS = [
  { id: 'mandatory', label: 'Transfer Mandatory Data' },
  { id: 'basic', label: 'Transfer Basic Data' }
]

const DEFINITIONS = [
  {
    id: 'company',
    label: 'Company',
    description: 'Company master records',
    group: 'mandatory',
    projection: 'CompanyHandling.svc',
    entitySet: 'CompanySet',
    keyFields: ['Company'],
    titleField: 'Name',
    references: [],
    dependsOn: [],
    // GET is this entity set, confirmed against a real environment. POST is
    // NOT a plain $batch to CompanySet — a real create needs the
    // CreateNewCompany assistant action (different fields, different
    // endpoint entirely). transferRunner.js special-cases 'company' to
    // postCompanyHeaderBatch instead of the generic postEntityBatch this
    // `entitySet`/`fields` config implies; `fields` is left unset here
    // because it isn't used for Company's POST at all. Sub-entities (Address,
    // Tax Control, ...) are read-only in Review Data for now — see
    // lib/companyReviewData.js — and are not part of the transfer yet.
    verified: 'get'
  },
  {
    id: 'site',
    label: 'Site',
    description: 'Company site records',
    group: 'mandatory',
    projection: 'CompanySiteHandling.svc',
    entitySet: 'CompanySiteSet',
    keyFields: ['Contract'],
    titleField: 'Description',
    references: [{ entity: 'company', fields: { Company: 'Company' } }],
    dependsOn: ['company'],
    verified: null
  },
  {
    id: 'customer',
    label: 'Customer',
    description: 'Customer master records',
    group: 'basic',
    projection: 'CustomerHandling.svc',
    entitySet: 'CustomerInfoSet',
    keyFields: ['CustomerId'],
    titleField: 'Name',
    references: [],
    dependsOn: ['company', 'site'],
    // Selectable in the review list; not transferred yet (header only).
    subMenu: ['Address', 'Contact', 'Communication Method'],
    verified: null
  },
  {
    id: 'masterPart',
    label: 'Master Part',
    description: 'Part catalog (master part) records',
    group: 'basic',
    projection: 'PartHandling.svc',
    entitySet: 'PartCatalogSet',
    keyFields: ['PartNo'],
    titleField: 'Description',
    references: [],
    dependsOn: ['company', 'site'],
    fields: PART_CATALOG_MIGRATION_FIELDS,
    fixedValues: PART_CATALOG_FIXED_VALUES,
    verified: 'post'
  },
  {
    id: 'inventoryPart',
    label: 'Inventory Part',
    description: 'Inventory part records per site',
    group: 'basic',
    projection: 'InventoryPartHandling.svc',
    entitySet: 'InventoryPartSet',
    keyFields: ['Contract', 'PartNo'],
    titleField: 'Description',
    references: [
      { entity: 'site', fields: { Contract: 'Contract' } },
      { entity: 'masterPart', fields: { PartNo: 'PartNo' } }
    ],
    dependsOn: ['company', 'site', 'masterPart'],
    fields: INVENTORY_PART_MIGRATION_FIELDS,
    verified: null
  },
  {
    id: 'purchasePart',
    label: 'Purchase Part',
    description: 'Purchase part records per site',
    group: 'basic',
    projection: 'PurchasePartHandling.svc',
    entitySet: 'PurchasePartSet',
    keyFields: ['Contract', 'PartNo'],
    titleField: 'Description',
    references: [
      { entity: 'site', fields: { Contract: 'Contract' } },
      { entity: 'masterPart', fields: { PartNo: 'PartNo' } }
    ],
    dependsOn: ['company', 'site', 'masterPart'],
    fields: PURCHASE_PART_MIGRATION_FIELDS,
    verified: null
  },
  {
    id: 'salesPart',
    label: 'Sales Part',
    description: 'Sales part records per site',
    group: 'basic',
    projection: 'SalesPartHandling.svc',
    entitySet: 'SalesPartSet',
    keyFields: ['Contract', 'CatalogNo'],
    titleField: 'CatalogDesc',
    references: [
      { entity: 'site', fields: { Contract: 'Contract' } },
      { entity: 'inventoryPart', fields: { Contract: 'Contract', PartNo: 'PartNo' } }
    ],
    dependsOn: ['company', 'site'],
    fields: SALES_PART_MIGRATION_FIELDS,
    verified: 'get'
  },
  {
    id: 'supplier',
    label: 'Supplier',
    description: 'Supplier master records',
    group: 'basic',
    projection: 'SupplierHandling.svc',
    entitySet: 'SupplierInfoSet',
    keyFields: ['SupplierId'],
    titleField: 'Name',
    references: [],
    dependsOn: ['company', 'site'],
    verified: null
  },
  {
    id: 'inventoryLocations',
    label: 'Inventory Locations',
    description: 'Inventory location records',
    group: 'basic',
    projection: 'InventoryLocationsHandling.svc',
    entitySet: 'InventoryLocationSet',
    keyFields: ['Contract', 'LocationNo'],
    titleField: 'LocationName',
    references: [{ entity: 'site', fields: { Contract: 'Contract' } }],
    dependsOn: ['company', 'site'],
    verified: null
  }
]

// Referenced entities always count as prerequisites, so the order and the
// Select Entities check can't miss a parent the records actually point at.
export const AVAILABLE_ENTITIES = DEFINITIONS.map((entity) => ({
  enabled: true,
  fields: null,
  fixedValues: null,
  subMenu: null,
  ...entity,
  dependsOn: [...new Set([...entity.dependsOn, ...entity.references.map((r) => r.entity)])]
}))

export function getEntity(id) {
  return AVAILABLE_ENTITIES.find((e) => e.id === id) || null
}

// Parents before children. Entities that aren't in `ids` are left out, even
// when something in `ids` depends on them.
export function orderEntitiesForTransfer(ids) {
  const wanted = new Set(ids)
  const ordered = []
  const visited = new Set()
  function visit(id) {
    if (visited.has(id)) return
    visited.add(id)
    const entity = getEntity(id)
    if (!entity) return
    entity.dependsOn.forEach(visit)
    if (wanted.has(id)) ordered.push(entity)
  }
  AVAILABLE_ENTITIES.forEach((e) => visit(e.id))
  return ordered
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

// "C01" for a single key field, "S1 | P-100" for composite keys.
export function recordKey(entity, record) {
  return entity.keyFields.map((f) => (isBlank(record?.[f]) ? '' : String(record[f]))).join(' | ')
}

export function missingKeyFields(entity, record) {
  return entity.keyFields.filter((f) => isBlank(record?.[f]))
}

// The parent records a child record points at, as { entity, key } pairs.
// A reference whose fields are empty on this record doesn't apply (optional
// foreign key — e.g. a non-inventory sales part has no PartNo).
export function parentKeys(entity, record) {
  const parents = []
  entity.references.forEach((ref) => {
    const parent = getEntity(ref.entity)
    if (!parent) return
    const parentFieldToChild = Object.fromEntries(Object.entries(ref.fields).map(([child, p]) => [p, child]))
    const values = parent.keyFields.map((pf) => record?.[parentFieldToChild[pf]])
    if (values.some(isBlank)) return
    parents.push({ entity: parent.id, label: parent.label, key: values.map(String).join(' | ') })
  })
  return parents
}

// Fields IFS returns on every row that must never go back in a create body.
const SYSTEM_FIELD_NAMES = new Set([
  'objid', 'objversion', 'objgrants', 'objstate', 'objevents', 'objkey', 'luname', 'keyref', 'rowversion'
])

export function buildEntityPayload(entity, record) {
  if (entity.fields) return pickPayloadFields(record, entity.fields, entity.fixedValues)
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith('@') && !SYSTEM_FIELD_NAMES.has(key.toLowerCase()))
  )
}

// ---- IFS URLs ----

const PROJECTION_PATTERN = /^[A-Za-z0-9_]+\.svc$/
const ENTITY_SET_PATTERN = /^[A-Za-z0-9_]+$/

export function buildProjectionUrl(baseUrl, projection, path) {
  if (!baseUrl) throw new Error('Base URL is required.')
  if (!PROJECTION_PATTERN.test(projection)) throw new Error(`Invalid projection "${projection}".`)
  return `${baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/v1/${projection}/${path}`
}

export function buildEntitySetUrl(baseUrl, entity) {
  if (!ENTITY_SET_PATTERN.test(entity.entitySet)) throw new Error(`Invalid entity set "${entity.entitySet}".`)
  return buildProjectionUrl(baseUrl, entity.projection, entity.entitySet)
}

export function buildEntityBatchUrl(baseUrl, entity) {
  return buildProjectionUrl(baseUrl, entity.projection, '$batch')
}
