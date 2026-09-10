import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, customers, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { today } from '@/lib/biz'
import { canEdit } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * มาร์กว่าส่งใบเสนอราคาให้ลูกค้าทางไลน์แล้ว (ปุ่ม "ส่งไลน์" บนหน้าพิมพ์)
 * ตัวใบไปเป็นไฟล์ PDF ที่พนักงานบันทึกจากหน้าพิมพ์แล้วแนบในแชทเอง — ไลน์ส่วนตัวไม่มี API ให้ส่งไฟล์แทนได้
 * ใบร่างที่ส่งครั้งแรกจะเลื่อนสถานะเป็น "ส่งลูกค้าแล้ว" เหมือนกดปุ่มส่งลูกค้า
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (q.deletedAt) return NextResponse.json({ error: 'ใบนี้อยู่ในถังขยะ กู้คืนก่อนถึงจะส่งได้' }, { status: 400 })
  if (q.status === 'ยกเลิก') return NextResponse.json({ error: 'ใบนี้ยกเลิกแล้ว ส่งให้ลูกค้าไม่ได้' }, { status: 400 })

  if (q.status === 'ร่าง') {
    await db.update(quotations).set({ status: 'ส่งลูกค้าแล้ว', sentAt: today(), updatedAt: new Date() }).where(eq(quotations.id, id))
    await db.update(customers).set({ quoteStatus: 'ส่งใบเสนอราคาแล้ว', updatedAt: new Date() }).where(eq(customers.id, q.customerId))
    await db.insert(activityLog).values({
      customerId: q.customerId, quotationId: id, userId: me.id,
      action: 'quote-send', field: 'สถานะ', oldValue: q.status, newValue: 'ส่งลูกค้าแล้ว',
    })
  }
  await db.insert(activityLog).values({
    customerId: q.customerId, quotationId: id, userId: me.id,
    action: 'quote-share', field: 'ส่งไลน์', newValue: `ส่งใบ ${q.code} ให้ลูกค้าทางไลน์`,
  })
  return NextResponse.json({ ok: true, code: q.code })
}
