import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { purchaseOrders, poItems, projects, users, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num, n0, today, genPoCode } from '@/lib/biz'
import { canEdit, isAdminUp, ALL_EXPENSE_CAT_KEYS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** ใบสั่งซื้อทั้งหมด (ทุกงาน + สำนักงาน) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()
  const [rows, projs, allUsers] = await Promise.all([
    db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.id)),
    db.select({ id: projects.id, name: projects.name, code: projects.code }).from(projects),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ])
  const projMap = new Map(projs.map((p) => [p.id, p]))
  const userMap = new Map(allUsers.map((u) => [u.id, u.name || u.email]))
  return NextResponse.json({
    pos: rows.map((r) => ({
      id: r.id, code: r.code, vendor: r.vendor, category: r.category,
      projectId: r.projectId, projectName: r.projectId != null ? projMap.get(r.projectId)?.name || projMap.get(r.projectId)?.code || '—' : '🏢 สำนักงาน',
      issueDate: r.issueDate, deliveryDate: r.deliveryDate,
      subtotal: n0(r.subtotal), vatAmount: n0(r.vatAmount), total: n0(r.total),
      status: r.status, cancelReason: r.cancelReason,
      createdByName: r.createdBy ? userMap.get(r.createdBy) : null, createdAt: r.createdAt,
    })),
  })
}

/** สร้างใบสั่งซื้อ — ผูกงานก่อสร้าง (ใช้หมวดงบของงาน) หรือของสำนักงาน */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const b = await req.json()
  const db = getDb()

  const projectId = num(b.projectId)
  let bu = me.bu || 'BU1'
  if (projectId != null) {
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    if (!p) return NextResponse.json({ error: 'ไม่พบงาน' }, { status: 404 })
    if (p.status === 'ปิดงาน') return NextResponse.json({ error: 'งานปิดแล้ว ออก PO ไม่ได้' }, { status: 400 })
    bu = p.bu
  }

  const vendor = String(b.vendor ?? '').trim().slice(0, 200)
  if (!vendor) return NextResponse.json({ error: 'ระบุชื่อร้าน/ผู้ขาย' }, { status: 400 })
  const items = Array.isArray(b.items)
    ? (b.items as Record<string, unknown>[])
        .filter((i) => String(i.description ?? '').trim() && num(i.amount) != null && num(i.amount)! > 0)
        .map((i) => ({
          description: String(i.description).trim().slice(0, 2000),
          qty: num(i.qty), unit: String(i.unit ?? '').trim().slice(0, 30) || null,
          unitPrice: num(i.unitPrice), amount: num(i.amount)!,
        }))
    : []
  if (!items.length) return NextResponse.json({ error: 'เพิ่มรายการสั่งซื้ออย่างน้อย 1 รายการ' }, { status: 400 })

  const vatPct = num(b.vatPct) ?? 0
  const subtotal = items.reduce((a, i) => a + i.amount, 0)
  const vatAmount = Math.round(subtotal * vatPct / 100)
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.issueDate)) ? String(b.issueDate) : today()
  const code = await genPoCode(db, bu, issueDate)
  const category = ALL_EXPENSE_CAT_KEYS.includes(String(b.category)) ? String(b.category) : null

  // PO เป็นเอกสารเดียวที่ต้องอนุมัติ — เจ้าของ/ผู้ดูแลระบบออกเอง = อนุมัติทันที
  const auto = isAdminUp(me.role)
  const [po] = await db.insert(purchaseOrders).values({
    projectId, code, vendor,
    vendorAddress: String(b.vendorAddress ?? '').trim().slice(0, 1000) || null,
    vendorPhone: String(b.vendorPhone ?? '').trim().slice(0, 40) || null,
    category: category as typeof purchaseOrders.$inferInsert.category,
    issueDate,
    deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.deliveryDate)) ? String(b.deliveryDate) : null,
    vatPct: vatPct ? String(vatPct) : null,
    subtotal: String(subtotal), vatAmount: String(vatAmount), total: String(subtotal + vatAmount),
    note: String(b.note ?? '').trim().slice(0, 2000) || null,
    status: auto ? 'อนุมัติแล้ว' : 'รออนุมัติ',
    approvedBy: auto ? me.id : null, approvedAt: auto ? new Date() : null,
    createdBy: me.id,
  }).returning()

  await db.insert(poItems).values(items.map((i, idx) => ({
    poId: po.id, seq: idx + 1, description: i.description,
    qty: i.qty != null ? String(i.qty) : null, unit: i.unit,
    unitPrice: i.unitPrice != null ? String(i.unitPrice) : null, amount: String(i.amount),
  })))

  await db.insert(activityLog).values({
    projectId, userId: me.id, action: 'po-create',
    field: 'ใบสั่งซื้อ', newValue: `${code} ${vendor} ฿${(subtotal + vatAmount).toLocaleString()}${auto ? '' : ' (รออนุมัติ)'}`,
  })
  return NextResponse.json({ ok: true, id: po.id, code, status: po.status })
}
