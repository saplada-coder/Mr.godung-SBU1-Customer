import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationCosts, quotationInstallments, customers, users, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { serializeQuote, num, nstr, today } from '@/lib/biz'
import { canEdit, isAdminUp, canApprove, COST_CAT_KEYS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** สถานะที่ยังแก้ไขเนื้อหาใบได้ */
const EDITABLE = ['ร่าง', 'รออนุมัติ']

async function loadFull(id: number) {
  const db = getDb()
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) return null
  const [items, costs, insts, [cust]] = await Promise.all([
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)),
    db.select().from(quotationCosts).where(eq(quotationCosts.quotationId, id)),
    db.select().from(quotationInstallments).where(eq(quotationInstallments.quotationId, id)),
    db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1),
  ])
  return { q, items, costs, insts, cust }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const full = await loadFull(id)
  if (!full) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { q, items, costs, insts, cust } = full

  const withCosts = isAdminUp(me.role) || q.createdBy === me.id
  const acts = await db
    .select({ action: activityLog.action, field: activityLog.field, oldValue: activityLog.oldValue, newValue: activityLog.newValue, at: activityLog.createdAt, who: users.name, email: users.email })
    .from(activityLog).leftJoin(users, eq(activityLog.userId, users.id))
    .where(eq(activityLog.quotationId, id)).orderBy(desc(activityLog.createdAt)).limit(100)

  const quote = serializeQuote(
    q, items.sort((a, b) => a.seq - b.seq), costs, insts.sort((a, b) => a.seq - b.seq),
    { withCosts, customerName: cust?.name || cust?.chname, customerCode: cust?.code, bu: cust?.bu },
  )
  return NextResponse.json({
    quote,
    customer: cust ? { id: cust.id, name: cust.name, chname: cust.chname, phone: cust.phone, province: cust.province, code: cust.code, bu: cust.bu, taxId: null } : null,
    history: acts.map((a) => ({ kind: a.action, field: a.field, oldValue: a.oldValue, newValue: a.newValue, at: a.at, who: a.who || a.email || 'ระบบ' })),
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [cur] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const mine = cur.createdBy === me.id
  const admin = isAdminUp(me.role)
  const log = (action: string, field?: string, oldValue?: string, newValue?: string) =>
    db.insert(activityLog).values({ customerId: cur.customerId, quotationId: id, userId: me.id, action, field, oldValue, newValue })

  /* ---- transition actions ---- */
  if (typeof b.action === 'string') {
    const a = b.action
    if (a === 'submit') {
      if (!(mine || admin)) return NextResponse.json({ error: 'ส่งขออนุมัติได้เฉพาะผู้สร้างใบ' }, { status: 403 })
      if (cur.status !== 'ร่าง') return NextResponse.json({ error: 'ส่งขออนุมัติได้เฉพาะใบร่าง' }, { status: 400 })
      await db.update(quotations).set({ status: 'รออนุมัติ', updatedAt: new Date() }).where(eq(quotations.id, id))
      await log('quote-submit', 'สถานะ', cur.status, 'รออนุมัติ')
      return NextResponse.json({ ok: true })
    }
    if (a === 'approve' || a === 'reject') {
      if (!canApprove(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่อนุมัติได้' }, { status: 403 })
      if (cur.status !== 'รออนุมัติ') return NextResponse.json({ error: 'ใบนี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 400 })
      if (a === 'approve') {
        await db.update(quotations).set({ status: 'อนุมัติแล้ว', approvedBy: me.id, approvedAt: new Date(), rejectReason: null, updatedAt: new Date() }).where(eq(quotations.id, id))
        await log('quote-approve', 'สถานะ', cur.status, 'อนุมัติแล้ว')
      } else {
        const reason = String(b.reason ?? '').trim()
        if (!reason) return NextResponse.json({ error: 'ตีกลับต้องระบุเหตุผล' }, { status: 400 })
        await db.update(quotations).set({ status: 'ร่าง', rejectReason: reason, updatedAt: new Date() }).where(eq(quotations.id, id))
        await log('quote-reject', 'เหตุผล', undefined, reason)
      }
      return NextResponse.json({ ok: true })
    }
    if (a === 'send') {
      if (cur.status !== 'อนุมัติแล้ว') return NextResponse.json({ error: 'ต้องอนุมัติภายในก่อนส่งลูกค้า' }, { status: 400 })
      await db.update(quotations).set({ status: 'ส่งลูกค้าแล้ว', sentAt: today(), updatedAt: new Date() }).where(eq(quotations.id, id))
      await db.update(customers).set({ quoteStatus: 'ส่งใบเสนอราคาแล้ว', updatedAt: new Date() }).where(eq(customers.id, cur.customerId))
      await log('quote-send', 'สถานะ', cur.status, 'ส่งลูกค้าแล้ว')
      return NextResponse.json({ ok: true })
    }
    if (a === 'accept') {
      if (cur.status !== 'ส่งลูกค้าแล้ว') return NextResponse.json({ error: 'มาร์กตกลงได้เฉพาะใบที่ส่งลูกค้าแล้ว' }, { status: 400 })
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? String(b.date) : today()
      await db.update(quotations).set({ status: 'ลูกค้าตกลง', acceptedAt: d, updatedAt: new Date() }).where(eq(quotations.id, id))
      await log('quote-accept', 'วันที่ตอบรับ', undefined, d)
      return NextResponse.json({ ok: true })
    }
    if (a === 'cancel') {
      if (!(mine || admin)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      if (cur.status === 'ลูกค้าตกลง' && cur.projectId) return NextResponse.json({ error: 'ใบนี้เปิดงานก่อสร้างแล้ว ยกเลิกไม่ได้' }, { status: 400 })
      await db.update(quotations).set({ status: 'ยกเลิก', updatedAt: new Date() }).where(eq(quotations.id, id))
      await log('quote-cancel', 'สถานะ', cur.status, 'ยกเลิก')
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  /* ---- save content ---- */
  if (!EDITABLE.includes(cur.status)) return NextResponse.json({ error: 'ใบที่อนุมัติ/ส่งแล้ว แก้ไขไม่ได้ — กด "แก้ไขเป็นฉบับใหม่ (Revision)"' }, { status: 400 })
  if (!(mine || admin)) return NextResponse.json({ error: 'แก้ไขได้เฉพาะผู้สร้างใบหรือผู้ดูแลระบบ' }, { status: 403 })

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  const dateOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null
  if ('issueDate' in b) { const v = dateOk(b.issueDate); if (v) patch.issueDate = v }
  if ('validUntil' in b) patch.validUntil = dateOk(b.validUntil)
  if ('refNo' in b) patch.refNo = String(b.refNo ?? '').trim().slice(0, 60) || null
  if ('opFeePct' in b) patch.opFeePct = nstr(num(b.opFeePct))
  if ('discountDesign' in b) patch.discountDesign = nstr(num(b.discountDesign))
  if ('discountBuild' in b) patch.discountBuild = nstr(num(b.discountBuild))
  if ('vatPct' in b) patch.vatPct = nstr(num(b.vatPct))
  if ('permitDays' in b) patch.permitDays = num(b.permitDays)
  if ('buildDays' in b) patch.buildDays = num(b.buildDays)
  for (const k of ['exclusions', 'warranty', 'spec', 'note'] as const) {
    if (k in b) patch[k] = String(b[k] ?? '').trim().slice(0, 8000) || null
  }
  if ('includePortfolio' in b) patch.includePortfolio = !!b.includePortfolio
  await db.update(quotations).set(patch).where(eq(quotations.id, id))

  // รายการ/ต้นทุน/งวด — ส่งมาทั้งชุด แทนที่ของเดิม (ธุรกรรมเดี่ยวต่อชุด เรียบง่ายพอสำหรับฟอร์มเดียว)
  if (Array.isArray(b.items)) {
    await db.delete(quotationItems).where(eq(quotationItems.quotationId, id))
    const rows = (b.items as Record<string, unknown>[]).filter((i) => String(i.description ?? '').trim()).map((i, idx) => ({
      quotationId: id, seq: idx + 1,
      description: String(i.description).trim().slice(0, 2000),
      qty: nstr(num(i.qty)), unit: String(i.unit ?? '').trim().slice(0, 30) || null,
      unitPrice: nstr(num(i.unitPrice)), amount: String(num(i.amount) ?? 0),
      note: String(i.note ?? '').trim().slice(0, 500) || null,
    }))
    if (rows.length) await db.insert(quotationItems).values(rows)
  }
  if (Array.isArray(b.costs)) {
    await db.delete(quotationCosts).where(eq(quotationCosts.quotationId, id))
    const rows = (b.costs as Record<string, unknown>[])
      .filter((c) => COST_CAT_KEYS.includes(String(c.category)) && num(c.amount) != null && num(c.amount)! > 0)
      .map((c) => ({ quotationId: id, category: String(c.category) as typeof quotationCosts.$inferInsert.category, amount: String(num(c.amount)) }))
    if (rows.length) await db.insert(quotationCosts).values(rows)
  }
  if (Array.isArray(b.installments)) {
    await db.delete(quotationInstallments).where(eq(quotationInstallments.quotationId, id))
    const rows = (b.installments as Record<string, unknown>[]).filter((i) => String(i.title ?? '').trim()).map((i, idx) => ({
      quotationId: id, seq: idx + 1,
      title: String(i.title).trim().slice(0, 160),
      detail: String(i.detail ?? '').trim().slice(0, 4000) || null,
      percent: nstr(num(i.percent)), amount: String(num(i.amount) ?? 0),
      note: String(i.note ?? '').trim().slice(0, 500) || null,
    }))
    if (rows.length) await db.insert(quotationInstallments).values(rows)
  }
  await log('quote-edit')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [cur] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const mine = cur.createdBy === me.id
  if (!(isAdminUp(me.role) || (mine && canEdit(me.role)))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (cur.status !== 'ร่าง') return NextResponse.json({ error: 'ลบได้เฉพาะใบร่าง' }, { status: 400 })
  await db.delete(quotations).where(eq(quotations.id, id))
  return NextResponse.json({ ok: true })
}
