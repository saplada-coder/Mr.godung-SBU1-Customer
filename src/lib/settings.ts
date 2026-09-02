import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { companySettings, buOffices } from '@/db/schema'
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
/**
 * ตั้งค่าบริษัทสำหรับหัวกระดาษของเอกสารที่ออกให้ BU หนึ่ง — บริษัทเดียวกันแต่คนละสาขา
 * ที่อยู่/เบอร์ของสาขาทับค่ากลาง · bu = null (เช่น PO ของสำนักงาน) หรือยังไม่ตั้งสาขา → ใช้ค่ากลาง
 */
export async function getSettingsFor(bu: string | null | undefined) {
  const base = await getSettings()
  if (!bu) return base
  const db = getDb()
  const [office] = await db.select().from(buOffices)
    .where(eq(buOffices.bu, bu as typeof buOffices.$inferSelect.bu)).limit(1)
  if (!office) return base
  return { ...base, address: office.address || base.address, phone: office.phone || base.phone }
}

/** ที่อยู่สำนักงานทุกภูมิภาค (สำหรับหน้าตั้งค่า) */
export async function getBuOffices() {
  const db = getDb()
  return db.select().from(buOffices)
}

function safeParse(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}
