// helper ฝั่ง server สำหรับใบเสนอราคา & งานก่อสร้าง (Budget Control)
import { sql } from 'drizzle-orm'
import type { getDb } from '@/db'
import {
  quotations, projects,
  type Quotation, type QuotationItem, type QuotationCost, type QuotationInstallment,
} from '@/db/schema'

export const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
export const nstr = (v: number | null | undefined) => (v == null ? null : String(v))
export const n0 = (v: string | null | undefined) => (v == null ? 0 : Number(v) || 0)
export const today = () => new Date().toISOString().slice(0, 10)

/**
 * เลขที่เอกสาร: {QT|PJ}-{BU}-{ปี ค.ศ. 2 หลัก}{เดือน 2 หลัก}{ลำดับ 3 หลัก}
 * ลำดับรันต่อเดือนต่อ BU เช่น QT-BU1-2608001 (ตามฟอร์มจริงของบริษัท)
 */
export async function genDocCode(db: ReturnType<typeof getDb>, kind: 'QT' | 'PJ', bu: string, dateStr: string) {
  const ym = dateStr.slice(2, 4) + dateStr.slice(5, 7)
  const prefix = `${kind}-${bu}-${ym}`
  const table = kind === 'QT' ? quotations : projects
  const [{ nextSeq }] = (await db
    .select({ nextSeq: sql<number>`coalesce(max(right(code,3)::int),0)+1` })
    .from(table)
    .where(sql`code like ${prefix + '%'}`)) as unknown as [{ nextSeq: number }]
  return `${prefix}${String(nextSeq).padStart(3, '0')}`
}

export type QuoteTotals = {
  subtotal: number; opFee: number; afterOp: number
  discountDesign: number; discountBuild: number
  total: number; vatAmount: number; grand: number
  costTotal: number; profit: number; profitPct: number
}

/** สรุปยอดใบเสนอราคา: รวมรายการ + ค่าดำเนินการ% − ส่วนลด = รวมทั้งสิ้น (+VAT) และกำไรคาดการณ์ */
export function quoteTotals(
  q: Pick<Quotation, 'opFeePct' | 'discountDesign' | 'discountBuild' | 'vatPct'>,
  items: Pick<QuotationItem, 'amount'>[],
  costs: Pick<QuotationCost, 'amount'>[],
): QuoteTotals {
  const subtotal = items.reduce((a, i) => a + n0(i.amount), 0)
  const opFee = Math.round(subtotal * n0(q.opFeePct) / 100)
  const afterOp = subtotal + opFee
  const discountDesign = n0(q.discountDesign)
  const discountBuild = n0(q.discountBuild)
  const total = afterOp - discountDesign - discountBuild
  const vatAmount = Math.round(total * n0(q.vatPct) / 100)
  const grand = total + vatAmount
  const costTotal = costs.reduce((a, c) => a + n0(c.amount), 0)
  const profit = total - costTotal
  const profitPct = total > 0 ? (profit / total) * 100 : 0
  return { subtotal, opFee, afterOp, discountDesign, discountBuild, total, vatAmount, grand, costTotal, profit, profitPct }
}

export type QuoteDTO = ReturnType<typeof serializeQuote>

/** แปลงใบเสนอราคาเป็น DTO ฝั่ง client — withCosts=false จะตัดข้อมูลต้นทุน/กำไร (ภายใน) ออก */
export function serializeQuote(
  q: Quotation,
  items: QuotationItem[],
  costs: QuotationCost[],
  insts: QuotationInstallment[],
  opts: { withCosts: boolean; customerName?: string | null; customerCode?: string | null; bu?: string | null; creatorName?: string | null },
) {
  const t = quoteTotals(q, items, costs)
  return {
    id: q.id, customerId: q.customerId, code: q.code, rev: q.rev, status: q.status,
    issueDate: q.issueDate, validUntil: q.validUntil, acceptedAt: q.acceptedAt, refNo: q.refNo,
    opFeePct: num(q.opFeePct), discountDesign: num(q.discountDesign), discountBuild: num(q.discountBuild), vatPct: num(q.vatPct),
    permitDays: q.permitDays, buildDays: q.buildDays,
    exclusions: q.exclusions, warranty: q.warranty, spec: q.spec, note: q.note,
    includePortfolio: q.includePortfolio,
    rejectReason: q.rejectReason, sentAt: q.sentAt, supersededById: q.supersededById, projectId: q.projectId,
    createdBy: q.createdBy, createdAt: q.createdAt, updatedAt: q.updatedAt,
    customerName: opts.customerName ?? null, customerCode: opts.customerCode ?? null, bu: opts.bu ?? null,
    creatorName: opts.creatorName ?? null,
    items: items.map((i) => ({ id: i.id, seq: i.seq, description: i.description, qty: num(i.qty), unit: i.unit, unitPrice: num(i.unitPrice), amount: n0(i.amount), note: i.note })),
    installments: insts.map((i) => ({ id: i.id, seq: i.seq, title: i.title, detail: i.detail, percent: num(i.percent), amount: n0(i.amount), note: i.note })),
    subtotal: t.subtotal, opFee: t.opFee, total: t.total, vatAmount: t.vatAmount, grand: t.grand,
    ...(opts.withCosts
      ? { costs: costs.map((c) => ({ id: c.id, category: c.category, amount: n0(c.amount) })), costTotal: t.costTotal, profit: t.profit, profitPct: t.profitPct }
      : { costs: null, costTotal: null, profit: null, profitPct: null }),
  }
}
