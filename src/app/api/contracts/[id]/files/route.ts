import { NextResponse } from 'next/server'
import { and, eq, asc } from 'drizzle-orm'
import { getDb } from '@/db'
import { contracts, contractFiles, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { canEdit, isAdminUp } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** ไฟล์แนบสูงสุดต่อสัญญา และความยาว data URL ต่อไฟล์ (~1.5 MB ต่อไฟล์หลังแปลงเป็น base64) */
const MAX_FILES = 20
const MAX_URL = 2_100_000
/** ชนิดไฟล์ที่รับ: รูปที่พิมพ์แนบท้ายสัญญาได้ และ PDF ที่แนบไว้ให้เปิด/ดาวน์โหลด */
const OK_PREFIX = ['data:image/', 'data:application/pdf']

const guard = async (id: number) => {
  const db = getDb()
  const [c] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1)
  return c ?? null
}

/** รายการไฟล์แนบของสัญญา — หน้าร่างสัญญาโหลดแยกจากตัวฟอร์ม เพราะ data URL ใหญ่ */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number((await ctx.params).id)
  if (!(await guard(id))) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const rows = await getDb().select().from(contractFiles)
    .where(eq(contractFiles.contractId, id)).orderBy(asc(contractFiles.id))
  return NextResponse.json({ files: rows.map((f) => ({ id: f.id, name: f.name, mime: f.mime, url: f.url, note: f.note ?? '' })) })
}

/** แนบไฟล์เพิ่ม — ส่ง name / mime / url (data URL) มาทีละไฟล์ */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const c = await guard(id)
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // สัญญาที่ลงนามแล้วเป็นหลักฐาน — เพิ่ม/ลบเอกสารแนบได้เฉพาะเจ้าของ/ผู้ดูแลระบบ เหมือนการแก้เนื้อสัญญา
  if (c.status === 'ลงนามแล้ว' && !isAdminUp(me.role))
    return NextResponse.json({ error: 'สัญญาลงนามแล้ว แก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const url = String(b?.url ?? '')
  if (!OK_PREFIX.some((p) => url.startsWith(p)))
    return NextResponse.json({ error: 'แนบได้เฉพาะไฟล์รูปและ PDF' }, { status: 400 })
  if (url.length > MAX_URL)
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกินไป (จำกัดราว 1.5 MB ต่อไฟล์)' }, { status: 400 })

  const db = getDb()
  const have = await db.select({ id: contractFiles.id }).from(contractFiles).where(eq(contractFiles.contractId, id))
  if (have.length >= MAX_FILES)
    return NextResponse.json({ error: `แนบได้สูงสุด ${MAX_FILES} ไฟล์ต่อสัญญา` }, { status: 400 })

  const name = String(b?.name ?? '').trim().slice(0, 200) || 'เอกสารแนบ'
  const mime = String(b?.mime ?? '').trim().slice(0, 100) || (url.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg')
  const [made] = await db.insert(contractFiles).values({
    contractId: id, name, mime, url, note: String(b?.note ?? '').trim().slice(0, 300) || null, createdBy: me.id,
  }).returning({ id: contractFiles.id })

  await db.insert(activityLog).values({
    customerId: c.customerId, quotationId: c.quotationId, userId: me.id,
    action: 'contract-file', field: 'เอกสารแนบสัญญา', newValue: `แนบ ${name} กับสัญญา ${c.code}`,
  })
  return NextResponse.json({ ok: true, id: made.id })
}

/** ลบไฟล์แนบหนึ่งไฟล์ — ส่ง fileId มาใน body */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const c = await guard(id)
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (c.status === 'ลงนามแล้ว' && !isAdminUp(me.role))
    return NextResponse.json({ error: 'สัญญาลงนามแล้ว แก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const fileId = Number(b?.fileId)
  if (!fileId) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
  await getDb().delete(contractFiles).where(and(eq(contractFiles.id, fileId), eq(contractFiles.contractId, id)))
  return NextResponse.json({ ok: true })
}
