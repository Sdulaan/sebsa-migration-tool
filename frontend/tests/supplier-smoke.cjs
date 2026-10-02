const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn } = require('node:child_process')

async function main() {
  const seen = []
  const mock = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    seen.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() })
    if (req.url.endsWith('/$batch')) {
      const fail = seen.at(-1).body.includes('"Name":"Fail"')
      res.writeHead(200, { 'Content-Type': 'multipart/mixed; boundary=reply' })
      res.end(`--reply\r\nContent-Type: application/http\r\nContent-ID: 1\r\n\r\nHTTP/1.1 ${fail ? '400 Bad Request' : '201 Created'}\r\nContent-Type: application/json\r\n\r\n${fail ? '{"error":{"code":"VALIDATION","message":"Rejected supplier"}}' : '{}'}\r\n--reply--\r\n`)
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ value: [{ SupplierId: 'S1', AddressId: 'A1', Name: 'Supplier address', luname: 'internal' }] }))
    }
  })
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${mock.address().port}`
  const port = 53617
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { cwd: process.cwd(), stdio: 'ignore' })
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      if (app.exitCode != null) throw new Error(`Next exited (${app.exitCode})`)
      try {
        const res = await fetch(`http://127.0.0.1:${port}/login`)
        if (res.ok) { ready = true; break }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assert.ok(ready, 'Next did not start')
    const call = async (data) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/ifs/supplier`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, baseUrl, accessToken: 'mock' })
      })
      return { status: res.status, body: await res.json() }
    }
    const list = await call({ operation: 'list', stage: 'supplier_address', keys: { SupplierId: 'S1' } })
    assert.equal(list.status, 200)
    assert.equal(list.body.records.length, 1)
    assert.ok(seen[0].url.includes("SupplierInfoGeneralSet(SupplierId='S1')/SupplierInfoAddresses"))

    const header = await call({ operation: 'create', stage: 'supplier_general_information', records: [
      { keys: {}, record: { SupplierId: 'S1', Name: 'Supplier', PartyType: 'Supplier', keyref: 'internal', Unexpected: 'ignore' } }
    ] })
    assert.equal(header.body.results[0].httpStatus, 201)
    assert.ok(seen[1].body.includes('POST SupplierInfoGeneralSet HTTP/1.1'))
    assert.ok(!seen[1].body.includes('Unexpected'))
    assert.ok(!seen[1].body.includes('keyref'))

    const created = await call({ operation: 'create', stage: 'supplier_address', records: [
      { keys: { SupplierId: 'S1' }, record: { SupplierId: 'S1', AddressId: 'A1', Name: 'Supplier address', luname: 'internal', Unexpected: 'ignore' } }
    ] })
    assert.equal(created.body.results[0].httpStatus, 201)
    assert.ok(seen[2].body.includes('POST SupplierInfoGeneralSet(SupplierId=\'S1\')/SupplierInfoAddresses HTTP/1.1'))
    assert.ok(seen[2].body.includes('"AddressId":"A1"'))
    assert.ok(!seen[2].body.includes('Unexpected'))
    assert.ok(!seen[2].body.includes('luname'))

    const before = seen.length
    const invalid = await call({ operation: 'create', stage: 'supplier_address', records: [
      { keys: { SupplierId: 'S1' }, record: { SupplierId: 'OTHER', AddressId: 'A2' } }
    ] })
    assert.equal(invalid.body.results[0].errorCode, 'LOCAL_VALIDATION')
    assert.equal(seen.length, before)

    const failed = await call({ operation: 'create', stage: 'supplier_general_information', records: [
      { keys: {}, record: { SupplierId: 'S2', Name: 'Fail' } }
    ] })
    assert.equal(failed.body.results[0].httpStatus, 400)
    assert.equal(failed.body.results[0].error, 'Rejected supplier')

    const taxes = await call({ operation: 'list', stage: 'taxes', keys: { SupplierId: 'S1', AddressId: 'A1', Company: 'C1' } })
    assert.equal(taxes.status, 200)
    assert.ok(seen.at(-1).url.includes("SupplierDeliveryTaxInfoArray(SupplierId='S1',AddressId='A1',Company='C1')/SupplierDeliveryTaxCodeArray"))

    const payment = await call({ operation: 'list', stage: 'payment_methods', keys: { SupplierId: 'S1', Company: 'C1', Identity: 'S1', PartyType: 'Supplier' } })
    assert.equal(payment.status, 200)
    assert.ok(seen.at(-1).url.includes("PartyType=IfsApp.SupplierHandling.PartyType'Supplier')/PaymentWayArray"))
    console.log('Supplier list, nested URLs, POST field filter, batch success/error parsing, and local error checks passed.')
  } finally {
    app.kill()
    await new Promise((resolve) => mock.close(resolve))
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
