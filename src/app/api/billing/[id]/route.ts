import { NextResponse } from 'next/server'
import { eq, and, ne, inArray } from 'drizzle-orm'
import { getDb } from '@/db'
import { billingDocs, billingDocItems, billingDocImages, projectInstallments, projects, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { canEdit, isAdminUp, billKindMeta, PAY_METHODS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** รายละเอียดเอกสาร + รูปแนบ (สลิปโอน/หลักฐาน) — รูปเรียงเก่าไปใหม่ */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [[doc], images] = await Promise.all([
    db.select().from(billingDocs).where(eq(billingDocs.id, id)).limit(1),
    db.select({ id: billingDocImages.id, url: billingDocImages.url, createdAt: billingDocImages.createdAt })
      .from(billingDocImages).where(eq(billingDocImages.docId, id)).orderBy(billingDocImages.id),
  ])
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({
    images,
    doc: {
      id: doc.id, kind: doc.kind, code: doc.code, status: doc.status,
      custName: doc.custName || '', custAddress: doc.custAddress || '',
      custPhone: doc.custPhone || '', custTaxId: doc.custTaxId || '',
      note: doc.note || '', payMethod: doc.payMethod || '', payRef: doc.payRef || '',
      payDate: doc.payDate, dueDate: doc.dueDate, issueDate: doc.issueDate, total: Number(doc.total) || 0,
    },
  })
}

/**
 * ยกเลิกเอกสารการเงิน (ห้ามลบ — เลขต้องรันต่อเนื่องตามหลักบัญชี เก็บใบพร้อมเหตุผลไว้)
 * แล้วย้อนสถานะงวดที่เกี่ยวข้องกลับ:
 * - ยกเลิกใบเสร็จ → งวดกลับเป็น "วางบิลแล้ว" ถ้ายังมีใบแจ้งหนี้ปกติคลุมอยู่ ไม่งั้น "ยังไม่วางบิล"
 * - ยกเลิกใบแจ้งหนี้ → งวดที่ยังไม่รับเงิน กลับเป็น "ยังไม่วางบิล"
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  const b = await req.json()

  // แนบ/ลบรูปประกอบเอกสาร — ทีมขายแนบได้ (สลิปโอน หลักฐานส่งงาน)
  if (b.action === 'add-image' || b.action === 'del-image') {
    if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const db = getDb()
    const [doc] = await db.select({ id: billingDocs.id }).from(billingDocs).where(eq(billingDocs.id, id)).limit(1)
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (b.action === 'add-image') {
      const url = String(b.url ?? '')
      if (!url.startsWith('data:image/') || url.length > 900_000)
        return NextResponse.json({ error: 'ไฟล์รูปไม่ถูกต้องหรือใหญ่เกินไป' }, { status: 400 })
      const cnt = await db.select({ id: billingDocImages.id }).from(billingDocImages).where(eq(billingDocImages.docId, id))
      if (cnt.length >= 10) return NextResponse.json({ error: 'แนบได้สูงสุด 10 รูปต่อเอกสาร' }, { status: 400 })
      const [img] = await db.insert(billingDocImages).values({ docId: id, url, createdBy: me.id }).returning({ id: billingDocImages.id })
      return NextResponse.json({ ok: true, id: img.id })
    }
    const imgId = Number(b.imageId)
    await db.delete(billingDocImages).where(and(eq(billingDocImages.id, imgId), eq(billingDocImages.docId, id)))
    return NextResponse.json({ ok: true })
  }

  /**
   * แก้รายละเอียดบนหน้าเอกสารโดยไม่ต้องยกเลิกแล้วออกใบใหม่ — ข้อมูลลูกค้า หมายเหตุ การชำระ
   * ยอดเงิน/รายการ/งวด แก้ที่นี่ไม่ได้ (กระทบสถานะงวดกับยอดบัญชี — ต้องยกเลิกแล้วออกใหม่)
   */
  if (b.action === 'edit') {
    if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const db = getDb()
    const [doc] = await db.select().from(billingDocs).where(eq(billingDocs.id, id)).limit(1)
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (doc.status === 'ยกเลิก') return NextResponse.json({ error: 'เอกสารถูกยกเลิกแล้ว แก้ไขไม่ได้' }, { status: 400 })

    const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null
    const dateOk = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null)
    const patch: Record<string, unknown> = {}
    if ('custName' in b) patch.custName = str(b.custName, 160)
    if ('custAddress' in b) patch.custAddress = str(b.custAddress, 1000)
    if ('custPhone' in b) patch.custPhone = str(b.custPhone, 40)
    if ('custTaxId' in b) {
      const v = str(b.custTaxId, 20)
      if (doc.kind === 'taxReceipt' && !v)
        return NextResponse.json({ error: 'ใบกำกับภาษีต้องมีเลขประจำตัวผู้เสียภาษีของลูกค้า' }, { status: 400 })
      patch.custTaxId = v
    }
    if ('note' in b) patch.note = str(b.note, 2000)
    if ('payRef' in b) patch.payRef = str(b.payRef, 80)
    if ('payMethod' in b && doc.kind !== 'invoice')
      patch.payMethod = (PAY_METHODS as readonly string[]).includes(b.payMethod) ? b.payMethod : null
    if ('payDate' in b && doc.kind !== 'invoice') patch.payDate = dateOk(b.payDate) ?? doc.payDate
    if ('dueDate' in b && doc.kind === 'invoice') patch.dueDate = dateOk(b.dueDate)

    if (Object.keys(patch).length) {
      await db.update(billingDocs).set(patch).where(eq(billingDocs.id, id))
      const [p] = await db.select().from(projects).where(eq(projects.id, doc.projectId)).limit(1)
      await db.insert(activityLog).values({
        customerId: p?.customerId ?? null, projectId: doc.projectId, userId: me.id, action: 'billing-edit',
        field: billKindMeta(doc.kind).label, oldValue: doc.code,
        newValue: 'แก้รายละเอียด: ' + Object.keys(patch).join(', '),
      })
    }
    return NextResponse.json({ ok: true })
  }

  if (!isAdminUp(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่ยกเลิกเอกสารได้' }, { status: 403 })
  if (b.action !== 'cancel') return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  const reason = String(b.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'ระบุเหตุผลการยกเลิก' }, { status: 400 })

  const db = getDb()
  const [doc] = await db.select().from(billingDocs).where(eq(billingDocs.id, id)).limit(1)
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (doc.status === 'ยกเลิก') return NextResponse.json({ error: 'เอกสารนี้ถูกยกเลิกไปแล้ว' }, { status: 400 })
  const [p] = await db.select().from(projects).where(eq(projects.id, doc.projectId)).limit(1)
  if (p?.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว แก้ไขเอกสารไม่ได้' }, { status: 400 })

  await db.update(billingDocs).set({ status: 'ยกเลิก', cancelReason: reason }).where(eq(billingDocs.id, id))

  // ย้อนสถานะงวดที่เอกสารนี้คลุม
  const items = await db.select().from(billingDocItems).where(eq(billingDocItems.docId, id))
  const instIds = items.map((i) => i.installmentId).filter((x): x is number => x != null)
  if (instIds.length) {
    // เอกสารปกติใบอื่นที่ยังคลุมงวดพวกนี้อยู่ (แยกตามประเภท)
    const otherItems = await db
      .select({ instId: billingDocItems.installmentId, kind: billingDocs.kind })
      .from(billingDocItems)
      .innerJoin(billingDocs, eq(billingDocItems.docId, billingDocs.id))
      .where(and(inArray(billingDocItems.installmentId, instIds), ne(billingDocs.id, id), eq(billingDocs.status, 'ปกติ')))
    const stillInvoiced = new Set(otherItems.filter((x) => x.kind === 'invoice').map((x) => x.instId))
    const stillReceipted = new Set(otherItems.filter((x) => x.kind !== 'invoice').map((x) => x.instId))

    for (const instId of instIds) {
      if (stillReceipted.has(instId)) continue // มีใบเสร็จปกติใบอื่น — งวดยังรับเงินแล้ว
      if (doc.kind === 'invoice') {
        // ยกเลิกใบแจ้งหนี้ — ย้อนเฉพาะงวดที่ยังไม่รับเงิน
        const [inst] = await db.select().from(projectInstallments).where(eq(projectInstallments.id, instId)).limit(1)
        if (inst && inst.payStatus === 'วางบิลแล้ว' && !stillInvoiced.has(instId))
          await db.update(projectInstallments).set({ payStatus: 'ยังไม่วางบิล' }).where(eq(projectInstallments.id, instId))
      } else {
        await db.update(projectInstallments)
          .set({ payStatus: stillInvoiced.has(instId) ? 'วางบิลแล้ว' : 'ยังไม่วางบิล', paidAt: null, paidAmount: null })
          .where(eq(projectInstallments.id, instId))
      }
    }
  }

  await db.insert(activityLog).values({
    customerId: p?.customerId ?? null, projectId: doc.projectId, userId: me.id, action: 'billing-cancel',
    field: billKindMeta(doc.kind).label, oldValue: doc.code, newValue: reason,
  })
  return NextResponse.json({ ok: true })
}
