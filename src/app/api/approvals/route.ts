import { NextResponse } from 'next/server'
import { desc, eq, inArray, and } from 'drizzle-orm'
import { getDb } from '@/db'
import { purchaseOrders, expenses, projects, projectBudgets, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { n0 } from '@/lib/biz'

export const dynamic = 'force-dynamic'

/** กล่องรออนุมัติ — เฉพาะใบสั่งซื้อ (PO) เท่านั้น (ค่าใช้จ่ายบันทึกแล้วมีผลทันที) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()

  const [pending, projs, allUsers] = await Promise.all([
    db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'รออนุมัติ')).orderBy(desc(purchaseOrders.id)),
    db.select({ id: projects.id, name: projects.name, code: projects.code }).from(projects),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ])
  const projMap = new Map(projs.map((p) => [p.id, p]))
  const userMap = new Map(allUsers.map((u) => [u.id, u.name || u.email]))

  // ธงแดง "เกินงบ": งบหมวดของงาน vs จ่ายจริงแล้ว + ยอด PO ใบนี้
  const pids = [...new Set(pending.map((x) => x.projectId).filter((x): x is number => x != null))]
  const [budgets, approvedExps] = await Promise.all([
    pids.length ? db.select().from(projectBudgets).where(inArray(projectBudgets.projectId, pids)) : Promise.resolve([]),
    pids.length ? db.select().from(expenses).where(and(inArray(expenses.projectId, pids), eq(expenses.status, 'อนุมัติแล้ว'))) : Promise.resolve([]),
  ])
  const budgetOf = (pid: number, cat: string | null) => budgets.filter((x) => x.projectId === pid && x.category === cat).reduce((a, x) => a + n0(x.amount), 0)
  const spentOf = (pid: number, cat: string | null) => approvedExps.filter((x) => x.projectId === pid && x.category === cat).reduce((a, x) => a + n0(x.amount), 0)

  return NextResponse.json({
    pos: pending.map((x) => {
      const budget = x.projectId != null ? budgetOf(x.projectId, x.category) : 0
      const willBe = x.projectId != null ? spentOf(x.projectId, x.category) + n0(x.total) : 0
      return {
        id: x.id, code: x.code, vendor: x.vendor, category: x.category,
        projectId: x.projectId,
        projectName: x.projectId != null ? projMap.get(x.projectId)?.name || projMap.get(x.projectId)?.code || '—' : '🏢 สำนักงาน',
        issueDate: x.issueDate, deliveryDate: x.deliveryDate, total: n0(x.total),
        createdByName: x.createdBy ? userMap.get(x.createdBy) : null, createdAt: x.createdAt,
        overBudget: budget > 0 && willBe > budget, overBy: budget > 0 ? Math.max(0, willBe - budget) : 0,
      }
    }),
  })
}
