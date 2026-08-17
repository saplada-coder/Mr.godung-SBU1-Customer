import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { expenses, projects, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num } from '@/lib/biz'
import { canEdit, canApprove, isAdminUp, COST_CAT_KEYS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [cur] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const [p] = await db.select().from(projects).where(eq(projects.id, cur.projectId)).limit(1)
  if (p?.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว แก้ไขค่าใช้จ่ายไม่ได้' }, { status: 400 })

  const log = (action: string, field?: string, oldValue?: string, newValue?: string) =>
    db.insert(activityLog).values({ customerId: p?.customerId ?? null, projectId: cur.projectId, userId: me.id, action, field, oldValue, newValue })

  /* ---- อนุมัติ / ตีกลับ ---- */
  if (b.action === 'approve' || b.action === 'reject') {
    if (!canApprove(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่อนุมัติได้' }, { status: 403 })
    if (cur.status !== 'รออนุมัติ') return NextResponse.json({ error: 'รายการนี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 400 })
    if (b.action === 'approve') {
      await db.update(expenses).set({ status: 'อนุมัติแล้ว', approvedBy: me.id, approvedAt: new Date(), rejectReason: null }).where(eq(expenses.id, id))
      await log('expense-approve', undefined, undefined, `${cur.description} ฿${Number(cur.amount).toLocaleString()}`)
    } else {
      const reason = String(b.reason ?? '').trim()
      if (!reason) return NextResponse.json({ error: 'ตีกลับต้องระบุเหตุผล' }, { status: 400 })
      await db.update(expenses).set({ status: 'ตีกลับ', approvedBy: me.id, approvedAt: new Date(), rejectReason: reason }).where(eq(expenses.id, id))
      await log('expense-reject', 'เหตุผล', undefined, reason)
    }
    return NextResponse.json({ ok: true })
  }

  /* ---- แก้ไขรายการ (เฉพาะยังไม่อนุมัติ, ผู้บันทึกหรือ adminUp) — แก้แล้วกลับเข้าคิวรออนุมัติ ---- */
  if (!(isAdminUp(me.role) || cur.createdBy === me.id)) return NextResponse.json({ error: 'แก้ได้เฉพาะผู้บันทึกรายการ' }, { status: 403 })
  if (cur.status === 'อนุมัติแล้ว' && !isAdminUp(me.role)) return NextResponse.json({ error: 'รายการที่อนุมัติแล้ว แก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ' }, { status: 403 })

  const patch: Record<string, unknown> = {}
  if ('category' in b && COST_CAT_KEYS.includes(String(b.category))) patch.category = b.category
  if ('description' in b) { const v = String(b.description ?? '').trim().slice(0, 2000); if (v) patch.description = v }
  if ('vendor' in b) patch.vendor = String(b.vendor ?? '').trim().slice(0, 160) || null
  if ('amount' in b) { const v = num(b.amount); if (v != null && v > 0) patch.amount = String(v) }
  if ('expenseDate' in b && /^\d{4}-\d{2}-\d{2}$/.test(String(b.expenseDate))) patch.expenseDate = b.expenseDate
  if ('receiptUrl' in b) patch.receiptUrl = typeof b.receiptUrl === 'string' && b.receiptUrl.startsWith('data:image/') && b.receiptUrl.length <= 900_000 ? b.receiptUrl : null
  if (cur.status === 'ตีกลับ') { patch.status = isAdminUp(me.role) ? 'อนุมัติแล้ว' : 'รออนุมัติ'; patch.rejectReason = null }
  if (Object.keys(patch).length) {
    await db.update(expenses).set(patch).where(eq(expenses.id, id))
    await log('expense-edit', undefined, undefined, String(patch.description ?? cur.description))
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [cur] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!(isAdminUp(me.role) || (cur.createdBy === me.id && canEdit(me.role)))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (cur.status === 'อนุมัติแล้ว' && !isAdminUp(me.role)) return NextResponse.json({ error: 'รายการที่อนุมัติแล้ว ลบได้เฉพาะเจ้าของ/ผู้ดูแลระบบ' }, { status: 400 })
  const [p] = await db.select().from(projects).where(eq(projects.id, cur.projectId)).limit(1)
  if (p?.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว ลบค่าใช้จ่ายไม่ได้' }, { status: 400 })
  await db.delete(expenses).where(eq(expenses.id, id))
  await db.insert(activityLog).values({ customerId: p?.customerId ?? null, projectId: cur.projectId, userId: me.id, action: 'expense-delete', newValue: `${cur.description} ฿${Number(cur.amount).toLocaleString()}` })
  return NextResponse.json({ ok: true })
}
