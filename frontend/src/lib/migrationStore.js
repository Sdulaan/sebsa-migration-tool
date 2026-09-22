const HISTORY_KEY = 'sebsa_ifs_migration_history'

export const AVAILABLE_COLUMNS = [
  { id: 'lu', label: "LU's", description: 'Logical Unit master records', enabled: true },
  { id: 'part_no', label: "Part No's", description: 'Part number master records', enabled: false },
  { id: 'supplier', label: 'Suppliers', description: 'Supplier master records', enabled: false },
  { id: 'warehouse', label: 'Warehouses', description: 'Warehouse and site records', enabled: false },
  { id: 'customer', label: 'Customers', description: 'Customer master records', enabled: false }
]

function mockLuRecord(i) {
  const sites = ['SITE-01', 'SITE-02', 'SITE-03']
  const uoms = ['EA', 'KG', 'BOX', 'LTR']
  return {
    luCode: `LU-${String(1000 + i)}`,
    description: `Logical Unit ${1000 + i}`,
    site: sites[i % sites.length],
    uom: uoms[i % uoms.length],
    status: i % 11 === 0 ? 'Needs review' : 'Ready'
  }
}

export function fetchColumnData(columnId, count = 42) {
  if (columnId !== 'lu') return Promise.resolve({ records: [], total: 0, flagged: 0 })
  return new Promise((resolve) => {
    setTimeout(() => {
      const records = Array.from({ length: count }, (_, i) => mockLuRecord(i))
      const flagged = records.filter((r) => r.status === 'Needs review').length
      resolve({ records, total: records.length, flagged })
    }, 900)
  })
}

export function runMigration(columnId, recordCount) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const entry = {
        id: Date.now(),
        column: columnId,
        recordCount,
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
  const raw = localStorage.getItem(HISTORY_KEY)
  return raw ? JSON.parse(raw) : []
}
