import { NextResponse } from 'next/server'
import { desc, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, projectBudgets, projectInstallments, expenses, customers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { n0 } from '@/lib/biz'

export const dynamic = 'force-dynamic'

/** รายการงานก่อสร้างทั้งหมด + ยอดสรุปต่อโครงการ (งบ / จ่ายจริงอนุมัติแล้ว / รออนุมัติ / รับเงินแล้ว) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()

  const rows = await db.select().from(projects).orderBy(desc(projects.id))
  const ids = rows.map((r) => r.id)
  const [budgets, exps, insts, custs] = await Promise.all([
    ids.length ? db.select().from(projectBudgets).where(inArray(projectBudgets.projectId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(expenses).where(inArray(expenses.projectId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(projectInstallments).where(inArray(projectInstallments.projectId, ids)) : Promise.resolve([]),
    db.select({ id: customers.id, name: customers.name, chname: customers.chname, code: customers.code }).from(customers),
  ])
  const custMap = new Map(custs.map((c) => [c.id, c]))

  const list = rows.map((p) => {
    const bud = budgets.filter((x) => x.projectId === p.id)
    const exp = exps.filter((x) => x.projectId === p.id)
    const ins = insts.filter((x) => x.projectId === p.id)
    const budgetTotal = bud.reduce((a, x) => a + n0(x.amount), 0)
    const spent = exp.filter((x) => x.status === 'อนุมัติแล้ว').reduce((a, x) => a + n0(x.amount), 0)
    const pendingAmount = exp.filter((x) => x.status === 'รออนุมัติ').reduce((a, x) => a + n0(x.amount), 0)
    const received = ins.filter((x) => x.payStatus === 'รับเงินแล้ว').reduce((a, x) => a + n0(x.paidAmount ?? x.amount), 0)
    const c = custMap.get(p.customerId)
    return {
      id: p.id, code: p.code, name: p.name, bu: p.bu, customerId: p.customerId,
      customerName: c?.name || c?.chname || c?.code || null,
      contractAmount: n0(p.contractAmount), status: p.status,
      startDate: p.startDate, dueDate: p.dueDate, closedAt: p.closedAt,
      budgetTotal, spent, pendingAmount, pendingCount: exp.filter((x) => x.status === 'รออนุมัติ').length,
      received, instDone: ins.filter((x) => x.workStatus === 'ส่งมอบแล้ว').length, instTotal: ins.length,
      profit: received - spent,
    }
  })
  return NextResponse.json({ projects: list })
}
