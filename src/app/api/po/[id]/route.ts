import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { purchaseOrders, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { isAdminUp } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** อนุมัติ / ตีกลับ / ยกเลิกใบสั่งซื้อ (ห้ามลบ — เก็บเลขพร้อมเหตุผล) */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminUp(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่อนุมัติ/ยกเลิก PO ได้' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [cur] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (b.action === 'approve' || b.action === 'reject') {
    if (cur.status !== 'รออนุมัติ') return NextResponse.json({ error: 'PO นี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 400 })
    if (b.action === 'approve') {
      await db.update(purchaseOrders).set({ status: 'อนุมัติแล้ว', approvedBy: me.id, approvedAt: new Date(), rejectReason: null }).where(eq(purchaseOrders.id, id))
      await db.insert(activityLog).values({ projectId: cur.projectId, userId: me.id, action: 'po-approve', field: 'ใบสั่งซื้อ', newValue: cur.code })
    } else {
      const reason = String(b.reason ?? '').trim()
      if (!reason) return NextResponse.json({ error: 'ตีกลับต้องระบุเหตุผล' }, { status: 400 })
      await db.update(purchaseOrders).set({ status: 'ตีกลับ', approvedBy: me.id, approvedAt: new Date(), rejectReason: reason }).where(eq(purchaseOrders.id, id))
      await db.insert(activityLog).values({ projectId: cur.projectId, userId: me.id, action: 'po-reject', field: 'ใบสั่งซื้อ', oldValue: cur.code, newValue: reason })
    }
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'cancel') {
    const reason = String(b.reason ?? '').trim()
    if (!reason) return NextResponse.json({ error: 'ระบุเหตุผลการยกเลิก' }, { status: 400 })
    if (cur.status === 'ยกเลิก') return NextResponse.json({ error: 'PO นี้ถูกยกเลิกไปแล้ว' }, { status: 400 })
    await db.update(purchaseOrders).set({ status: 'ยกเลิก', cancelReason: reason }).where(eq(purchaseOrders.id, id))
    await db.insert(activityLog).values({ projectId: cur.projectId, userId: me.id, action: 'po-cancel', field: 'ใบสั่งซื้อ', oldValue: cur.code, newValue: reason })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
