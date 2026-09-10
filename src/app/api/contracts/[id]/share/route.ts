import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { contracts, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { canEdit } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * มาร์กว่าส่งสัญญาให้ลูกค้าทางไลน์แล้ว (ปุ่ม "ส่งไลน์" บนหน้าพิมพ์สัญญา)
 * ตัวสัญญาไปเป็นไฟล์ PDF ที่พนักงานบันทึกจากหน้าพิมพ์แล้วแนบในแชทเอง
 * สถานะสัญญาไม่ถูกแตะ — "ลงนามแล้ว" ต้องมาจากการเซ็นจริง ไม่ใช่แค่ส่งให้ลูกค้าดู
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [c] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1)
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (c.status === 'ยกเลิก') return NextResponse.json({ error: 'สัญญานี้ยกเลิกแล้ว ส่งให้ลูกค้าไม่ได้' }, { status: 400 })

  await db.insert(activityLog).values({
    customerId: c.customerId, quotationId: c.quotationId, userId: me.id,
    action: 'contract-share', field: 'ส่งไลน์', newValue: `ส่งสัญญา ${c.code} ให้ลูกค้าทางไลน์`,
  })
  return NextResponse.json({ ok: true, code: c.code })
}
