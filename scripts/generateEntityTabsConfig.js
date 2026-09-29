#!/usr/bin/env node
// Regenerates frontend/lib/entityTabsConfig.json from REST APIs.xlsx
// Usage: node scripts/generateEntityTabsConfig.js
//
// Column layout in the Excel:
//   Col A: section header (tab name) or API action description
//   Col B: HTTP method (GET/POST/PATCH) when row is an API call
//   Col 4 (E): Mapped Payload — JSON key-value lines for most entities
//   Col 6 (G): Mapped Payload for part entities (Master Part, Inventory Part, Sales Part)

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const XLSX_PATH = path.resolve(__dirname, '..', 'REST APIs.xlsx')
const OUT_PATH  = path.resolve(__dirname, '..', 'frontend', 'lib', 'entityTabsConfig.json')
const EXTRACT   = path.resolve(__dirname, '_xlsx_extracted')

if (!fs.existsSync(XLSX_PATH)) {
  console.error('REST APIs.xlsx not found at', XLSX_PATH)
  process.exit(1)
}

// Copy as .zip and expand (Expand-Archive only accepts .zip)
const ZIP = XLSX_PATH.replace('.xlsx', '_tmp.zip')
if (fs.existsSync(ZIP)) fs.unlinkSync(ZIP)
fs.copyFileSync(XLSX_PATH, ZIP)
if (fs.existsSync(EXTRACT)) fs.rmSync(EXTRACT, { recursive: true })
fs.mkdirSync(EXTRACT, { recursive: true })
execSync(`powershell -Command "Expand-Archive -Path '${ZIP}' -DestinationPath '${EXTRACT}' -Force"`)
fs.unlinkSync(ZIP)

// Read shared strings
const ssXml = fs.readFileSync(path.join(EXTRACT, 'xl', 'sharedStrings.xml'), 'utf8')
const sharedStrings = []
const siRegex = /<si>([\s\S]*?)<\/si>/g
let m
while ((m = siRegex.exec(ssXml)) !== null) {
  const inner = m[1]
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g
  let tm, combined = ''
  while ((tm = tRe.exec(inner)) !== null) {
    combined += tm[1]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
  }
  sharedStrings.push(combined)
}

function getGrid(file) {
  const xml = fs.readFileSync(path.join(EXTRACT, 'xl', 'worksheets', file), 'utf8')
  const allRows = []
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
  let rm
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowNum = parseInt(rm[1]) - 1
    const rowXml = rm[2]
    const cells = []
    const cellRe = /<c[^>]+r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g
    let cm
    while ((cm = cellRe.exec(rowXml)) !== null) {
      const colIdx = cm[1].split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
      const attrs = cm[3]; const inner = cm[4]
      let val = ''
      const vm = /<v>([\s\S]*?)<\/v>/.exec(inner)
      if (vm) val = /t="s"/.test(attrs) ? (sharedStrings[parseInt(vm[1])] || '') : vm[1]
      const im = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(inner)
      if (im) val = im[1]
      cells.push({ col: colIdx, val: val.trim() })
    }
    allRows.push({ rowNum, cells })
  }
  const grid = []
  for (const { rowNum, cells } of allRows) {
    while (grid.length <= rowNum) grid.push([])
    for (const { col, val } of cells) {
      while (grid[rowNum].length <= col) grid[rowNum].push('')
      grid[rowNum][col] = val
    }
  }
  return grid
}

const NOISE = [
  /^\d+$/, /^(GET|POST|PATCH|PUT|DELETE)$/i,
  /^(Get|Create|Add|Update|Delete|Validate|Check|Initialize|Calculate|Fetch|Build|Assign|Set|Remove|Move|Link|Import|Export|Commit|Rollback|Generate|Process|Run)\s/i,
  /^(No |POST method|PATCH method|Same End|these data|MRO Tab data|Functional Doc|LUS-|if master|if |Progress Template Basic)/i,
  /^(POST method is|PATCH method is|method not allowed|method is not allowed|method not available|method is not available)/i,
  /^(Shop Order Replication|MRO Tab$|MRO data can|Procurement Tab$|Procument Tab$)/i,
  /{{|http|:\/\//, /not allowed|not available|no separate|same rest|same end point/i,
  /will be updated using|can be fetched and updates/i,
  /^(General,|Automatic Reservation|Transport Task|data doesnt need)/i,
]
function isNoise(t) { return NOISE.some(p => p.test(t)) || t.length > 100 }

function toTabId(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '_')
}

function extractFieldName(v) {
  const m = /^"([A-Z][A-Za-z0-9_]*)"\s*:/.exec(v)
  return m ? m[1] : null
}

function parseSheet(file) {
  const grid = getGrid(file)
  const tabs = []; let cur = null; let lastHdr = false
  for (const row of grid) {
    const a = (row[0] || '').trim()
    const b = (row[1] || '').trim()
    const e = (row[4] || '').trim()
    const isApi = /^(GET|POST|PATCH|PUT|DELETE)$/.test(b)
    if (a && !b && !isApi) {
      if (isNoise(a)) continue
      if (lastHdr && cur) { lastHdr = true; continue }
      cur = { tabId: toTabId(a), tabName: a, fields: [] }
      tabs.push(cur)
      lastHdr = true
    } else if (isApi) {
      lastHdr = false
    } else if (e && e !== '{' && e !== '}') {
      const f = extractFieldName(e)
      if (f && cur && !cur.fields.includes(f)) cur.fields.push(f)
      lastHdr = false
    }
  }
  return tabs
}

function extractFlatFields(file, col) {
  const grid = getGrid(file); const fields = []
  for (const row of grid) {
    const v = (row[col] || '').trim()
    if (!v || v === '{' || v === '}') continue
    const m = /^"([A-Z][A-Za-z0-9_]*)"\s*:/.exec(v)
    if (m && !fields.includes(m[1])) fields.push(m[1])
  }
  return fields
}

const ENTITIES = [
  { id: 'company',            file: 'sheet11.xml', flat: false, col: 4 },
  { id: 'site',               file: 'sheet12.xml', flat: false, col: 4 },
  { id: 'customer',           file: 'sheet8.xml',  flat: false, col: 4 },
  { id: 'supplier',           file: 'sheet9.xml',  flat: false, col: 4 },
  { id: 'masterPart',         file: 'sheet3.xml',  flat: true,  col: 4 },
  { id: 'inventoryPart',      file: 'sheet5.xml',  flat: true,  col: 6 },
  { id: 'salesPart',          file: 'sheet6.xml',  flat: true,  col: 6 },
  { id: 'inventoryLocations', file: 'sheet10.xml', flat: false, col: 4 },
]

const config = {}
for (const { id, file, flat, col } of ENTITIES) {
  if (flat) {
    config[id] = [{ tabId: 'general', tabName: 'General', fields: extractFlatFields(file, col) }]
    continue
  }
  const tabs = parseSheet(file)
  const seen = new Set(); const out = []
  for (const tab of tabs) {
    if (seen.has(tab.tabId)) {
      const ex = out.find(t => t.tabId === tab.tabId)
      if (ex) tab.fields.forEach(f => { if (!ex.fields.includes(f)) ex.fields.push(f) })
    } else { seen.add(tab.tabId); out.push(tab) }
  }
  config[id] = out
}

fs.rmSync(EXTRACT, { recursive: true })
fs.writeFileSync(OUT_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8')
console.log('Written:', OUT_PATH)
for (const [k, v] of Object.entries(config)) {
  console.log(`  ${k}: ${v.length} tabs — ${v.map(t => t.tabName).join(', ')}`)
}
