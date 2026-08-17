import { NextResponse } from 'next/server'
import { desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationCosts, expenses, projects, customers, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { quoteTotals, n0 } from '@/lib/biz'

export const dynamic = 'force-dynamic'

/** กล่องรออนุมัติ: ใบเสนอราคาที่รออนุมัติภายใน + ค่าใช้จ่ายที่รออนุมัติ (ทุกงาน) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()

  const [pq, pe, custs, projs, allUsers] = await Promise.all([
    db.select().from(quotations).where(eq(quotations.status, 'รออนุมัติ')).orderBy(desc(quotations.id)),
    db.select().from(expenses).where(eq(expenses.status, 'รออนุมัติ')).orderBy(desc(expenses.id)),
    db.select({ id: customers.id, name: customers.name, chname: customers.chname, code: customers.code }).from(customers),
    db.select({ id: projects.id, name: projects.name, code: projects.code }).from(projects),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ])
  const qids = pq.map((q) => q.id)
  const [items, costs] = await Promise.all([
    qids.length ? db.select().from(quotationItems).where(inArray(quotationItems.quotationId, qids)) : Promise.resolve([]),
    qids.length ? db.select().from(quotationCosts).where(inArray(quotationCosts.quotationId, qids)) : Promise.resolve([]),
  ])
  const custMap = new Map(custs.map((c) => [c.id, c.name || c.chname || c.code]))
  const projMap = new Map(projs.map((p) => [p.id, p]))
  const userMap = new Map(allUsers.map((u) => [u.id, u.name || u.email]))

  return NextResponse.json({
    quotes: pq.map((q) => {
      const t = quoteTotals(q, items.filter((i) => i.quotationId === q.id), costs.filter((c) => c.quotationId === q.id))
      return {
        id: q.id, code: q.code, rev: q.rev, customerName: custMap.get(q.customerId) || '—',
        total: t.total, profit: t.profit, profitPct: t.profitPct,
        creatorName: q.createdBy ? userMap.get(q.createdBy) : null, updatedAt: q.updatedAt,
      }
    }),
    expenses: pe.map((e) => {
      const p = projMap.get(e.projectId)
      return {
        id: e.id, projectId: e.projectId, projectName: p?.name || p?.code || '—',
        category: e.category, description: e.description, vendor: e.vendor,
        amount: n0(e.amount), expenseDate: e.expenseDate, receiptUrl: e.receiptUrl,
        createdByName: e.createdBy ? userMap.get(e.createdBy) : null, createdAt: e.createdAt,
      }
    }),
  })
}
