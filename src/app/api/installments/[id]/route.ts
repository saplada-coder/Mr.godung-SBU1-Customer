import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { projectInstallments, projects, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num, nstr, today } from '@/lib/biz'
import { canEdit } from '@/lib/constants'
import { INST_WORK_STATUSES, INST_PAY_STATUSES } from '@/db/schema'

export const dynamic = 'force-dynamic'

/** อัปเดตงวดงาน/งวดเงินของงานจริง: สถานะงาน สถานะเงิน วันรับเงิน จำนวนรับจริง */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [cur] = await db.select().from(projectInstallments).where(eq(projectInstallments.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const [p] = await db.select().from(projects).where(eq(projects.id, cur.projectId)).limit(1)
  if (p?.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว แก้ไขงวดไม่ได้' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  const logs: string[] = []
  if ('workStatus' in b && (INST_WORK_STATUSES as readonly string[]).includes(b.workStatus) && b.workStatus !== cur.workStatus) {
    patch.workStatus = b.workStatus
    logs.push(`งาน: ${cur.workStatus} → ${b.workStatus}`)
  }
  if ('payStatus' in b && (INST_PAY_STATUSES as readonly string[]).includes(b.payStatus) && b.payStatus !== cur.payStatus) {
    patch.payStatus = b.payStatus
    if (b.payStatus === 'รับเงินแล้ว') {
      patch.paidAt = /^\d{4}-\d{2}-\d{2}$/.test(String(b.paidAt)) ? b.paidAt : today()
      patch.paidAmount = String(num(b.paidAmount) ?? Number(cur.amount))
    } else { patch.paidAt = null; patch.paidAmount = null }
    logs.push(`เงิน: ${cur.payStatus} → ${b.payStatus}`)
  }
  if ('paidAmount' in b && cur.payStatus === 'รับเงินแล้ว' && !('payStatus' in b)) {
    const v = num(b.paidAmount); if (v != null) { patch.paidAmount = String(v); logs.push(`รับจริง ฿${v.toLocaleString()}`) }
  }
  if ('paidAt' in b && /^\d{4}-\d{2}-\d{2}$/.test(String(b.paidAt)) && !('payStatus' in b)) patch.paidAt = b.paidAt
  if ('dueDate' in b) patch.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate)) ? b.dueDate : null
  if ('note' in b) patch.note = String(b.note ?? '').trim().slice(0, 500) || null
  /* ---- แก้เนื้อหางวด: ชื่อ / % / จำนวนเงิน / รายละเอียด ---- */
  if ('title' in b) { const v = String(b.title ?? '').trim().slice(0, 160); if (v) { if (v !== cur.title) logs.push(`ชื่อ: ${cur.title} → ${v}`); patch.title = v } }
  if ('detail' in b) patch.detail = String(b.detail ?? '').trim().slice(0, 4000) || null
  if ('percent' in b) patch.percent = nstr(num(b.percent))
  if ('amount' in b) {
    const v = num(b.amount)
    if (v != null && v >= 0 && v !== Number(cur.amount)) { logs.push(`ยอด ฿${Number(cur.amount).toLocaleString()} → ฿${v.toLocaleString()}`); patch.amount = String(v) }
  }

  if (Object.keys(patch).length) {
    await db.update(projectInstallments).set(patch).where(eq(projectInstallments.id, id))
    if (logs.length)
      await db.insert(activityLog).values({ customerId: p?.customerId ?? null, projectId: cur.projectId, userId: me.id, action: 'installment', field: cur.title, newValue: logs.join(' · ') })
  }
  return NextResponse.json({ ok: true })
}

/** ลบงวด — งวดที่รับเงินแล้วลบไม่ได้ (ต้องเปลี่ยนสถานะเงินกลับก่อน) */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [cur] = await db.select().from(projectInstallments).where(eq(projectInstallments.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const [p] = await db.select().from(projects).where(eq(projects.id, cur.projectId)).limit(1)
  if (p?.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว ลบงวดไม่ได้' }, { status: 400 })
  if (cur.payStatus === 'รับเงินแล้ว') return NextResponse.json({ error: 'งวดนี้รับเงินแล้ว ลบไม่ได้ — เปลี่ยนสถานะเงินกลับก่อน' }, { status: 400 })
  await db.delete(projectInstallments).where(eq(projectInstallments.id, id))
  await db.insert(activityLog).values({ customerId: p?.customerId ?? null, projectId: cur.projectId, userId: me.id, action: 'installment', field: cur.title, newValue: `ลบงวด (฿${Number(cur.amount).toLocaleString()})` })
  return NextResponse.json({ ok: true })
}
