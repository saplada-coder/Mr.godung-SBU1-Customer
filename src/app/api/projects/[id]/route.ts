import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, projectBudgets, projectInstallments, expenses, customers, users, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { n0, num, today } from '@/lib/biz'
import { canEdit, canApprove, isAdminUp, COST_CAT_KEYS, PROJECT_STATUSES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [p] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [budgets, exps, insts, [cust], allUsers, acts] = await Promise.all([
    db.select().from(projectBudgets).where(eq(projectBudgets.projectId, id)),
    db.select().from(expenses).where(eq(expenses.projectId, id)).orderBy(desc(expenses.expenseDate), desc(expenses.id)),
    db.select().from(projectInstallments).where(eq(projectInstallments.projectId, id)),
    db.select().from(customers).where(eq(customers.id, p.customerId)).limit(1),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
    db.select({ action: activityLog.action, field: activityLog.field, oldValue: activityLog.oldValue, newValue: activityLog.newValue, at: activityLog.createdAt, who: users.name, email: users.email })
      .from(activityLog).leftJoin(users, eq(activityLog.userId, users.id))
      .where(eq(activityLog.projectId, id)).orderBy(desc(activityLog.createdAt)).limit(100),
  ])
  const userName = (uid: number | null) => { const u = allUsers.find((x) => x.id === uid); return u ? u.name || u.email : null }

  return NextResponse.json({
    project: {
      id: p.id, code: p.code, name: p.name, bu: p.bu, customerId: p.customerId,
      quotationId: p.quotationId, contractAmount: n0(p.contractAmount), vatPct: num(p.vatPct),
      status: p.status, startDate: p.startDate, dueDate: p.dueDate, closedAt: p.closedAt,
      closedByName: userName(p.closedBy), ownerId: p.ownerId, ownerName: userName(p.ownerId),
      customerName: cust?.name || cust?.chname || cust?.code || null, customerPhone: cust?.phone || null,
    },
    budgets: budgets.map((b) => ({ category: b.category, amount: n0(b.amount) })),
    expenses: exps.map((e) => ({
      id: e.id, category: e.category, description: e.description, vendor: e.vendor,
      amount: n0(e.amount), expenseDate: e.expenseDate, receiptUrl: e.receiptUrl,
      status: e.status, rejectReason: e.rejectReason,
      approvedByName: userName(e.approvedBy), approvedAt: e.approvedAt,
      createdBy: e.createdBy, createdByName: userName(e.createdBy), createdAt: e.createdAt,
    })),
    installments: insts.sort((a, b) => a.seq - b.seq).map((i) => ({
      id: i.id, seq: i.seq, title: i.title, detail: i.detail, percent: num(i.percent), amount: n0(i.amount),
      dueDate: i.dueDate, workStatus: i.workStatus, payStatus: i.payStatus, paidAt: i.paidAt, paidAmount: num(i.paidAmount), note: i.note,
    })),
    history: acts.map((a) => ({ kind: a.action, field: a.field, oldValue: a.oldValue, newValue: a.newValue, at: a.at, who: a.who || a.email || 'ระบบ' })),
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [cur] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const log = (action: string, field?: string, oldValue?: string, newValue?: string) =>
    db.insert(activityLog).values({ customerId: cur.customerId, projectId: id, userId: me.id, action, field, oldValue, newValue })

  /* ---- ปิดงาน / เปิดกลับ ---- */
  if (b.action === 'close') {
    if (!canApprove(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่ปิดงานได้' }, { status: 403 })
    if (cur.status === 'ปิดงาน') return NextResponse.json({ error: 'งานนี้ปิดแล้ว' }, { status: 400 })
    const [insts, exps] = await Promise.all([
      db.select().from(projectInstallments).where(eq(projectInstallments.projectId, id)),
      db.select().from(expenses).where(eq(expenses.projectId, id)),
    ])
    const unpaid = insts.filter((i) => i.payStatus !== 'รับเงินแล้ว').length
    const pending = exps.filter((e) => e.status === 'รออนุมัติ').length
    if (!b.force && (unpaid || pending))
      return NextResponse.json({ error: `ยังปิดไม่ได้: งวดที่ยังไม่รับเงิน ${unpaid} งวด · ค่าใช้จ่ายค้างอนุมัติ ${pending} รายการ`, unpaid, pending, canForce: true }, { status: 409 })
    await db.update(projects).set({ status: 'ปิดงาน', closedAt: today(), closedBy: me.id, updatedAt: new Date() }).where(eq(projects.id, id))
    await log('project-close', 'สถานะ', cur.status, 'ปิดงาน')
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'reopen') {
    if (me.role !== 'owner') return NextResponse.json({ error: 'เฉพาะเจ้าของที่ปลดล็อกงานที่ปิดแล้วได้' }, { status: 403 })
    if (cur.status !== 'ปิดงาน') return NextResponse.json({ error: 'งานนี้ยังไม่ปิด' }, { status: 400 })
    await db.update(projects).set({ status: 'กำลังก่อสร้าง', closedAt: null, closedBy: null, updatedAt: new Date() }).where(eq(projects.id, id))
    await log('project-reopen', 'สถานะ', 'ปิดงาน', 'กำลังก่อสร้าง')
    return NextResponse.json({ ok: true })
  }

  if (cur.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว แก้ไขไม่ได้ (เจ้าของปลดล็อกได้)' }, { status: 400 })

  /* ---- แก้ข้อมูลงาน ---- */
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  const dateOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null
  if ('name' in b) { const v = String(b.name ?? '').trim().slice(0, 200); if (v) patch.name = v }
  if ('status' in b && PROJECT_STATUSES.includes(b.status) && b.status !== 'ปิดงาน' && b.status !== cur.status) {
    patch.status = b.status
    await log('project-status', 'สถานะ', cur.status, b.status)
  }
  if ('startDate' in b) patch.startDate = dateOk(b.startDate)
  if ('dueDate' in b) patch.dueDate = dateOk(b.dueDate)
  if ('contractAmount' in b) {
    if (!isAdminUp(me.role)) return NextResponse.json({ error: 'มูลค่าสัญญาแก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ' }, { status: 403 })
    const v = num(b.contractAmount)
    if (v != null && v !== n0(cur.contractAmount)) { await log('project-edit', 'มูลค่าสัญญา', String(n0(cur.contractAmount)), String(v)); patch.contractAmount = String(v) }
  }
  await db.update(projects).set(patch).where(eq(projects.id, id))

  /* ---- ตั้งงบรายหมวด (แทนที่ทั้งชุด) — เฉพาะ adminUp ---- */
  if (Array.isArray(b.budgets)) {
    if (!isAdminUp(me.role)) return NextResponse.json({ error: 'งบประมาณแก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ' }, { status: 403 })
    await db.delete(projectBudgets).where(eq(projectBudgets.projectId, id))
    const rows = (b.budgets as Record<string, unknown>[])
      .filter((x) => COST_CAT_KEYS.includes(String(x.category)) && num(x.amount) != null && num(x.amount)! > 0)
      .map((x) => ({ projectId: id, category: String(x.category) as typeof projectBudgets.$inferInsert.category, amount: String(num(x.amount)) }))
    if (rows.length) await db.insert(projectBudgets).values(rows)
    await log('budget-edit', 'งบประมาณ', undefined, rows.map((r) => `${r.category}:${r.amount}`).join(', '))
  }
  return NextResponse.json({ ok: true })
}
