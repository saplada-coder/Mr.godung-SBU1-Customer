import { NextResponse } from 'next/server'
import { desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, projectBudgets, projectInstallments, expenses, customers, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { n0, num, genDocCode, today } from '@/lib/biz'
import { canApprove, ST_WON } from '@/lib/constants'

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

/**
 * เปิดงานก่อสร้างตรงจากลูกค้า (ไม่มีใบเสนอราคา) — สำหรับงานเก่าที่ปิดการขายก่อนมีระบบใบเสนอ
 * งบ/งวดเงินเริ่มว่าง — ตั้งงบในแท็บงบประมาณ และกด "ใช้แม่แบบ 9 งวด" ในแท็บงวดงานได้
 */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canApprove(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่เปิดงานได้' }, { status: 403 })

  const b = await req.json()
  const customerId = Number(b.customerId)
  if (!Number.isFinite(customerId)) return NextResponse.json({ error: 'ต้องเลือกลูกค้า' }, { status: 400 })
  const db = getDb()
  const [cust] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1)
  if (!cust) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 })

  const contract = num(b.contractAmount) ?? (cust.amountActual != null ? Number(cust.amountActual) : null) ?? (cust.amountEst != null ? Number(cust.amountEst) : null)
  if (contract == null || contract <= 0) return NextResponse.json({ error: 'ระบุมูลค่าสัญญา (ลูกค้ารายนี้ไม่มีมูลค่าให้ดึงอัตโนมัติ)' }, { status: 400 })

  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.startDate)) ? String(b.startDate) : today()
  const code = await genDocCode(db, 'PJ', cust.bu, startDate)
  const name = String(b.name ?? '').trim().slice(0, 200) || `${cust.name || cust.chname || cust.code}${cust.cat ? ' · ' + cust.cat : ''}`

  const [pj] = await db.insert(projects).values({
    customerId, code, name, bu: cust.bu, contractAmount: String(contract),
    startDate, ownerId: cust.ownerId ?? me.id, createdBy: me.id,
  }).returning()

  // ฝั่ง CRM: ถ้ายังไม่ปิดการขาย → มาร์กปิดงาน (ได้งาน) พร้อมมูลค่าจริง
  if (cust.status !== ST_WON) {
    await db.update(customers).set({
      status: ST_WON,
      amountActual: cust.amountActual ?? String(contract),
      closedAt: cust.closedAt || today(), updatedAt: new Date(),
    }).where(eq(customers.id, customerId))
    await db.insert(activityLog).values({ customerId, userId: me.id, action: 'status', field: 'สถานะติดตาม', oldValue: cust.status, newValue: ST_WON })
  }
  await db.insert(activityLog).values({ customerId, projectId: pj.id, userId: me.id, action: 'project-open', newValue: code + ' (เปิดตรง ไม่มีใบเสนอ)' })

  return NextResponse.json({ ok: true, id: pj.id, code })
}
