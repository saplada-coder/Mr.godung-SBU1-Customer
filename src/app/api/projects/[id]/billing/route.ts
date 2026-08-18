import { NextResponse } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { projects, projectInstallments, billingDocs, billingDocItems, quotations, customers, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num, n0, today, genBillingCode } from '@/lib/biz'
import { canEdit, billKindMeta, BILL_KINDS, PAY_METHODS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * ออกเอกสารการเงินจากงวดของงาน:
 * - invoice (ใบแจ้งหนี้/ใบวางบิล) → งวดที่เลือกเปลี่ยนเป็น "วางบิลแล้ว"
 * - receipt / taxReceipt (ใบเสร็จ) → งวดเปลี่ยนเป็น "รับเงินแล้ว" + วันที่/ยอดรับจริง
 * ยอดสุทธิ = รวมรายการ + VAT − หัก ณ ที่จ่าย
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const projectId = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()

  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (p.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว ออกเอกสารไม่ได้' }, { status: 400 })

  const kind = String(b.kind)
  if (!BILL_KINDS.some((x) => x.k === kind)) return NextResponse.json({ error: 'ประเภทเอกสารไม่ถูกต้อง' }, { status: 400 })

  // งวดที่เลือก + บรรทัดที่พิมพ์เพิ่มเอง
  const instIds: number[] = Array.isArray(b.installmentIds) ? (b.installmentIds as unknown[]).map(Number).filter(Number.isFinite) : []
  const insts = instIds.length
    ? await db.select().from(projectInstallments).where(inArray(projectInstallments.id, instIds))
    : []
  if (insts.some((i) => i.projectId !== projectId)) return NextResponse.json({ error: 'งวดไม่อยู่ในงานนี้' }, { status: 400 })
  const extraItems = Array.isArray(b.items)
    ? (b.items as Record<string, unknown>[])
        .filter((i) => String(i.description ?? '').trim() && num(i.amount) != null)
        .map((i) => ({ description: String(i.description).trim().slice(0, 2000), amount: num(i.amount)! }))
    : []
  if (!insts.length && !extraItems.length) return NextResponse.json({ error: 'เลือกงวดหรือเพิ่มรายการอย่างน้อย 1 รายการ' }, { status: 400 })

  const custTaxId = String(b.custTaxId ?? '').trim().slice(0, 20) || null
  if (kind === 'taxReceipt' && !custTaxId)
    return NextResponse.json({ error: 'ใบกำกับภาษีต้องมีเลขประจำตัวผู้เสียภาษีของลูกค้า' }, { status: 400 })

  const vatPct = num(b.vatPct) ?? 0
  const whtPct = num(b.whtPct) ?? 0
  const subtotal = insts.reduce((a, i) => a + n0(i.amount), 0) + extraItems.reduce((a, i) => a + i.amount, 0)
  const vatAmount = Math.round(subtotal * vatPct / 100)
  const whtAmount = Math.round(subtotal * whtPct / 100)
  const total = subtotal + vatAmount - whtAmount

  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.issueDate)) ? String(b.issueDate) : today()
  const payDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.payDate)) ? String(b.payDate) : issueDate
  const code = await genBillingCode(db, billKindMeta(kind).prefix, p.bu, issueDate)

  const [doc] = await db.insert(billingDocs).values({
    projectId, kind, code,
    invoiceRefId: num(b.invoiceRefId),
    custName: String(b.custName ?? '').trim().slice(0, 160) || null,
    custAddress: String(b.custAddress ?? '').trim().slice(0, 1000) || null,
    custPhone: String(b.custPhone ?? '').trim().slice(0, 40) || null,
    custTaxId,
    issueDate,
    dueDate: kind === 'invoice' && /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate)) ? String(b.dueDate) : null,
    vatPct: vatPct ? String(vatPct) : null, whtPct: whtPct ? String(whtPct) : null,
    subtotal: String(subtotal), vatAmount: String(vatAmount), whtAmount: String(whtAmount), total: String(total),
    payMethod: kind !== 'invoice' && (PAY_METHODS as readonly string[]).includes(b.payMethod) ? b.payMethod : null,
    payDate: kind !== 'invoice' ? payDate : null,
    payRef: String(b.payRef ?? '').trim().slice(0, 80) || null,
    note: String(b.note ?? '').trim().slice(0, 2000) || null,
    createdBy: me.id,
  }).returning()

  const rows = [
    ...insts.sort((a, b2) => a.seq - b2.seq).map((i) => ({
      description: `${i.title}${i.detail ? '\n' + i.detail : ''}`, amount: String(i.amount), installmentId: i.id,
    })),
    ...extraItems.map((i) => ({ description: i.description, amount: String(i.amount), installmentId: null as number | null })),
  ]
  await db.insert(billingDocItems).values(rows.map((r, idx) => ({ docId: doc.id, seq: idx + 1, ...r })))

  // sync สถานะงวด
  if (insts.length) {
    if (kind === 'invoice') {
      await db.update(projectInstallments).set({ payStatus: 'วางบิลแล้ว' })
        .where(inArray(projectInstallments.id, insts.filter((i) => i.payStatus === 'ยังไม่วางบิล').map((i) => i.id)))
    } else {
      for (const i of insts) {
        await db.update(projectInstallments)
          .set({ payStatus: 'รับเงินแล้ว', paidAt: payDate, paidAmount: i.paidAmount ?? i.amount })
          .where(eq(projectInstallments.id, i.id))
      }
    }
  }

  await db.insert(activityLog).values({
    customerId: p.customerId, projectId, userId: me.id, action: 'billing-create',
    field: billKindMeta(kind).label, newValue: `${code} ฿${total.toLocaleString()}${insts.length ? ` (${insts.length} งวด)` : ''}`,
  })
  return NextResponse.json({ ok: true, id: doc.id, code })
}

/** ข้อมูลตั้งต้นสำหรับฟอร์มออกเอกสาร: ข้อมูลลูกค้าจากใบเสนอราคา (fallback CRM) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const projectId = Number((await ctx.params).id)
  const db = getDb()
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const [q] = p.quotationId ? await db.select().from(quotations).where(eq(quotations.id, p.quotationId)).limit(1) : []
  const [cust] = await db.select().from(customers).where(eq(customers.id, p.customerId)).limit(1)
  return NextResponse.json({
    custInfo: {
      name: q?.custName || cust?.name || cust?.chname || '',
      address: q?.custAddress || cust?.province || '',
      phone: q?.custPhone || cust?.phone || '',
      taxId: q?.custTaxId || '',
    },
  })
}
