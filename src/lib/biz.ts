// helper ฝั่ง server สำหรับใบเสนอราคา & งานก่อสร้าง (Budget Control)
import { sql } from 'drizzle-orm'
import type { getDb } from '@/db'
import {
  quotations, projects, billingDocs, purchaseOrders,
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
 * ลิงก์เอกสารที่ผู้ใช้วางมา — เติม https:// ให้ถ้าพิมพ์มาแบบ drive.google.com/…
 * ปฏิเสธ scheme อื่นทั้งหมด (javascript:, data:) เพราะลิงก์นี้ถูกเรนเดอร์เป็น <a href> ให้คนกด
 * คืน null ถ้าไม่ใช่ URL ที่ใช้ได้
 */
export function normDocUrl(raw: unknown): string | null {
  let s = String(raw ?? '').trim()
  if (!s) return null
  // ไม่มี scheme → เติม https ให้ · มี scheme อื่นที่ไม่ใช่ http(s) → ตีตก
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null
    s = 'https://' + s
  }
  if (s.length > 2000) return null
  try {
    const u = new URL(s)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null
  } catch { return null }
  return s
}

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

/** เลขเอกสารการเงิน: {IV|RC|RT}-{BU}-{ปี2หลัก}{เดือน}{ลำดับ3หลัก} รันแยก prefix ต่อเดือนต่อ BU */
export async function genBillingCode(db: ReturnType<typeof getDb>, prefix: string, bu: string, dateStr: string) {
  const ym = dateStr.slice(2, 4) + dateStr.slice(5, 7)
  const codePrefix = `${prefix}-${bu}-${ym}`
  const [{ nextSeq }] = (await db
    .select({ nextSeq: sql<number>`coalesce(max(right(code,3)::int),0)+1` })
    .from(billingDocs)
    .where(sql`code like ${codePrefix + '%'}`)) as unknown as [{ nextSeq: number }]
  return `${codePrefix}${String(nextSeq).padStart(3, '0')}`
}

/** เลขใบสั่งซื้อ: PO-{BU}-{ปี2หลัก}{เดือน}{ลำดับ3หลัก} */
export async function genPoCode(db: ReturnType<typeof getDb>, bu: string, dateStr: string) {
  const codePrefix = `PO-${bu}-${dateStr.slice(2, 4)}${dateStr.slice(5, 7)}`
  const [{ nextSeq }] = (await db
    .select({ nextSeq: sql<number>`coalesce(max(right(code,3)::int),0)+1` })
    .from(purchaseOrders)
    .where(sql`code like ${codePrefix + '%'}`)) as unknown as [{ nextSeq: number }]
  return `${codePrefix}${String(nextSeq).padStart(3, '0')}`
}

/* ---------- จำนวนเงินเป็นตัวอักษรไทย (สำหรับใบเสร็จ/ใบกำกับภาษี) ---------- */
const TH_D = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const TH_P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']
function readUnderMillion(n: number): string {
  if (n === 0) return ''
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = +s[i], pos = s.length - i - 1
    if (!d) continue
    if (pos === 1 && d === 1) out += 'สิบ'
    else if (pos === 1 && d === 2) out += 'ยี่สิบ'
    else if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด'
    else out += TH_D[d] + TH_P[pos]
  }
  return out
}
function readNum(n: number): string {
  if (n < 1_000_000) return readUnderMillion(n) || 'ศูนย์'
  const head = readNum(Math.floor(n / 1_000_000))
  const rest = n % 1_000_000
  return head + 'ล้าน' + (rest ? readUnderMillion(rest) : '')
}
/** แปลงจำนวนเงินเป็นตัวอักษรไทย เช่น 1250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์" */
export function bahtText(amount: number): string {
  const n = Math.abs(amount)
  const baht = Math.floor(n)
  const satang = Math.round((n - baht) * 100)
  let out = (amount < 0 ? 'ลบ' : '') + readNum(baht) + 'บาท'
  out += satang > 0 ? readUnderMillion(satang) + 'สตางค์' : 'ถ้วน'
  return out
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
    custName: q.custName, custAddress: q.custAddress, custPhone: q.custPhone, custTaxId: q.custTaxId,
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
