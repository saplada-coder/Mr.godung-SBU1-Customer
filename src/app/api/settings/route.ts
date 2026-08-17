import { NextResponse } from 'next/server'
import { getDb } from '@/db'
import { companySettings } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { isAdminUp } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ settings: await getSettings() })
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
  return NextResponse.json({ ok: true, settings: await getSettings() })
}
