import { NextResponse } from 'next/server'
import { desc, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { customers, appointments, attachments, notes, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getRates } from '@/lib/rates'
import { serializeCustomer, estimate } from '@/lib/serialize'
import { canEdit, isFinal, LEAD_STATUSES, QUOTE_STATUSES, CHANNELS, BUS, ST_APPT } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()

  // อิสระต่อกันทั้งหมด — ยิงพร้อมกันรอบเดียว (เดิมต่อกัน 5 รอบ ช้ามาก)
  const [rates, rows, appts, attCounts, noteCounts] = await Promise.all([
    getRates(),
    db.select().from(customers).orderBy(desc(customers.amountActual), desc(customers.amountEst)),
    db.select().from(appointments).orderBy(desc(appointments.apptDate)),
    db.select({ id: attachments.customerId, n: sql<number>`count(*)::int` }).from(attachments).groupBy(attachments.customerId),
    db.select({ id: notes.customerId, n: sql<number>`count(*)::int` }).from(notes).groupBy(notes.customerId),
  ])
  const apptByCust = new Map<number, (typeof appts)[number]>()
  for (const a of appts) if (!apptByCust.has(a.customerId)) apptByCust.set(a.customerId, a)
  const attMap = new Map(attCounts.map((r) => [r.id, r.n]))
  const noteMap = new Map(noteCounts.map((r) => [r.id, r.n]))

  const records = rows.map((c) =>
    serializeCustomer(c, { rates, appt: apptByCust.get(c.id) ?? null, attachCount: attMap.get(c.id) ?? 0, noteCount: noteMap.get(c.id) ?? 0 }),
  )

  return NextResponse.json({
    me, rates, records,
    meta: {
      updated: '17 ก.ค. 2026', ref: '2026-07-15', refLabel: '15 ก.ค. 2026', targetYear: '2024', targetTotal: 255,
      quarters: [{ q: 'Q1', target: 15 }, { q: 'Q2', target: 70 }, { q: 'Q3', target: 80 }, { q: 'Q4', target: 90 }],
    },
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const b = await req.json()
  const bu = BUS.includes(b.bu) ? b.bu : 'BU1'
  const status = LEAD_STATUSES.includes(b.status) ? b.status : 'ลูกค้าใหม่ – รอติดต่อ'
  const quote = QUOTE_STATUSES.includes(b.quote) ? b.quote : 'ยังไม่ทำใบเสนอราคา'
  const name = (b.name ?? '').trim() || null
  const chname = (b.chname ?? '').trim() || null
  if (!name && !chname) return NextResponse.json({ error: 'ต้องมีชื่อลูกค้าหรือชื่อช่องทางอย่างน้อย 1 อย่าง' }, { status: 400 })

  const k = num(b.k), y = num(b.y), s = num(b.s)
  const sqm = k != null && y != null ? k * y : num(b.sqm)
  const rates = await getRates()
  const amount = num(b.amount)
  if (isFinal(status) && amount == null) return NextResponse.json({ error: 'งานที่ปิด/เซ็นแล้ว ต้องระบุมูลค่าจริง' }, { status: 400 })
  if (status === ST_APPT && !b.apptDate) return NextResponse.json({ error: 'สถานะนัด ต้องระบุวันที่นัด' }, { status: 400 })

  const db = getDb()
  // รหัสลูกค้า = BU-YYYYMMDD-ลำดับ (ลำดับรันแยกตาม BU+วันที่ เช่น BU1-20260727-001)
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(b.d)) ? String(b.d) : new Date().toISOString().slice(0, 10)
  const ymd = dateStr.replace(/-/g, '')
  const prefix = `${bu}-${ymd}-`
  const [{ nextSeq }] = (await db
    .select({ nextSeq: sql<number>`coalesce(max(right(code,3)::int),0)+1` })
    .from(customers)
    .where(sql`code like ${prefix + '%'}`)) as unknown as [{ nextSeq: number }]
  const code = `${prefix}${String(nextSeq).padStart(3, '0')}`

  const est = isFinal(status) ? null : (amount ?? estimate(sqm, bu, rates))
  const [created] = await db
    .insert(customers)
    .values({
      code, bu, name, chname,
      channel: CHANNELS.includes(b.channel) ? b.channel : null,
      phone: normPhone(b.phone),
      province: (b.province ?? '').trim() || null,
      detail: (b.detail ?? '').trim() || null,
      cat: b.cat || null,
      widthM: str(k), lengthM: str(y), heightM: str(s), sqm: str(sqm),
      amountEst: str(est), amountActual: isFinal(status) ? str(amount) : null,
      status, quoteStatus: quote, inquiredAt: b.d || null,
      closedAt: isFinal(status) ? (b.d || new Date().toISOString().slice(0, 10)) : null, ownerId: me.id,
    })
    .returning()

  if (b.apptDate) {
    await db.insert(appointments).values({ customerId: created.id, type: b.apptType === 'zoom' ? 'zoom' : 'site', apptDate: b.apptDate, apptTime: b.apptTime || null, createdBy: me.id })
  }
  await db.insert(activityLog).values({ customerId: created.id, userId: me.id, action: 'create', newValue: code })
  return NextResponse.json({ ok: true, id: created.id, code })
}

function num(v: unknown): number | null {
  if (v === '' || v == null) return null
  const x = Number(v); return Number.isFinite(x) ? x : null
}
const str = (v: number | null) => (v == null ? null : String(v))
function normPhone(p: unknown): string | null {
  let s = String(p ?? '').replace(/[^0-9+]/g, '')
  if (!s) return null
  if (s.startsWith('66')) s = '0' + s.slice(2)
  return s.slice(0, 12)
}
