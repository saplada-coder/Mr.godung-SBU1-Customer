import { NextResponse } from 'next/server'
import { desc, isNull } from 'drizzle-orm'
import { getDb } from '@/db'
import { expenses, users, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num, n0 } from '@/lib/biz'
import { canEdit, OFFICE_CAT_KEYS, costCatMeta } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** ค่าใช้จ่ายสำนักงานทั้งหมด (expenses ที่ project_id เป็น null) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()
  const [rows, allUsers] = await Promise.all([
    db.select().from(expenses).where(isNull(expenses.projectId)).orderBy(desc(expenses.expenseDate), desc(expenses.id)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ])
  const userName = (uid: number | null) => { const u = allUsers.find((x) => x.id === uid); return u ? u.name || u.email : null }
  return NextResponse.json({
    expenses: rows.map((e) => ({
      id: e.id, category: e.category, description: e.description, vendor: e.vendor,
      amount: n0(e.amount), expenseDate: e.expenseDate, receiptUrl: e.receiptUrl,
      status: e.status, rejectReason: e.rejectReason,
      approvedByName: userName(e.approvedBy), approvedAt: e.approvedAt,
      createdBy: e.createdBy, createdByName: userName(e.createdBy), createdAt: e.createdAt,
    })),
  })
}

/** บันทึกค่าใช้จ่ายสำนักงาน — flow อนุมัติเดียวกับรายจ่ายโครงการ */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const b = await req.json()

  const category = String(b.category)
  if (!OFFICE_CAT_KEYS.includes(category)) return NextResponse.json({ error: 'หมวดค่าใช้จ่ายไม่ถูกต้อง' }, { status: 400 })
  const description = String(b.description ?? '').trim().slice(0, 2000)
  if (!description) return NextResponse.json({ error: 'ระบุรายละเอียดค่าใช้จ่าย' }, { status: 400 })
  const amount = num(b.amount)
  if (amount == null || amount <= 0) return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 })
  const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expenseDate)) ? String(b.expenseDate) : new Date().toISOString().slice(0, 10)
  const receiptUrl = typeof b.receiptUrl === 'string' && b.receiptUrl.startsWith('data:image/') && b.receiptUrl.length <= 900_000 ? b.receiptUrl : null

  const db = getDb()
  // ค่าใช้จ่ายบันทึกแล้วมีผลทันที ไม่ต้องรออนุมัติ (คิวอนุมัติใช้กับใบ PO เท่านั้น)
  const [created] = await db.insert(expenses).values({
    projectId: null, category: category as typeof expenses.$inferInsert.category, description,
    vendor: String(b.vendor ?? '').trim().slice(0, 160) || null,
    amount: String(amount), expenseDate, receiptUrl,
    status: 'อนุมัติแล้ว', approvedBy: me.id, approvedAt: new Date(),
    createdBy: me.id,
  }).returning()

  await db.insert(activityLog).values({
    userId: me.id, action: 'expense-create',
    field: 'สำนักงาน · ' + costCatMeta(category).label, newValue: `${description} ฿${amount.toLocaleString()}`,
  })
  return NextResponse.json({ ok: true, id: created.id, status: created.status })
}
