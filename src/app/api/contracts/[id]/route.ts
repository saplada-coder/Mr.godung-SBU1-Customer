import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { contracts, contractInstallments, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { num, nstr } from '@/lib/biz'
import { canEdit, isAdminUp, CONTRACT_STATUSES, type ContractStatus } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const str = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}
const dateOk = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null)

type SubRow = { title: string; amount: number }

/** งวดย่อยของงวดหนึ่ง — เก็บเป็น JSON ในคอลัมน์เดียว เพราะมีอย่างมากสองสามบรรทัดต่องวด */
function parseSubs(v: unknown): string | null {
  if (!Array.isArray(v)) return null
  const rows: SubRow[] = v
    .map((x) => ({ title: String((x as SubRow)?.title ?? '').trim().slice(0, 160), amount: num((x as SubRow)?.amount) ?? 0 }))
    .filter((x) => x.title || x.amount)
  return rows.length ? JSON.stringify(rows) : null
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [cur] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // สัญญาที่ลงนามแล้วเป็นหลักฐาน — แก้ทับได้เฉพาะเจ้าของ/ผู้ดูแลระบบ
  if (cur.status === 'ลงนามแล้ว' && !isAdminUp(me.role))
    return NextResponse.json({ error: 'สัญญาลงนามแล้ว แก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ' }, { status: 403 })

  const p: Record<string, unknown> = { updatedAt: new Date() }
  if ('status' in b && CONTRACT_STATUSES.includes(b.status)) {
    if (b.status !== cur.status) {
      await db.insert(activityLog).values({
        customerId: cur.customerId, quotationId: cur.quotationId, userId: me.id,
        action: 'contract-status', field: 'สถานะสัญญา', oldValue: cur.status, newValue: b.status,
      })
    }
    p.status = b.status as ContractStatus
  }
  if ('projectName' in b) p.projectName = str(b.projectName, 200)
  if ('siteAddress' in b) p.siteAddress = str(b.siteAddress, 2000)
  if ('contractorSigner' in b) p.contractorSigner = str(b.contractorSigner, 120)
  if ('workHours' in b) p.workHours = str(b.workHours, 60)
  if ('buildingSize' in b) p.buildingSize = str(b.buildingSize, 60)
  if ('scopeIncluded' in b) p.scopeIncluded = str(b.scopeIncluded, 20000)
  if ('scopeExcluded' in b) p.scopeExcluded = str(b.scopeExcluded, 20000)
  if ('warrantyText' in b) p.warrantyText = str(b.warrantyText, 20000)
  if ('note' in b) p.note = str(b.note, 20000)
  if ('signDate' in b) p.signDate = dateOk(b.signDate)
  if ('dueDate' in b) p.dueDate = dateOk(b.dueDate)
  for (const k of ['buildDays', 'extendDays', 'startWithinDays', 'payWithinDays', 'warrantyYears'] as const) {
    if (k in b) { const v = num(b[k]); p[k] = v == null ? null : Math.max(0, Math.round(v)) }
  }
  for (const k of ['contractAmount', 'vatPct', 'whtPct', 'penaltyPerDay', 'buildingSqm'] as const) {
    if (k in b) p[k] = nstr(num(b[k]))
  }
  // มูลค่าสัญญาห้ามว่าง — คอลัมน์นี้ NOT NULL และเป็นตัวเลขหลักของทั้งฉบับ
  if (p.contractAmount == null) delete p.contractAmount

  await db.update(contracts).set(p).where(eq(contracts.id, id))

  if (Array.isArray(b.installments)) {
    await db.delete(contractInstallments).where(eq(contractInstallments.contractId, id))
    const rows = (b.installments as Record<string, unknown>[])
      .map((x, i) => ({
        contractId: id, seq: i + 1,
        title: String(x.title ?? '').trim().slice(0, 200),
        amount: String(num(x.amount) ?? 0),
        subsJson: parseSubs(x.subs),
        note: str(x.note, 4000),
      }))
      .filter((x) => x.title)
    if (rows.length) await db.insert(contractInstallments).values(rows)
  }

  await db.insert(activityLog).values({
    customerId: cur.customerId, quotationId: cur.quotationId, userId: me.id,
    action: 'contract-edit', field: 'สัญญา', newValue: `แก้ไขสัญญา ${cur.code}`,
  })
  return NextResponse.json({ ok: true })
}

/** ลบร่างสัญญาทิ้ง — งวดสัญญาหายตามด้วย cascade · ใบเสนอราคาต้นทางไม่ถูกแตะ ร่างใหม่ได้ */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminUp(me.role)) return NextResponse.json({ error: 'เฉพาะเจ้าของ/ผู้ดูแลระบบที่ลบสัญญาได้' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()
  const [cur] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await db.insert(activityLog).values({
    customerId: cur.customerId, quotationId: cur.quotationId, userId: me.id,
    action: 'contract-delete', field: 'สัญญา', oldValue: cur.code, newValue: `ลบสัญญา ${cur.code}`,
  })
  await db.delete(contracts).where(eq(contracts.id, id))
  return NextResponse.json({ ok: true })
}
