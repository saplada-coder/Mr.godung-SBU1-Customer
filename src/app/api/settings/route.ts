import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { companySettings, buOffices } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getSettings, getBuOffices } from '@/lib/settings'
import { isAdminUp, BUS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const [settings, offices] = await Promise.all([getSettings(), getBuOffices()])
  return NextResponse.json({
    settings,
    offices: offices.map((o) => ({ bu: o.bu, address: o.address, phone: o.phone || '' })),
  })
}

export async function PUT(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminUp(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่ตั้งค่าบริษัทได้' }, { status: 403 })

  const b = await req.json()
  const s = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null }
  const img = (v: unknown) => (typeof v === 'string' && v.startsWith('data:image/') && v.length <= 900_000 ? v : null)

  const portfolio = Array.isArray(b.portfolio)
    ? (b.portfolio as unknown[]).filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 8)
    : []
  const portfolioJson = JSON.stringify(portfolio)
  if (portfolioJson.length > 6_000_000)
    return NextResponse.json({ error: 'รูปผลงานรวมกันใหญ่เกินไป — ลดจำนวนหรือขนาดรูปลง' }, { status: 400 })

  const values = {
    name: s(b.name, 160), address: s(b.address), phone: s(b.phone, 160), lineId: s(b.lineId, 60),
    website: s(b.website, 160), email: s(b.email, 160), taxId: s(b.taxId, 20),
    logoUrl: img(b.logoUrl), bankPersonal: s(b.bankPersonal), bankCompany: s(b.bankCompany),
    warrantyText: s(b.warrantyText), exclusionsText: s(b.exclusionsText),
    permitDays: n(b.permitDays), buildDays: n(b.buildDays),
    opFeePct: b.opFeePct != null && Number.isFinite(Number(b.opFeePct)) ? String(b.opFeePct) : null,
    portfolioJson,
    updatedAt: new Date(), updatedBy: me.id,
  }
  const db = getDb()
  await db.insert(companySettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: companySettings.id, set: values })

  /* ---- ที่อยู่สำนักงานรายภูมิภาค (หัวกระดาษเอกสารของ BU นั้น) ---- */
  if (Array.isArray(b.offices)) {
    for (const o of b.offices as Record<string, unknown>[]) {
      const bu = String(o.bu ?? '')
      if (!(BUS as readonly string[]).includes(bu)) continue
      const address = s(o.address, 1000)
      const phone = s(o.phone, 160)
      // เว้นที่อยู่ว่าง = ไม่ตั้งสาขาให้ BU นี้ → เอกสารกลับไปใช้ที่อยู่กลาง
      if (!address) { await db.delete(buOffices).where(eq(buOffices.bu, bu as typeof buOffices.$inferInsert.bu)); continue }
      const row = { address, phone, updatedAt: new Date(), updatedBy: me.id }
      await db.insert(buOffices)
        .values({ bu: bu as typeof buOffices.$inferInsert.bu, ...row })
        .onConflictDoUpdate({ target: buOffices.bu, set: row })
    }
  }

  const [settings, offices] = await Promise.all([getSettings(), getBuOffices()])
  return NextResponse.json({
    ok: true, settings,
    offices: offices.map((o) => ({ bu: o.bu, address: o.address, phone: o.phone || '' })),
  })
}
