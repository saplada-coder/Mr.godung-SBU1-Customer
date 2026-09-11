import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationInstallments, customers, contracts, contractInstallments, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { quoteTotals, n0, num, nstr, today } from '@/lib/biz'
import { canEdit, halfSubs } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/* ค่าเริ่มต้นของสัญญาตามฟอร์มจริงของบริษัท — แก้ทีหลังได้ทุกช่องในหน้าร่างสัญญา */
const DEFAULT_EXTEND_DAYS = 30
const DEFAULT_START_WITHIN = 7
const DEFAULT_PAY_WITHIN = 7
const DEFAULT_PENALTY = 1000
const DEFAULT_WORK_HOURS = '08.00 น. ถึง 21.00 น.'
const DEFAULT_WARRANTY_YEARS = 1

/**
 * ร่างสัญญาจากใบเสนอราคาที่ลูกค้าตกลง — ใบละหนึ่งฉบับ
 * กดซ้ำได้สัญญาเดิม (ไม่สร้างซ้ำ) เพื่อให้ปุ่มเดียวใช้ทั้งสร้างและเปิดของเดิม
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()

  const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [existing] = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.quotationId, id)).limit(1)
  if (existing) return NextResponse.json({ ok: true, id: existing.id, existed: true })

  if (q.status !== 'ลูกค้าตกลง')
    return NextResponse.json({ error: 'ร่างสัญญาได้เฉพาะใบที่ลูกค้าตกลงแล้ว' }, { status: 400 })

  const [items, insts, [cust]] = await Promise.all([
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)),
    db.select().from(quotationInstallments).where(eq(quotationInstallments.quotationId, id)),
    db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1),
  ])
  const t = quoteTotals(q, items, [])
  const w = num(cust?.widthM), l = num(cust?.lengthM)

  const [made] = await db.insert(contracts).values({
    quotationId: id,
    customerId: q.customerId,
    // เลขที่สัญญาใช้รหัสลูกค้า เช่น BU1-20260909-002 ตามฟอร์มสัญญาจริง
    code: cust?.code || q.code,
    contractAmount: String(t.total),
    vatPct: q.vatPct,
    whtPct: '0',
    buildDays: q.buildDays,
    extendDays: DEFAULT_EXTEND_DAYS,
    startWithinDays: DEFAULT_START_WITHIN,
    payWithinDays: DEFAULT_PAY_WITHIN,
    penaltyPerDay: String(DEFAULT_PENALTY),
    workHours: DEFAULT_WORK_HOURS,
    warrantyYears: DEFAULT_WARRANTY_YEARS,
    buildingSize: w && l ? `${w}*${l}` : null,
    buildingSqm: nstr(num(cust?.sqm)),
    // ข้อมูลลูกค้ามีแค่จังหวัด ตำบล/อำเภอต้องกรอกเองในหน้าร่างสัญญา — ใส่คำว่า "จังหวัด" นำไว้ให้อ่านเป็นที่อยู่
    siteAddress: cust?.province ? `จังหวัด${cust.province}` : null,
    scopeIncluded: q.spec,
    scopeExcluded: q.exclusions,
    warrantyText: q.warranty,
    signDate: today(),
    createdBy: me.id,
  }).returning({ id: contracts.id })

  const rows = [...insts].sort((a, b) => a.seq - b.seq)
  if (rows.length) {
    await db.insert(contractInstallments).values(rows.map((i, n) => ({
      contractId: made.id, seq: n + 1, title: i.title, percent: i.percent, amount: String(n0(i.amount)), note: i.detail,
      // งวดที่ 1 เป็นมัดจำจ่ายก้อนเดียว ตั้งแต่งวดที่ 2 แตกครึ่งเป็น "งวดที่ N.1 / N.2" อย่างละ 50%
      subsJson: n === 0 ? null : JSON.stringify(halfSubs(n0(i.amount), n + 1)),
    })))
  }
  await db.insert(activityLog).values({
    customerId: q.customerId, quotationId: id, userId: me.id,
    action: 'contract-create', field: 'สัญญา', newValue: `ร่างสัญญาเลขที่ ${cust?.code || q.code}`,
  })
  return NextResponse.json({ ok: true, id: made.id, existed: false })
}
