import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, projectLinks, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { normDocUrl } from '@/lib/biz'
import { canEdit } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** เพิ่มลิงก์เอกสารของลูกค้าเข้าคลังเอกสารของงาน */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const projectId = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // ไม่ล็อกตามสถานะงาน — คลังเอกสารต้องแนบเอกสารส่งมอบ/รับประกันหลังปิดงานได้

  const title = String(b.title ?? '').trim().slice(0, 160)
  if (!title) return NextResponse.json({ error: 'ระบุชื่อลิงก์ว่าเป็นเอกสารอะไร' }, { status: 400 })
  const url = normDocUrl(b.url)
  if (!url) return NextResponse.json({ error: 'ลิงก์ไม่ถูกต้อง — ต้องเป็น http:// หรือ https://' }, { status: 400 })

  const [created] = await db.insert(projectLinks).values({ projectId, title, url, createdBy: me.id }).returning()
  await db.insert(activityLog).values({ customerId: p.customerId, projectId, userId: me.id, action: 'link-add', field: title, newValue: url })
  return NextResponse.json({ ok: true, id: created.id })
}
