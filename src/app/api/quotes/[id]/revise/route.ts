import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationCosts, quotationInstallments, customers, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { today } from '@/lib/biz'
import { canEdit, isAdminUp } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** สร้าง Revision ใหม่: clone ใบเดิมเป็นฉบับร่าง rev+1 (เลขเอกสารเดิม) แล้วมาร์กใบเดิมว่า "ถูกแทนที่" */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [cur] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!(isAdminUp(me.role) || cur.createdBy === me.id)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!['อนุมัติแล้ว', 'ส่งลูกค้าแล้ว', 'ลูกค้าตกลง'].includes(cur.status))
    return NextResponse.json({ error: 'ทำ Revision ได้เฉพาะใบที่อนุมัติ/ส่งแล้ว (ใบร่างแก้ได้ตรงๆ)' }, { status: 400 })
  if (cur.projectId) return NextResponse.json({ error: 'ใบนี้เปิดงานก่อสร้างแล้ว แก้ไขไม่ได้' }, { status: 400 })
  if (cur.supersededById) return NextResponse.json({ error: 'ใบนี้มี Revision ใหม่อยู่แล้ว' }, { status: 400 })

  const [items, costs, insts] = await Promise.all([
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)),
    db.select().from(quotationCosts).where(eq(quotationCosts.quotationId, id)),
    db.select().from(quotationInstallments).where(eq(quotationInstallments.quotationId, id)),
  ])

  const [nq] = await db.insert(quotations).values({
    customerId: cur.customerId, code: cur.code, rev: cur.rev + 1, status: 'ร่าง',
    issueDate: today(), validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    refNo: cur.refNo, opFeePct: cur.opFeePct, discountDesign: cur.discountDesign, discountBuild: cur.discountBuild,
    vatPct: cur.vatPct, permitDays: cur.permitDays, buildDays: cur.buildDays,
    exclusions: cur.exclusions, warranty: cur.warranty, spec: cur.spec, note: cur.note,
    includePortfolio: cur.includePortfolio, createdBy: me.id,
  }).returning()

  if (items.length) await db.insert(quotationItems).values(items.map((i) => ({ quotationId: nq.id, seq: i.seq, description: i.description, qty: i.qty, unit: i.unit, unitPrice: i.unitPrice, amount: i.amount, note: i.note })))
  if (costs.length) await db.insert(quotationCosts).values(costs.map((c) => ({ quotationId: nq.id, category: c.category, amount: c.amount })))
  if (insts.length) await db.insert(quotationInstallments).values(insts.map((i) => ({ quotationId: nq.id, seq: i.seq, title: i.title, detail: i.detail, percent: i.percent, amount: i.amount, note: i.note })))

  await db.update(quotations).set({ status: 'ถูกแทนที่', supersededById: nq.id, updatedAt: new Date() }).where(eq(quotations.id, id))
  await db.update(customers).set({ quoteStatus: 'ลูกค้าขอแก้ไขราคา', updatedAt: new Date() }).where(eq(customers.id, cur.customerId))
  await db.insert(activityLog).values({ customerId: cur.customerId, quotationId: nq.id, userId: me.id, action: 'quote-revise', oldValue: `rev ${cur.rev}`, newValue: `rev ${cur.rev + 1}` })

  return NextResponse.json({ ok: true, id: nq.id })
}
