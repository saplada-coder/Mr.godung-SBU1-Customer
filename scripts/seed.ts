/**
 * Seed: ย้ายข้อมูล 723 ใบเสนอราคาจาก Google Sheet (scripts/seed-data.json) เข้า Neon
 * รัน: npm run db:seed
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql as dsql } from 'drizzle-orm'
import * as schema from '../src/db/schema'

const DEFAULT_RATES: Record<string, number> = { BU1: 7000, BU2: 6500, BU3: 5500, BU4: 5500, BU5: 5500, BU6: 5500, BU7: 5500 }
void DEFAULT_RATES

const STATUS_MAP: Record<string, string> = {
  'ลูกค้าใหม่ – รอติดต่อ': 'ลูกค้าใหม่ – รอติดต่อ',
  'ไม่สนใจ / ปิดไม่ได้': 'ไม่สนใจ / ปิดไม่ได้',
  'คาดว่าจะได้งาน': 'คาดว่าจะได้งาน',
  'นัด Zoom / ดูหน้างาน': 'นัด Zoom / ดูหน้างาน',
  'ปิดงาน (ได้งาน)': 'ปิดงาน (ได้งาน)',
  'รอเซ็นสัญญา / มัดจำ': 'รอเซ็นสัญญา / มัดจำ',
  'ติดต่อไม่ได้': 'ติดต่อไม่ได้',
  'รอลูกค้าตัดสินใจ': 'รอลูกค้าตัดสินใจ',
}
const isFinal = (s: string) => s === 'ปิดงาน (ได้งาน)' || s === 'รอเซ็นสัญญา / มัดจำ'
const CHANNELS = new Set(['FB : Mr.โกดัง', 'Line OA', 'โทร', 'MD', 'อื่นๆ'])

type Rec = {
  code: string; bu: string; status: string; quote: string; d: string | null; date: string
  name: string; channel: string; chname: string; phone: string; province: string; detail: string; cat: string
  k: number | null; y: number | null; s: number | null; sqm: number | null; amount: number | null
  note: string; apptType: string; apptDate: string | null
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (npm run db:seed)')
  const db = drizzle(neon(url), { schema })
  const data = JSON.parse(readFileSync(join(process.cwd(), 'scripts/seed-data.json'), 'utf8'))
  const records: Rec[] = data.records

  console.log('· clearing existing rows…')
  await db.execute(dsql`TRUNCATE TABLE ${schema.activityLog}, ${schema.notes}, ${schema.attachments}, ${schema.appointments}, ${schema.customers} RESTART IDENTITY CASCADE`)

  console.log('· seeding bu_rates…')
  await db.insert(schema.buRates).values(Object.entries(DEFAULT_RATES).map(([bu, ratePerSqm]) => ({ bu: bu as never, ratePerSqm })))
    .onConflictDoUpdate({ target: schema.buRates.bu, set: { ratePerSqm: dsql`excluded.rate_per_sqm` } })

  const num = (v: number | null) => (v == null ? null : String(v))
  const apptRows: { code: string; type: string; date: string }[] = []
  const noteRows: { code: string; body: string }[] = []
  const codeToId = new Map<string, number>()
  const BATCH = 200

  console.log(`· inserting ${records.length} customers…`)
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH)
    const rows = chunk.map((r) => {
      const status = STATUS_MAP[r.status] ?? 'ลูกค้าใหม่ – รอติดต่อ'
      const channel = CHANNELS.has(r.channel) ? r.channel : r.channel ? 'อื่นๆ' : null
      return {
        code: r.code, bu: r.bu as never, name: r.name || null, channel: channel as never, chname: r.chname || null,
        phone: r.phone || null, province: r.province || null, detail: r.detail || null, cat: r.cat || null,
        widthM: num(r.k), lengthM: num(r.y), heightM: num(r.s), sqm: num(r.sqm),
        amountEst: isFinal(status) ? null : num(r.amount), amountActual: isFinal(status) ? num(r.amount) : null,
        status: status as never, quoteStatus: (r.quote || 'ยังไม่ทำใบเสนอราคา') as never, inquiredAt: r.d,
      }
    })
    const inserted = await db.insert(schema.customers).values(rows).returning({ id: schema.customers.id, code: schema.customers.code })
    inserted.forEach((x) => codeToId.set(x.code, x.id))
    for (const r of chunk) {
      if (r.apptDate) apptRows.push({ code: r.code, type: r.apptType === 'zoom' ? 'zoom' : 'site', date: r.apptDate })
      if (r.note) noteRows.push({ code: r.code, body: r.note })
    }
    process.stdout.write(`\r  …${Math.min(i + BATCH, records.length)}/${records.length}`)
  }
  console.log('')

  if (apptRows.length) {
    console.log(`· inserting ${apptRows.length} appointments…`)
    await db.insert(schema.appointments).values(apptRows.map((a) => ({ customerId: codeToId.get(a.code)!, type: a.type as never, apptDate: a.date })))
  }
  if (noteRows.length) {
    console.log(`· inserting ${noteRows.length} notes…`)
    await db.insert(schema.notes).values(noteRows.map((n) => ({ customerId: codeToId.get(n.code)!, body: n.body })))
  }
  console.log(`\n✓ done — ${records.length} customers, ${apptRows.length} appointments, ${noteRows.length} notes`)
}

main().catch((e) => { console.error(e); process.exit(1) })
