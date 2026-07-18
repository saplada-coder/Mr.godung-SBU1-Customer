import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { customers, appointments, notes, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getRates } from '@/lib/rates'
import { estimate } from '@/lib/serialize'
import { canEdit, isAdminUp, isFinal, LEAD_STATUSES, QUOTE_STATUSES, CHANNELS, ST_APPT } from '@/lib/constants'

export const dynamic = 'force-dynamic'

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

  if (typeof b.status === 'string' && LEAD_STATUSES.includes(b.status) && b.status !== cur.status) {
    patch.status = b.status
    logs.push({ action: 'status', field: 'status', oldValue: cur.status, newValue: b.status })
  }
  if (typeof b.quote === 'string' && QUOTE_STATUSES.includes(b.quote) && b.quote !== cur.quoteStatus) {
    patch.quoteStatus = b.quote
    logs.push({ action: 'quote', field: 'quote_status', oldValue: cur.quoteStatus, newValue: b.quote })
  }
  if ('phone' in b) patch.phone = normPhone(b.phone)
  if ('chname' in b) patch.chname = (b.chname ?? '').trim() || null
  if ('name' in b) patch.name = (b.name ?? '').trim() || null
  if ('channel' in b) patch.channel = CHANNELS.includes(b.channel) ? b.channel : null
  if ('province' in b) patch.province = (b.province ?? '').trim() || null
  if ('detail' in b) patch.detail = (b.detail ?? '').trim() || null
  if ('cat' in b) patch.cat = b.cat || null

  if ('k' in b || 'y' in b || 's' in b) {
    const k = num(b.k), y = num(b.y), s = num(b.s)
    patch.widthM = str(k); patch.lengthM = str(y); patch.heightM = str(s)
    const sqm = k != null && y != null ? k * y : null
    patch.sqm = str(sqm)
    const rates = await getRates()
    if (!isFinal((patch.status as string) ?? cur.status)) patch.amountEst = str(estimate(sqm, cur.bu, rates))
  }

  const effectiveStatus = (patch.status as string) ?? cur.status
  if ('amount' in b) {
    const amt = num(b.amount)
    if (isFinal(effectiveStatus)) patch.amountActual = str(amt)
    else patch.amountEst = str(amt)
  }
  if (isFinal(effectiveStatus) && patch.amountActual == null && cur.amountActual == null && !('amount' in b)) {
    if (cur.amountEst) patch.amountActual = cur.amountEst
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
      logs.push({ action: 'appt', newValue: `${b.appt.type} ${b.appt.date}` })
    }
  }

  if ('note' in b) {
    await db.delete(notes).where(eq(notes.customerId, id))
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
  if (!cur.code.startsWith('NEW-'))
    return NextResponse.json({ error: 'ลบได้เฉพาะรายการที่เพิ่มใหม่ (กันลบข้อมูลจากชีท)' }, { status: 400 })
  await db.delete(customers).where(and(eq(customers.id, id)))
  return NextResponse.json({ ok: true })
}
