import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { keyFindings, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { today } from '@/lib/biz'
import { canEdit, KF_STATUSES, type KfStatus } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const str = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}
const dateOk = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null)

/** รายการ Key Finding ทั้งหมด — เรียงงานที่ยังไม่เสร็จและใกล้ครบกำหนดไว้บนสุดจากฝั่งหน้าจอ */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()
  const rows = await db
    .select({
      id: keyFindings.id, meetingDate: keyFindings.meetingDate, topic: keyFindings.topic,
      finding: keyFindings.finding, actionPlan: keyFindings.actionPlan, owner: keyFindings.owner,
      dueDate: keyFindings.dueDate, status: keyFindings.status, note: keyFindings.note,
      createdAt: keyFindings.createdAt, createdByName: users.name, createdByEmail: users.email,
    })
    .from(keyFindings)
    .leftJoin(users, eq(keyFindings.createdBy, users.id))
    .orderBy(desc(keyFindings.meetingDate), desc(keyFindings.id))
  return NextResponse.json({
    findings: rows.map((r) => ({ ...r, createdByName: r.createdByName || r.createdByEmail || null })),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const b = await req.json()
  const finding = str(b.finding, 4000)
  if (!finding) return NextResponse.json({ error: 'ต้องกรอก Key Finding' }, { status: 400 })
  const [made] = await getDb().insert(keyFindings).values({
    meetingDate: dateOk(b.meetingDate) ?? today(),
    topic: str(b.topic, 160),
    finding,
    actionPlan: str(b.actionPlan, 4000),
    owner: str(b.owner, 120),
    dueDate: dateOk(b.dueDate),
    status: (KF_STATUSES.includes(b.status) ? b.status : 'ยังไม่เริ่ม') as KfStatus,
    note: str(b.note, 4000),
    createdBy: me.id,
  }).returning({ id: keyFindings.id })
  return NextResponse.json({ ok: true, id: made.id })
}
