import { NextResponse } from 'next/server'
import { desc, eq, inArray, and } from 'drizzle-orm'
import { getDb } from '@/db'
import { expenses, projects, projectBudgets, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { n0 } from '@/lib/biz'

export const dynamic = 'force-dynamic'

/** กล่องรออนุมัติ: ค่าใช้จ่ายที่รออนุมัติ (งานก่อสร้างทุกงาน + สำนักงาน) — ใบเสนอราคาไม่ต้องอนุมัติภายในแล้ว */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()

  const [pe, projs, allUsers] = await Promise.all([
    db.select().from(expenses).where(eq(expenses.status, 'รออนุมัติ')).orderBy(desc(expenses.id)),
    db.select({ id: projects.id, name: projects.name, code: projects.code }).from(projects),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ])
  const projMap = new Map(projs.map((p) => [p.id, p]))
  const userMap = new Map(allUsers.map((u) => [u.id, u.name || u.email]))

  // ธงแดง "เกินงบ": เทียบยอดที่จะเข้าหมวด (อนุมัติแล้ว + รายการนี้) กับงบของหมวดในงานนั้น
  const pids = [...new Set(pe.map((e) => e.projectId).filter((x): x is number => x != null))]
  const [budgets, approvedExps] = await Promise.all([
    pids.length ? db.select().from(projectBudgets).where(inArray(projectBudgets.projectId, pids)) : Promise.resolve([]),
    pids.length ? db.select().from(expenses).where(and(inArray(expenses.projectId, pids), eq(expenses.status, 'อนุมัติแล้ว'))) : Promise.resolve([]),
  ])
  const budgetOf = (pid: number, cat: string) => budgets.filter((x) => x.projectId === pid && x.category === cat).reduce((a, x) => a + n0(x.amount), 0)
  const spentOf = (pid: number, cat: string) => approvedExps.filter((x) => x.projectId === pid && x.category === cat).reduce((a, x) => a + n0(x.amount), 0)

  return NextResponse.json({
    expenses: pe.map((e) => {
      const p = e.projectId != null ? projMap.get(e.projectId) : undefined
      const budget = e.projectId != null ? budgetOf(e.projectId, e.category) : 0
      const willBe = e.projectId != null ? spentOf(e.projectId, e.category) + n0(e.amount) : 0
      return {
        // projectId null = ค่าใช้จ่ายสำนักงาน
        id: e.id, projectId: e.projectId, projectName: e.projectId == null ? '🏢 สำนักงาน' : p?.name || p?.code || '—',
        category: e.category, description: e.description, vendor: e.vendor,
        amount: n0(e.amount), expenseDate: e.expenseDate, receiptUrl: e.receiptUrl,
        createdByName: e.createdBy ? userMap.get(e.createdBy) : null, createdAt: e.createdAt,
        overBudget: budget > 0 && willBe > budget, overBy: budget > 0 ? Math.max(0, willBe - budget) : 0,
      }
    }),
  })
}
