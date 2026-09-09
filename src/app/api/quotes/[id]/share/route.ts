import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, customers, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { today } from '@/lib/biz'
import { canEdit } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** โทเคน 16 ตัวอักษรจาก crypto — เดาไม่ได้ ผู้ที่ไม่มีลิงก์เปิดใบไม่เจอ */
const mintToken = () => randomBytes(12).toString('base64url').slice(0, 16)

/** คำนำหน้าที่มีอยู่แล้ว/ชื่อนิติบุคคล — เติม "คุณ" ทับจะอ่านแปลก เช่น "คุณบริษัท พีดี อควา" */
const TITLED = /^(คุณ|นาย|นาง|นางสาว|น\.ส\.|ดร\.|บริษัท|บจก|บมจ|หจก|ห\.จ\.ก|ร้าน|Mr|Mrs|Ms|Dr)/i
/** เรียกลูกค้าว่า "คุณ..." ในข้อความที่ส่งไลน์เสมอ */
const khun = (name: string) => {
  const s = name.trim()
  return !s || TITLED.test(s) ? s : `คุณ${s}`
}

/**
 * ขอลิงก์สาธารณะของใบเสนอราคาเพื่อส่งให้ลูกค้า (ปุ่ม "ส่งไลน์" บนหน้าพิมพ์)
 * ใบหนึ่งมีโทเคนเดียวตลอด — กดซ้ำได้ลิงก์เดิม ลูกค้าที่เคยรับไปแล้วจึงยังเปิดได้
 * ใบร่างที่แชร์ครั้งแรกถือว่าส่งลูกค้าแล้ว เลื่อนสถานะให้เหมือนกดปุ่ม "ส่งลูกค้า"
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (q.deletedAt) return NextResponse.json({ error: 'ใบนี้อยู่ในถังขยะ กู้คืนก่อนถึงจะส่งได้' }, { status: 400 })
  if (q.status === 'ยกเลิก') return NextResponse.json({ error: 'ใบนี้ยกเลิกแล้ว ส่งให้ลูกค้าไม่ได้' }, { status: 400 })

  let token = q.shareToken
  if (!token) {
    token = mintToken()
    await db.update(quotations).set({ shareToken: token, updatedAt: new Date() }).where(eq(quotations.id, id))
  }

  // ใบร่างที่เพิ่งส่งออกครั้งแรก → เลื่อนสถานะเหมือนกดปุ่ม "ส่งลูกค้า"
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
    action: 'quote-share', field: 'ลิงก์ไลน์', newValue: `แชร์ลิงก์ใบ ${q.code}`,
  })

  const [cust] = await db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1)
  const origin = req.headers.get('origin') || new URL(req.url).origin
  const url = `${origin}/q/${token}`
  const text = [
    `ใบเสนอราคา ${q.code}${q.rev > 1 ? ` (Rev.${q.rev})` : ''}`,
    `ลูกค้า: ${khun(q.custName || cust?.name || cust?.chname || '-')}`,
    '',
    `เปิดดู / บันทึก PDF: ${url}`,
  ].join('\n')

  return NextResponse.json({ ok: true, url, text, code: q.code })
}
