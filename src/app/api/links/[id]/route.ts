import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, projectLinks, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { normDocUrl } from '@/lib/biz'
import { canEdit } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * หาลิงก์ + งานที่ผูกอยู่ พร้อมเช็คสิทธิ์ (ใช้ร่วมกันทั้ง PATCH/DELETE)
 * ไม่ล็อกตามสถานะงาน — คลังเอกสารต้องแก้/แนบเอกสารส่งมอบหลังปิดงานได้
 */
async function loadEditable(id: number) {
  const fail = (error: string, status: number) => ({ ok: false as const, res: NextResponse.json({ error }, { status }) })
  const me = await getSessionUser()
  if (!me) return fail('unauthorized', 401)
  if (!canEdit(me.role)) return fail('forbidden', 403)
  const db = getDb()
  const [cur] = await db.select().from(projectLinks).where(eq(projectLinks.id, id)).limit(1)
  if (!cur) return fail('not found', 404)
  const [p] = await db.select().from(projects).where(eq(projects.id, cur.projectId)).limit(1)
  return { ok: true as const, me, db, cur, customerId: p?.customerId ?? null }
}

/** แก้ชื่อ/ลิงก์เอกสาร */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id)
  const r = await loadEditable(id)
  if (!r.ok) return r.res
  const { me, db, cur, customerId } = r
  const b = await req.json()

  const patch: Record<string, unknown> = {}
  const logs: string[] = []
  if ('title' in b) {
    const v = String(b.title ?? '').trim().slice(0, 160)
    if (!v) return NextResponse.json({ error: 'ระบุชื่อลิงก์ว่าเป็นเอกสารอะไร' }, { status: 400 })
    if (v !== cur.title) { patch.title = v; logs.push(`ชื่อ: ${cur.title} → ${v}`) }
  }
  if ('url' in b) {
    const v = normDocUrl(b.url)
    if (!v) return NextResponse.json({ error: 'ลิงก์ไม่ถูกต้อง — ต้องเป็น http:// หรือ https://' }, { status: 400 })
    if (v !== cur.url) { patch.url = v; logs.push('เปลี่ยนลิงก์') }
  }
  if (Object.keys(patch).length) {
    await db.update(projectLinks).set(patch).where(eq(projectLinks.id, id))
    await db.insert(activityLog).values({ customerId, projectId: cur.projectId, userId: me.id, action: 'link-edit', field: cur.title, newValue: logs.join(' · ') })
  }
  return NextResponse.json({ ok: true })
}

/** ลบลิงก์ออกจากคลังเอกสาร (ลบแค่ลิงก์ ไฟล์ต้นทางไม่ถูกแตะ) */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id)
  const r = await loadEditable(id)
  if (!r.ok) return r.res
  const { me, db, cur, customerId } = r
  await db.delete(projectLinks).where(eq(projectLinks.id, id))
  await db.insert(activityLog).values({ customerId, projectId: cur.projectId, userId: me.id, action: 'link-delete', field: cur.title, newValue: cur.url })
  return NextResponse.json({ ok: true })
}
