import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, projectInstallments, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num, nstr } from '@/lib/biz'
import { canEdit } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** เพิ่มงวดใหม่ให้งานก่อสร้าง — ต่อท้ายงวดเดิม */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const projectId = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (p.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว เพิ่มงวดไม่ได้' }, { status: 400 })

  const title = String(b.title ?? '').trim().slice(0, 160)
  if (!title) return NextResponse.json({ error: 'ระบุชื่องวด' }, { status: 400 })
  const amount = num(b.amount)
  if (amount == null || amount < 0) return NextResponse.json({ error: 'ระบุจำนวนเงินของงวด' }, { status: 400 })

  const [{ nextSeq }] = (await db
    .select({ nextSeq: sql<number>`coalesce(max(seq),0)+1` })
    .from(projectInstallments)
    .where(eq(projectInstallments.projectId, projectId))) as unknown as [{ nextSeq: number }]

  const [created] = await db.insert(projectInstallments).values({
    projectId, seq: nextSeq, title,
    detail: String(b.detail ?? '').trim().slice(0, 4000) || null,
    percent: nstr(num(b.percent)), amount: String(amount),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate)) ? String(b.dueDate) : null,
    note: String(b.note ?? '').trim().slice(0, 500) || null,
  }).returning()

  await db.insert(activityLog).values({ customerId: p.customerId, projectId, userId: me.id, action: 'installment', field: title, newValue: `เพิ่มงวดใหม่ ฿${amount.toLocaleString()}` })
  return NextResponse.json({ ok: true, id: created.id })
}
