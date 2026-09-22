const HISTORY_KEY = 'sebsa_ifs_migration_history'

export const ENVIRONMENTS = ['Development', 'Test', 'UAT', 'Production']

function mockCustomerRecord(i) {
  const regions = ['EMEA', 'APAC', 'AMER']
  return {
    code: `CUST-${String(1000 + i)}`,
    name: `Customer ${1000 + i}`,
    region: regions[i % regions.length],
    status: i % 11 === 0 ? 'Needs review' : 'Ready'
  }
}

function mockCompanyRecord(i) {
  const countries = ['SE', 'US', 'UK', 'DE']
  return {
    code: `COMP-${String(100 + i)}`,
    name: `Company ${100 + i}`,
    country: countries[i % countries.length],
    status: i % 11 === 0 ? 'Needs review' : 'Ready'
  }
}

function mockInventoryRecord(i) {
  const warehouses = ['SITE-01', 'SITE-02', 'SITE-03']
  const uoms = ['EA', 'KG', 'BOX', 'LTR']
  return {
    sku: `INV-${String(1000 + i)}`,
    description: `Inventory Item ${1000 + i}`,
    warehouse: warehouses[i % warehouses.length],
    uom: uoms[i % uoms.length],
    status: i % 11 === 0 ? 'Needs review' : 'Ready'
  }
}

function mockSupplierRecord(i) {
  const categories = ['Raw Materials', 'Packaging', 'Logistics', 'Services']
  return {
    code: `SUP-${String(1000 + i)}`,
    name: `Supplier ${1000 + i}`,
    category: categories[i % categories.length],
    status: i % 11 === 0 ? 'Needs review' : 'Ready'
  }
}

export const AVAILABLE_ENTITIES = [
  {
    id: 'customer',
    label: 'Customer',
    description: 'Customer master records',
    enabled: true,
    defaultCount: 58,
    idKey: 'code',
    columns: [
      { key: 'code', label: 'Customer Code' },
      { key: 'name', label: 'Name' },
      { key: 'region', label: 'Region' },
      { key: 'status', label: 'Status' }
    ],
    generator: mockCustomerRecord
  },
  {
    id: 'company',
    label: 'Company',
    description: 'Company master records',
    enabled: true,
    defaultCount: 12,
    idKey: 'code',
    columns: [
      { key: 'code', label: 'Company Code' },
      { key: 'name', label: 'Name' },
      { key: 'country', label: 'Country' },
      { key: 'status', label: 'Status' }
    ],
    generator: mockCompanyRecord
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Inventory master records',
    enabled: true,
    defaultCount: 42,
    idKey: 'sku',
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'description', label: 'Description' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'uom', label: 'UoM' },
      { key: 'status', label: 'Status' }
    ],
    generator: mockInventoryRecord
  },
  {
    id: 'supplier',
    label: 'Supplier',
    description: 'Supplier master records',
    enabled: true,
    defaultCount: 27,
    idKey: 'code',
    columns: [
      { key: 'code', label: 'Supplier Code' },
      { key: 'name', label: 'Name' },
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' }
    ],
    generator: mockSupplierRecord
  }
]

export function fetchEntitiesData(entityIds) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = {}
      entityIds.forEach((entityId) => {
        const entity = AVAILABLE_ENTITIES.find((e) => e.id === entityId)
        if (!entity) return
        const records = Array.from({ length: entity.defaultCount }, (_, i) => entity.generator(i))
        const flagged = records.filter((r) => r.status === 'Needs review').length
        result[entityId] = { records, total: records.length, flagged }
      })
      resolve(result)
    }, 900)
  })
}

export function runMigration(fromEnv, toEnv, entityBreakdown) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const totalRecords = entityBreakdown.reduce((sum, e) => sum + e.total, 0)
      const entry = {
        id: Date.now(),
        fromEnv,
        toEnv,
        entities: entityBreakdown,
        totalRecords,
        completedAt: new Date().toISOString(),
        status: 'Completed'
      }
      const history = getHistory()
      history.unshift(entry)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 25)))
      resolve(entry)
    }, 1400)
  })
}

export function getHistory() {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(HISTORY_KEY)
  return raw ? JSON.parse(raw) : []
}
