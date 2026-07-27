import type { InferSelectModel } from 'drizzle-orm'
import type { customers, appointments } from '@/db/schema'
import { DEFAULT_RATES, isFinal, type Bu } from './constants'

type CustomerRow = InferSelectModel<typeof customers>
type ApptRow = InferSelectModel<typeof appointments>

const n = (v: string | null) => (v == null ? null : Number(v))

export type CustomerDTO = ReturnType<typeof serializeCustomer>

export function estimate(sqm: number | null, bu: string, rates: Record<string, number>) {
  if (!sqm || sqm <= 0) return null
  const rate = rates[bu] ?? DEFAULT_RATES[bu as Bu] ?? 5500
  return Math.round(sqm * rate)
}

export function serializeCustomer(
  c: CustomerRow,
  opts: { rates: Record<string, number>; appt?: ApptRow | null; attachCount?: number; noteCount?: number },
) {
  const sqm = n(c.sqm)
  const est = n(c.amountEst) ?? estimate(sqm, c.bu, opts.rates)
  const actual = n(c.amountActual)
  const shownVal = actual != null ? actual : est
  const appt = opts.appt
  return {
    id: c.id, code: c.code, bu: c.bu,
    name: c.name, channel: c.channel, chname: c.chname, phone: c.phone, province: c.province,
    detail: c.detail, cat: c.cat,
    k: n(c.widthM), y: n(c.lengthM), s: n(c.heightM), sqm,
    amountEst: est, amountActual: actual, shownVal, isFinal: isFinal(c.status),
    status: c.status, quote: c.quoteStatus, d: c.inquiredAt, closedAt: c.closedAt,
    appt: appt ? { type: appt.type, date: appt.apptDate, time: appt.apptTime ?? '', note: appt.note ?? '' } : null,
    attachCount: opts.attachCount ?? 0, noteCount: opts.noteCount ?? 0,
  }
}
