import { getDb } from '@/db'
import { buRates } from '@/db/schema'
import { DEFAULT_RATES, BUS, type Bu } from './constants'

/** อ่านเรตทุก BU (เติมค่า default ให้ครบ) */
export async function getRates(): Promise<Record<string, number>> {
  const db = getDb()
  const rows = await db.select().from(buRates)
  const map: Record<string, number> = { ...DEFAULT_RATES }
  for (const r of rows) map[r.bu] = r.ratePerSqm
  for (const b of BUS) if (map[b] == null) map[b] = DEFAULT_RATES[b as Bu]
  return map
}
