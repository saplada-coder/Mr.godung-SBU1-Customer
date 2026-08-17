import { NextResponse } from 'next/server'
import { desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationCosts, quotationInstallments, customers, users, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getRates } from '@/lib/rates'
import { getSettings } from '@/lib/settings'
import { genDocCode, serializeQuote, today } from '@/lib/biz'
import { canEdit, isAdminUp, DEFAULT_INSTALLMENTS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()

  const rows = await db.select().from(quotations).orderBy(desc(quotations.id))
  const ids = rows.map((r) => r.id)
  const [items, costs, insts, custs, allUsers] = await Promise.all([
    ids.length ? db.select().from(quotationItems).where(inArray(quotationItems.quotationId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(quotationCosts).where(inArray(quotationCosts.quotationId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(quotationInstallments).where(inArray(quotationInstallments.quotationId, ids)) : Promise.resolve([]),
    db.select({ id: customers.id, name: customers.name, chname: customers.chname, code: customers.code, bu: customers.bu }).from(customers),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ])
  const custMap = new Map(custs.map((c) => [c.id, c]))
  const userMap = new Map(allUsers.map((u) => [u.id, u.name || u.email]))

  const quotes = rows.map((q) => {
    const c = custMap.get(q.customerId)
    const withCosts = isAdminUp(me.role) || q.createdBy === me.id
    return serializeQuote(
      q,
      items.filter((i) => i.quotationId === q.id).sort((a, b) => a.seq - b.seq),
      costs.filter((i) => i.quotationId === q.id),
      insts.filter((i) => i.quotationId === q.id).sort((a, b) => a.seq - b.seq),
      { withCosts, customerName: c?.name || c?.chname, customerCode: c?.code, bu: c?.bu, creatorName: q.createdBy ? userMap.get(q.createdBy) : null },
    )
  })
  return NextResponse.json({ quotes })
}

/** สร้างใบเสนอราคาใหม่จากลูกค้า — ตั้งต้นรายการจากพื้นที่×เรต BU + งวดมาตรฐาน 9 งวด + ข้อความจากตั้งค่าบริษัท */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const b = await req.json()
  const customerId = Number(b.customerId)
  if (!Number.isFinite(customerId)) return NextResponse.json({ error: 'ต้องเลือกลูกค้า' }, { status: 400 })
  const db = getDb()
  const [cust] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1)
  if (!cust) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 })

  const [settings, rates] = await Promise.all([getSettings(), getRates()])
  const issue = today()
  const validUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  const code = await genDocCode(db, 'QT', cust.bu, issue)

  const sqm = cust.sqm != null ? Number(cust.sqm) : null
  const rate = rates[cust.bu] ?? 5500

  const [created] = await db.insert(quotations).values({
    customerId, code, issueDate: issue, validUntil,
    opFeePct: String(settings.opFeePct),
    vatPct: '0',
    permitDays: settings.permitDays, buildDays: settings.buildDays,
    exclusions: settings.exclusionsText, warranty: settings.warrantyText,
    spec: 'SPEC : ส่วนโกดัง\n\nฐานราก\n- เสาเข็มโดยวิศวะกรออกแบบ\n\nโครงเหล็ก\n- ตามแบบที่แนบไว้\n\nหลังคาและผนัง\n- หลังคา เมทัลชีท 0.35 มม. บลูสโคป สีเลือกภายหลัง\n- ก่ออิฐบล็อก 3 เมตร\n\nระบบไฟฟ้าภายในแสงสว่าง 3 เฟส',
    createdBy: me.id,
  }).returning()

  // รายการตั้งต้น: พื้นที่อาคาร × เรต/ตร.ม. ของ BU (แก้/เพิ่มได้ในฟอร์ม)
  const amount = sqm ? Math.round(sqm * rate) : 0
  await db.insert(quotationItems).values({
    quotationId: created.id, seq: 1,
    description: sqm ? `ขนาดอาคาร ${sqm} ตร.ม.` : 'งานก่อสร้างอาคาร',
    qty: sqm != null ? String(sqm) : null, unit: 'ตร.ม.',
    unitPrice: sqm != null ? String(rate) : null, amount: String(amount),
  })

  // งวดมาตรฐาน 9 งวด — จำนวนเงินคิดจากยอดตั้งต้น (แก้ไขแล้วระบบคำนวณใหม่ให้ในฟอร์ม)
  const opFee = Math.round(amount * settings.opFeePct / 100)
  const total = amount + opFee
  if (DEFAULT_INSTALLMENTS.length) {
    await db.insert(quotationInstallments).values(DEFAULT_INSTALLMENTS.map((d, i) => ({
      quotationId: created.id, seq: i + 1, title: d.title, detail: d.detail,
      percent: String(d.percent), amount: String(Math.round(total * d.percent / 100)), note: d.note || null,
    })))
  }

  // sync สถานะใบเสนอราคาฝั่ง CRM
  if (cust.quoteStatus === 'ยังไม่ทำใบเสนอราคา' || cust.quoteStatus === 'รอทำใบเสนอราคา' || cust.quoteStatus === 'ขอข้อมูลเพิ่มเติม') {
    await db.update(customers).set({ quoteStatus: 'รอตรวจใบเสนอราคา', updatedAt: new Date() }).where(eq(customers.id, customerId))
  }
  await db.insert(activityLog).values({ customerId, quotationId: created.id, userId: me.id, action: 'quote-create', newValue: code })

  return NextResponse.json({ ok: true, id: created.id, code })
}
