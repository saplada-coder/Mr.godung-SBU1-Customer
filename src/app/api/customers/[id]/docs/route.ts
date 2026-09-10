import { NextResponse } from 'next/server'
import { desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { customers, quotations, quotationItems, contracts, projects, projectInstallments, billingDocs } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { quoteTotals, n0 } from '@/lib/biz'

export const dynamic = 'force-dynamic'

/**
 * เอกสารทั้งหมดของลูกค้ารายเดียว — ใบเสนอราคา สัญญา งานก่อสร้าง เอกสารการเงิน
 * ใช้กับกล่อง "เอกสารของลูกค้า" ที่เปิดได้จากทุกหน้าที่มีชื่อลูกค้า
 * ดึงด้วย id ตรง ๆ ไม่พึ่งรายการลูกค้าที่หน้าจอโหลดไว้ ซึ่งปกติจำกัดแค่ 3 เดือนล่าสุด
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const db = getDb()

  const [cust] = await db.select().from(customers).where(eq(customers.id, id)).limit(1)
  if (!cust) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [qs, ctrs, pjs] = await Promise.all([
    db.select().from(quotations).where(eq(quotations.customerId, id)).orderBy(desc(quotations.id)),
    db.select().from(contracts).where(eq(contracts.customerId, id)).orderBy(desc(contracts.id)),
    db.select().from(projects).where(eq(projects.customerId, id)).orderBy(desc(projects.id)),
  ])

  const qIds = qs.map((q) => q.id)
  const pIds = pjs.map((p) => p.id)
  const [items, insts, bills] = await Promise.all([
    qIds.length ? db.select().from(quotationItems).where(inArray(quotationItems.quotationId, qIds)) : Promise.resolve([]),
    pIds.length ? db.select().from(projectInstallments).where(inArray(projectInstallments.projectId, pIds)) : Promise.resolve([]),
    pIds.length ? db.select().from(billingDocs).where(inArray(billingDocs.projectId, pIds)).orderBy(desc(billingDocs.id)) : Promise.resolve([]),
  ])
  const pjName = new Map(pjs.map((p) => [p.id, p.name]))

  return NextResponse.json({
    customer: {
      id: cust.id, code: cust.code, bu: cust.bu,
      name: cust.name, chname: cust.chname, phone: cust.phone, province: cust.province,
      status: cust.status, quoteStatus: cust.quoteStatus,
    },
    quotes: qs.map((q) => ({
      id: q.id, code: q.code, rev: q.rev, status: q.status,
      issueDate: q.issueDate, validUntil: q.validUntil,
      grand: quoteTotals(q, items.filter((x) => x.quotationId === q.id), []).grand,
      trashed: q.deletedAt != null,
    })),
    contracts: ctrs.map((c) => ({
      id: c.id, code: c.code, status: c.status,
      amount: n0(c.contractAmount), signDate: c.signDate, dueDate: c.dueDate,
    })),
    projects: pjs.map((p) => {
      const ins = insts.filter((x) => x.projectId === p.id)
      return {
        id: p.id, code: p.code, name: p.name, status: p.status,
        contractAmount: n0(p.contractAmount), dueDate: p.dueDate,
        received: ins.filter((x) => x.payStatus === 'รับเงินแล้ว').reduce((a, x) => a + n0(x.paidAmount ?? x.amount), 0),
        instDone: ins.filter((x) => x.workStatus === 'ส่งมอบแล้ว').length, instTotal: ins.length,
        trashed: p.deletedAt != null,
      }
    }),
    billing: bills.map((d) => ({
      id: d.id, kind: d.kind, code: d.code, issueDate: d.issueDate,
      total: n0(d.total), status: d.status,
      projectId: d.projectId, projectName: pjName.get(d.projectId) ?? null,
    })),
  })
}
