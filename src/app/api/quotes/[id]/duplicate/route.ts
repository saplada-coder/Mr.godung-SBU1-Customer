import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationCosts, quotationInstallments, customers, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { genDocCode, today } from '@/lib/biz'
import { canEdit } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * ทำสำเนาใบเสนอราคา — ได้ใบร่างใหม่ เลขที่ใหม่ เนื้อหาเหมือนเดิมทุกอย่าง
 *
 * ต่างจาก Revision: Revision คือ "ใบเดิมฉบับแก้ไข" ใช้เลขเดิม rev+1 แล้วใบเก่ากลายเป็น "ถูกแทนที่"
 * ส่วนสำเนาคือใบใหม่คนละฉบับ ใบต้นทางไม่ถูกแตะ — ใช้ตอนเสนอลูกค้ารายอื่นด้วยสเปคเดียวกัน หรือเสนอทางเลือกที่สอง
 * ทำสำเนาได้ทุกสถานะรวมทั้งใบที่เปิดงานแล้ว เพราะไม่ได้ไปเปลี่ยนอะไรกับใบเดิม
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [cur] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (cur.deletedAt) return NextResponse.json({ error: 'ใบนี้อยู่ในถังขยะ กู้คืนก่อนถึงจะทำสำเนาได้' }, { status: 400 })

  // ทำสำเนาให้ลูกค้ารายอื่นได้ — ส่ง customerId มา ถ้าไม่ส่งถือว่าเป็นลูกค้าคนเดิม
  const b = await req.json().catch(() => ({}))
  const targetId = Number(b?.customerId) || cur.customerId
  const [cust] = await db.select().from(customers).where(eq(customers.id, targetId)).limit(1)
  if (!cust) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 })

  const [items, costs, insts] = await Promise.all([
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)),
    db.select().from(quotationCosts).where(eq(quotationCosts.quotationId, id)),
    db.select().from(quotationInstallments).where(eq(quotationInstallments.quotationId, id)),
  ])

  const issue = today()
  const code = await genDocCode(db, 'QT', cust.bu, issue)
  const sameCustomer = targetId === cur.customerId

  const [nq] = await db.insert(quotations).values({
    customerId: targetId, code, rev: 1, status: 'ร่าง',
    issueDate: issue, validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    // ข้อมูลบนหัวใบตามลูกค้าปลายทาง — ลูกค้าคนเดิมใช้ของเดิม คนละคนดึงจาก CRM ของคนนั้น
    custName: sameCustomer ? cur.custName : (cust.name || cust.chname),
    custAddress: sameCustomer ? cur.custAddress : cust.province,
    custPhone: sameCustomer ? cur.custPhone : cust.phone,
    custTaxId: sameCustomer ? cur.custTaxId : null,
    refNo: cur.refNo,
    opFeePct: cur.opFeePct, discountDesign: cur.discountDesign, discountBuild: cur.discountBuild,
    vatPct: cur.vatPct, permitDays: cur.permitDays, buildDays: cur.buildDays,
    exclusions: cur.exclusions, warranty: cur.warranty, spec: cur.spec, note: cur.note,
    includePortfolio: cur.includePortfolio, portfolioJson: cur.portfolioJson,
    createdBy: me.id,
  }).returning()

  if (items.length) await db.insert(quotationItems).values(items.map((i) => ({ quotationId: nq.id, seq: i.seq, description: i.description, qty: i.qty, unit: i.unit, unitPrice: i.unitPrice, amount: i.amount, note: i.note })))
  if (costs.length) await db.insert(quotationCosts).values(costs.map((c) => ({ quotationId: nq.id, category: c.category, amount: c.amount })))
  if (insts.length) await db.insert(quotationInstallments).values(insts.map((i) => ({ quotationId: nq.id, seq: i.seq, title: i.title, detail: i.detail, percent: i.percent, amount: i.amount, note: i.note })))

  if (['ยังไม่ทำใบเสนอราคา', 'ขอข้อมูลเพิ่มเติม', 'รอทำใบเสนอราคา'].includes(cust.quoteStatus)) {
    await db.update(customers).set({ quoteStatus: 'สร้างใบเสนอราคาแล้ว', updatedAt: new Date() }).where(eq(customers.id, targetId))
  }
  await db.insert(activityLog).values({
    customerId: targetId, quotationId: nq.id, userId: me.id,
    action: 'quote-duplicate', field: 'ใบเสนอราคา', oldValue: cur.code, newValue: `${code} (สำเนาจาก ${cur.code})`,
  })

  return NextResponse.json({ ok: true, id: nq.id, code })
}
