import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, expenses, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num } from '@/lib/biz'
import { canEdit, isAdminUp, COST_CAT_KEYS, costCatMeta } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** บันทึกค่าใช้จ่ายใหม่ — เข้าคิวรออนุมัติ (เจ้าของ/ผู้ดูแลระบบบันทึกเอง = อนุมัติทันที) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const projectId = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (p.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว บันทึกค่าใช้จ่ายเพิ่มไม่ได้' }, { status: 400 })

  const category = String(b.category)
  if (!COST_CAT_KEYS.includes(category)) return NextResponse.json({ error: 'หมวดค่าใช้จ่ายไม่ถูกต้อง' }, { status: 400 })
  const description = String(b.description ?? '').trim().slice(0, 2000)
  if (!description) return NextResponse.json({ error: 'ระบุรายละเอียดค่าใช้จ่าย' }, { status: 400 })
  const amount = num(b.amount)
  if (amount == null || amount <= 0) return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 })
  const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expenseDate)) ? String(b.expenseDate) : new Date().toISOString().slice(0, 10)
  const receiptUrl = typeof b.receiptUrl === 'string' && b.receiptUrl.startsWith('data:image/') && b.receiptUrl.length <= 900_000 ? b.receiptUrl : null

  const auto = isAdminUp(me.role)
  const [created] = await db.insert(expenses).values({
    projectId, category: category as typeof expenses.$inferInsert.category, description,
    vendor: String(b.vendor ?? '').trim().slice(0, 160) || null,
    amount: String(amount), expenseDate, receiptUrl,
    status: auto ? 'อนุมัติแล้ว' : 'รออนุมัติ',
    approvedBy: auto ? me.id : null, approvedAt: auto ? new Date() : null,
    createdBy: me.id,
  }).returning()

  await db.insert(activityLog).values({
    customerId: p.customerId, projectId, userId: me.id, action: 'expense-create',
    field: costCatMeta(category).label, newValue: `${description} ฿${amount.toLocaleString()}`,
  })
  return NextResponse.json({ ok: true, id: created.id, status: created.status })
}
