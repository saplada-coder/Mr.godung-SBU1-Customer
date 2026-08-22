import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { customers, appointments, notes, activityLog, users, quotations, projects } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getRates } from '@/lib/rates'
import { estimate } from '@/lib/serialize'
import { canEdit, isAdminUp, isFinal, LEAD_STATUSES, QUOTE_STATUSES, CHANNELS, ST_APPT } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** ประวัติของลูกค้า 1 ราย: ใครแก้อะไรเมื่อไหร่ + โน้ตติดตาม (เรียงใหม่สุดก่อน) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const db = getDb()

  const acts = await db
    .select({ action: activityLog.action, field: activityLog.field, oldValue: activityLog.oldValue, newValue: activityLog.newValue, at: activityLog.createdAt, who: users.name, email: users.email })
    .from(activityLog).leftJoin(users, eq(activityLog.userId, users.id))
    .where(eq(activityLog.customerId, id)).orderBy(desc(activityLog.createdAt)).limit(200)
  const ns = await db
    .select({ body: notes.body, at: notes.createdAt, who: users.name, email: users.email })
    .from(notes).leftJoin(users, eq(notes.createdBy, users.id))
    .where(eq(notes.customerId, id)).orderBy(desc(notes.createdAt))

  const history = [
    ...acts.map((a) => ({ kind: a.action, field: a.field, oldValue: a.oldValue, newValue: a.newValue, text: null as string | null, at: a.at, who: a.who || a.email || 'ระบบ' })),
    ...ns.map((n) => ({ kind: 'note', field: null, oldValue: null, newValue: null, text: n.body, at: n.at, who: n.who || n.email || '—' })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at))

  return NextResponse.json({ history })
}

