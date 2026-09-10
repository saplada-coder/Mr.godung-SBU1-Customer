import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { keyFindings } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { canEdit, isAdminUp, KF_STATUSES, type KfStatus } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const str = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}
const dateOk = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null)

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [cur] = await db.select().from(keyFindings).where(eq(keyFindings.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const p: Record<string, unknown> = { updatedAt: new Date() }
  if ('status' in b && KF_STATUSES.includes(b.status)) p.status = b.status as KfStatus
  if ('topic' in b) p.topic = str(b.topic, 160)
  if ('owner' in b) p.owner = str(b.owner, 120)
  if ('actionPlan' in b) p.actionPlan = str(b.actionPlan, 4000)
  if ('note' in b) p.note = str(b.note, 4000)
  if ('meetingDate' in b) p.meetingDate = dateOk(b.meetingDate) ?? cur.meetingDate
  if ('dueDate' in b) p.dueDate = dateOk(b.dueDate)
  // Key Finding เป็นใจความหลักของแถว ปล่อยให้ว่างแล้วแถวจะไม่เหลือความหมาย
  if ('finding' in b) {
    const f = str(b.finding, 4000)
    if (!f) return NextResponse.json({ error: 'ต้องกรอก Key Finding' }, { status: 400 })
    p.finding = f
  }
  await db.update(keyFindings).set(p).where(eq(keyFindings.id, id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminUp(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่ลบได้' }, { status: 403 })
  const id = Number((await ctx.params).id)
  await getDb().delete(keyFindings).where(eq(keyFindings.id, id))
  return NextResponse.json({ ok: true })
}
