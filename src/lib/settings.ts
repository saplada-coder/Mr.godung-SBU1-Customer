import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { companySettings } from '@/db/schema'
import { DEFAULT_WARRANTY, DEFAULT_EXCLUSIONS, DEFAULT_OP_FEE_PCT, DEFAULT_PERMIT_DAYS, DEFAULT_BUILD_DAYS } from '@/lib/constants'

export type Settings = Awaited<ReturnType<typeof getSettings>>

/** อ่านตั้งค่าบริษัท (แถวเดียว id=1) — เติมค่า default ให้ช่องที่ยังไม่เคยตั้ง */
export async function getSettings() {
  const db = getDb()
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1)).limit(1)
  return {
    name: row?.name ?? 'บริษัท ซีทู บิวเดอ จำกัด',
    address: row?.address ?? '',
    phone: row?.phone ?? '',
    lineId: row?.lineId ?? '',
    website: row?.website ?? '',
    email: row?.email ?? '',
    taxId: row?.taxId ?? '',
    logoUrl: row?.logoUrl ?? null,
    bankPersonal: row?.bankPersonal ?? '',
    bankCompany: row?.bankCompany ?? '',
    warrantyText: row?.warrantyText ?? DEFAULT_WARRANTY,
    exclusionsText: row?.exclusionsText ?? DEFAULT_EXCLUSIONS,
    permitDays: row?.permitDays ?? DEFAULT_PERMIT_DAYS,
    buildDays: row?.buildDays ?? DEFAULT_BUILD_DAYS,
    opFeePct: row?.opFeePct != null ? Number(row.opFeePct) : DEFAULT_OP_FEE_PCT,
    portfolio: safeParse(row?.portfolioJson),
  }
}
function safeParse(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}
