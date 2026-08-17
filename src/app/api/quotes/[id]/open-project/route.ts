import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import {
  quotations, quotationItems, quotationCosts, quotationInstallments,
  projects, projectBudgets, projectInstallments, customers, activityLog,
} from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { genDocCode, quoteTotals, today } from '@/lib/biz'
import { canApprove, ST_WON } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * เปิดงานก่อสร้างจากใบเสนอราคาที่ลูกค้าตกลง (1 คลิก):
 * - มูลค่าสัญญา = ยอดรวมทั้งสิ้น (ไม่รวม VAT) ของใบเสนอราคา
 * - งบประมาณรายหมวด = ประมาณการต้นทุนในใบ
 * - งวดงาน/งวดเงิน = งวดในใบ
 * - ฝั่ง CRM: สถานะลูกค้า → ปิดงาน (ได้งาน) + มูลค่าจริง
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canApprove(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่เปิดงานได้' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json().catch(() => ({}))
  const db = getDb()

  const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (q.status !== 'ลูกค้าตกลง') return NextResponse.json({ error: 'เปิดงานได้เฉพาะใบที่ลูกค้าตกลงแล้ว' }, { status: 400 })
  if (q.projectId) return NextResponse.json({ error: 'ใบนี้เปิดงานไปแล้ว' }, { status: 400 })

  const [cust] = await db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1)
  if (!cust) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 })

  const [items, costs, insts] = await Promise.all([
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)),
    db.select().from(quotationCosts).where(eq(quotationCosts.quotationId, id)),
    db.select().from(quotationInstallments).where(eq(quotationInstallments.quotationId, id)),
  ])
  const t = quoteTotals(q, items, costs)

  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.startDate)) ? String(b.startDate) : today()
  const dueDate = q.buildDays ? new Date(new Date(startDate).getTime() + q.buildDays * 864e5).toISOString().slice(0, 10) : null
  const code = await genDocCode(db, 'PJ', cust.bu, startDate)
  const name = String(b.name ?? '').trim().slice(0, 200) || `${cust.name || cust.chname || cust.code}${cust.cat ? ' · ' + cust.cat : ''}`

  const [pj] = await db.insert(projects).values({
    customerId: cust.id, quotationId: q.id, code, name, bu: cust.bu,
    contractAmount: String(t.total), vatPct: q.vatPct,
    startDate, dueDate, ownerId: q.createdBy ?? me.id, createdBy: me.id,
  }).returning()

  if (costs.length)
    await db.insert(projectBudgets).values(costs.map((c) => ({ projectId: pj.id, category: c.category, amount: c.amount })))
  if (insts.length)
    await db.insert(projectInstallments).values(insts.sort((a, b2) => a.seq - b2.seq).map((i) => ({
      projectId: pj.id, seq: i.seq, title: i.title, detail: i.detail, percent: i.percent, amount: i.amount, note: i.note,
    })))

  await db.update(quotations).set({ projectId: pj.id, updatedAt: new Date() }).where(eq(quotations.id, id))

  // ฝั่ง CRM: งานนี้ปิดการขายแล้ว
  await db.update(customers).set({
    status: ST_WON, amountActual: String(t.total),
    closedAt: cust.closedAt || q.acceptedAt || today(), updatedAt: new Date(),
  }).where(eq(customers.id, cust.id))

  await db.insert(activityLog).values([
    { customerId: cust.id, quotationId: q.id, projectId: pj.id, userId: me.id, action: 'project-open', newValue: code },
    { customerId: cust.id, userId: me.id, action: 'status', field: 'สถานะติดตาม', oldValue: cust.status, newValue: ST_WON },
  ])

  return NextResponse.json({ ok: true, id: pj.id, code })
}
