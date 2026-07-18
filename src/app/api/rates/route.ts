import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { buRates } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getRates } from '@/lib/rates'
import { BUS, isAdminUp } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ rates: await getRates() })
}

export async function PUT(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminUp(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่แก้เรตได้' }, { status: 403 })

  const b = await req.json()
  const rates: Record<string, number> = b.rates ?? {}
  const db = getDb()
  for (const bu of BUS) {
    const v = Number(rates[bu])
    if (Number.isFinite(v) && v > 0) {
      await db
        .insert(buRates)
        .values({ bu, ratePerSqm: Math.round(v), updatedBy: me.id })
        .onConflictDoUpdate({ target: buRates.bu, set: { ratePerSqm: Math.round(v), updatedBy: me.id, updatedAt: sql`now()` } })
    }
  }
  return NextResponse.json({ ok: true, rates: await getRates() })
}
