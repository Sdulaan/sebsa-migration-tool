// Turns a transaction log into an .xlsx workbook and downloads it: a Summary
// sheet, then one sheet per entity listing every record with its status,
// the reason it failed or was skipped, and the full payload — so failed rows
// can be fixed and re-sent. Browser-only; exceljs is loaded on demand.

import { TX_STATUS_LABELS, summarizeLog } from './transactionLog'

const STATUS_FILLS = {
  SUCCESS: 'FFE7F6EE',
  ALREADY_EXISTS: 'FFE8F1FD',
  FAILED: 'FFFDEBEC',
  SKIPPED: 'FFEDEFF3',
  UNCONFIRMED: 'FFFEF3E2'
}

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D8C' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } }

// Excel sheet names: max 31 chars, none of : \ / ? * [ ], unique.
function sheetName(label, used) {
  const base = label.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Sheet'
  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 27)} (${n})`
  used.add(name.toLowerCase())
  return name
}

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
  })
}

function cellValue(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

export async function buildTransactionLogWorkbook(log) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SEBSA Migration Tool'
  workbook.created = new Date()
  const used = new Set()

  // ---- Summary ----
  const summary = workbook.addWorksheet(sheetName('Summary', used))
  const { entities, totals } = summarizeLog(log)
  ;[
    ['Run ID', log.runId],
    ['Source', `${log.fromEnv} (${log.sourceBaseUrl || '—'})`],
    ['Destination', `${log.toEnv} (${log.destBaseUrl || '—'})`],
    ['Started', new Date(log.startedAt).toLocaleString()],
    ['Finished', log.finishedAt ? new Date(log.finishedAt).toLocaleString() : 'Not finished']
  ].forEach((row) => {
    summary.addRow(row).getCell(1).font = { bold: true }
  })
  summary.addRow([])

  const statusKeys = Object.keys(TX_STATUS_LABELS)
  styleHeader(summary.addRow(['Entity', 'Records', ...statusKeys.map((s) => TX_STATUS_LABELS[s])]))
  entities.forEach((e) => summary.addRow([e.label, e.total, ...statusKeys.map((s) => e[s])]))
  summary.addRow(['Total', totals.total, ...statusKeys.map((s) => totals[s])]).font = { bold: true }
  summary.columns.forEach((col, i) => {
    col.width = i === 0 ? 22 : i === 1 ? 44 : 15
  })

  // ---- One sheet per entity ----
  log.entities.forEach((entity) => {
    const entries = log.entries.filter((e) => e.entity === entity.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const sheet = workbook.addWorksheet(sheetName(entity.label, used), { views: [{ state: 'frozen', ySplit: 1 }] })

    const payloadFields = []
    const seen = new Set()
    entries.forEach((e) => {
      Object.keys(e.payload || {}).forEach((k) => {
        if (!seen.has(k)) {
          seen.add(k)
          payloadFields.push(k)
        }
      })
    })

    const fixed = ['Status', 'Key', 'HTTP status', 'Message', 'Skipped because', 'Error code', 'Time']
    styleHeader(sheet.addRow([...fixed, ...payloadFields]))

    entries.forEach((e) => {
      const row = sheet.addRow([
        TX_STATUS_LABELS[e.status],
        e.key,
        e.httpStatus,
        e.message,
        e.skippedBecause,
        e.errorCode,
        new Date(e.timestamp).toLocaleString(),
        ...payloadFields.map((f) => cellValue(e.payload?.[f]))
      ])
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILLS[e.status] } }
      row.getCell(1).font = { bold: true }
    })

    sheet.columns.forEach((col, i) => {
      col.width = [16, 22, 12, 50, 36, 18, 20][i] || 18
    })
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fixed.length + payloadFields.length } }
  })

  return workbook
}

export async function downloadTransactionLog(log) {
  const workbook = await buildTransactionLogWorkbook(log)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const stamp = new Date(log.startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transfer-log-${stamp}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