const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null
  const x = Number(v); return Number.isFinite(x) ? x : null
}
const str = (v: number | null) => (v == null ? null : String(v))
function normPhone(p: unknown): string | null {
  let s = String(p ?? '').replace(/[^0-9+]/g, '')
  if (!s) return null
  if (s.startsWith('66')) s = '0' + s.slice(2)
  return s.slice(0, 12)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()

  const [cur] = await db.select().from(customers).where(eq(customers.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  const logs: { action: string; field?: string; oldValue?: string; newValue?: string }[] = []
  // log การแก้ไขทีละช่อง (เก็บว่าใครแก้เมื่อไหร่ผ่าน userId + created_at)
  const chg = (field: string, oldV: string | null | undefined, newV: string | null | undefined) => {
    if ((oldV ?? '') !== (newV ?? '')) logs.push({ action: 'edit', field, oldValue: oldV ?? '', newValue: newV ?? '' })
  }
  const chgNum = (field: string, oldV: string | null | undefined, newV: string | null | undefined) => {
    const o = oldV == null || oldV === '' ? null : Number(oldV), n = newV == null || newV === '' ? null : Number(newV)
    if (o !== n) logs.push({ action: 'edit', field, oldValue: o == null ? '' : String(o), newValue: n == null ? '' : String(n) })
  }

  if (typeof b.status === 'string' && LEAD_STATUSES.includes(b.status) && b.status !== cur.status) {
    patch.status = b.status
    logs.push({ action: 'status', field: 'สถานะติดตาม', oldValue: cur.status, newValue: b.status })
  }
  if (typeof b.quote === 'string' && QUOTE_STATUSES.includes(b.quote) && b.quote !== cur.quoteStatus) {
    patch.quoteStatus = b.quote
    logs.push({ action: 'quote', field: 'ใบเสนอราคา', oldValue: cur.quoteStatus, newValue: b.quote })
  }
  if ('phone' in b) { const v = normPhone(b.phone); chg('เบอร์โทร', cur.phone, v); patch.phone = v }
  if ('chname' in b) { const v = (b.chname ?? '').trim() || null; chg('ชื่อช่องทาง', cur.chname, v); patch.chname = v }
  if ('name' in b) { const v = (b.name ?? '').trim() || null; chg('ชื่อลูกค้า', cur.name, v); patch.name = v }
  if ('channel' in b) { const v = CHANNELS.includes(b.channel) ? b.channel : null; chg('ช่องทาง', cur.channel, v); patch.channel = v }
  if ('province' in b) { const v = (b.province ?? '').trim() || null; chg('จังหวัด', cur.province, v); patch.province = v }
  if ('detail' in b) { const v = (b.detail ?? '').trim() || null; chg('รายละเอียด', cur.detail, v); patch.detail = v }
  if ('cat' in b) { const v = b.cat || null; chg('ประเภทธุรกิจ', cur.cat, v); patch.cat = v }
  if ('d' in b) { const v = /^\d{4}-\d{2}-\d{2}$/.test(String(b.d)) ? b.d : null; chg('วันที่รับข้อมูล', cur.inquiredAt, v); patch.inquiredAt = v }

  if ('k' in b || 'y' in b || 's' in b || 'sqm' in b) {
    const k = num(b.k), y = num(b.y), s = num(b.s)
    patch.widthM = str(k); patch.lengthM = str(y); patch.heightM = str(s)
    // มี ก×ย → คำนวณให้; ไม่มี → ใช้ ตร.ม. ที่กรอกตรงๆ
    const sqm = k != null && y != null ? k * y : num(b.sqm)
    chgNum('พื้นที่ (ตร.ม.)', cur.sqm, str(sqm))
    patch.sqm = str(sqm)
    const rates = await getRates()
    if (!isFinal((patch.status as string) ?? cur.status)) patch.amountEst = str(estimate(sqm, cur.bu, rates))
  }

  const effectiveStatus = (patch.status as string) ?? cur.status
  if ('amount' in b) {
    const amt = num(b.amount)
    if (isFinal(effectiveStatus)) { chgNum('มูลค่าจริง', cur.amountActual, str(amt)); patch.amountActual = str(amt) }
    else { chgNum('มูลค่าประมาณ', cur.amountEst, str(amt)); patch.amountEst = str(amt) }
  }
  if (isFinal(effectiveStatus) && patch.amountActual == null && cur.amountActual == null && !('amount' in b)) {
    if (cur.amountEst) patch.amountActual = cur.amountEst
  }

  // วันที่ปิดงาน: รับค่าที่กรอกมา + ตั้งเป็นวันนี้อัตโนมัติเมื่อเพิ่งเปลี่ยนเป็นสถานะปิด
  if ('closedAt' in b) { const v = /^\d{4}-\d{2}-\d{2}$/.test(String(b.closedAt)) ? b.closedAt : null; chg('วันที่ปิดงาน', cur.closedAt, v); patch.closedAt = v }
  if (isFinal(effectiveStatus)) {
    if (patch.closedAt == null && cur.closedAt == null) {
      patch.closedAt = new Date().toISOString().slice(0, 10)
      logs.push({ action: 'edit', field: 'วันที่ปิดงาน', oldValue: '', newValue: patch.closedAt as string })
    }
  } else if (cur.closedAt && !('closedAt' in b)) {
    patch.closedAt = null // ออกจากสถานะปิด → ล้างวันที่ปิด
  }

  await db.update(customers).set(patch).where(eq(customers.id, id))

  if ('appt' in b) {
    if (effectiveStatus === ST_APPT && !(b.appt && b.appt.date))
      return NextResponse.json({ error: 'สถานะนัด ต้องระบุวันที่นัด' }, { status: 400 })
    await db.delete(appointments).where(eq(appointments.customerId, id))
    if (b.appt && b.appt.date) {
      await db.insert(appointments).values({
        customerId: id, type: b.appt.type === 'zoom' ? 'zoom' : 'site',
        apptDate: b.appt.date, apptTime: b.appt.time || null, note: (b.appt.note ?? '').trim() || null, createdBy: me.id,
      })
      logs.push({ action: 'appt', field: 'นัดหมาย', newValue: `${b.appt.type === 'zoom' ? 'Zoom' : 'ดูหน้างาน'} ${b.appt.date}` })
    }
  }

  // note = บันทึกการติดตามแบบต่อท้าย (ไม่ลบของเก่า เก็บเป็นประวัติว่าใครโน้ตอะไรเมื่อไหร่)
  if ('note' in b) {
    const body = (b.note ?? '').trim()
    if (body) await db.insert(notes).values({ customerId: id, body, createdBy: me.id })
  }

  if (logs.length) await db.insert(activityLog).values(logs.map((l) => ({ ...l, customerId: id, userId: me.id })))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminUp(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่ลบได้' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [cur] = await db.select().from(customers).where(eq(customers.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (cur.code.startsWith('QT-'))
    return NextResponse.json({ error: 'ลบได้เฉพาะรายการที่เพิ่มใหม่ (กันลบข้อมูลจากชีท)' }, { status: 400 })
  // กันลบลูกค้าที่มีเอกสารผูกอยู่ — ลบได้เฉพาะรายการซ้ำ/รายการเปล่า
  const [q] = await db.select({ id: quotations.id }).from(quotations).where(eq(quotations.customerId, id)).limit(1)
  if (q) return NextResponse.json({ error: 'ลบไม่ได้ — ลูกค้ารายนี้มีใบเสนอราคาแล้ว' }, { status: 400 })
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.customerId, id)).limit(1)
  if (p) return NextResponse.json({ error: 'ลบไม่ได้ — ลูกค้ารายนี้มีงานก่อสร้างแล้ว' }, { status: 400 })
  await db.delete(customers).where(and(eq(customers.id, id)))
  return NextResponse.json({ ok: true })
}
