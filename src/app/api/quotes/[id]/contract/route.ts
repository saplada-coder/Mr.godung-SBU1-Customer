import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationInstallments, customers, contracts, contractInstallments, activityLog } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { quoteTotals, n0, num, nstr, today } from '@/lib/biz'
import {
  canEdit, halfSubs, CONTRACT_KIND_KEYS, contractKindMeta,
  DESIGN_FEE_PCT, DESIGN_REVISIONS, DESIGN_INSTALLMENTS, type ContractKind,
} from '@/lib/constants'
import { defaultProjectName, defaultSite, defaultEmployerSigner, addDays } from '@/lib/contract-defaults'

export const dynamic = 'force-dynamic'

/* ค่าเริ่มต้นของสัญญาตามฟอร์มจริงของบริษัท — แก้ทีหลังได้ทุกช่องในหน้าร่างสัญญา */
const DEFAULT_EXTEND_DAYS = 30
const DEFAULT_START_WITHIN = 7
const DEFAULT_PAY_WITHIN = 7
const DEFAULT_PENALTY = 1000
const DEFAULT_WORK_HOURS = '08.00 น. ถึง 21.00 น.'
const DEFAULT_WARRANTY_YEARS = 1
/** ระยะเวลาออกแบบตั้งต้น — ใบเสนอราคาไม่มีเก็บไว้ (buildDays ของใบเป็นเวลาก่อสร้าง) */
const DEFAULT_DESIGN_DAYS = 45

/** รายการแบบที่ส่งมอบตามปกติของบริษัท — แก้ต่อได้ในหน้าร่างสัญญา */
const DEFAULT_DESIGN_SCOPE = `1. แบบผังบริเวณ และผังพื้นอาคาร
2. แบบรูปด้าน รูปตัด
3. แบบโครงสร้าง พร้อมรายการคำนวณโดยวิศวกร
4. แบบระบบไฟฟ้า และระบบสุขาภิบาล
5. ภาพทัศนียภาพ 3 มิติ ภายนอกอาคาร
6. แบบก่อสร้างพร้อมลงนามวิศวกร/สถาปนิก สำหรับยื่นขออนุญาต จำนวน 5 ชุด`

const DEFAULT_DESIGN_EXCLUDED = `ค่าธรรมเนียมและค่าใช้จ่ายในการยื่นขออนุญาตกับหน่วยงานราชการ , งานสำรวจและทดสอบดิน , งานออกแบบตกแต่งภายใน`

/**
 * ร่างสัญญาจากใบเสนอราคาที่ลูกค้าตกลง — ชนิดละหนึ่งฉบับต่อใบ
 * kind = 'ก่อสร้าง' (ค่าเริ่มต้น) หรือ 'ออกแบบ' (ค่าออกแบบ 10% ของมูลค่าโครงการ)
 * กดซ้ำได้สัญญาเดิมชนิดเดียวกัน (ไม่สร้างซ้ำ) เพื่อให้ปุ่มเดียวใช้ทั้งสร้างและเปิดของเดิม
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canEdit(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const id = Number((await ctx.params).id)
  const db = getDb()

  const b = await req.json().catch(() => ({}))
  const kind: ContractKind = CONTRACT_KIND_KEYS.includes(b?.kind) ? b.kind : 'ก่อสร้าง'
  const design = kind === 'ออกแบบ'

  const [q] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [existing] = await db.select({ id: contracts.id }).from(contracts)
    .where(and(eq(contracts.quotationId, id), eq(contracts.kind, kind))).limit(1)
  if (existing) return NextResponse.json({ ok: true, id: existing.id, existed: true, kind })

  if (q.status !== 'ลูกค้าตกลง')
    return NextResponse.json({ error: 'ร่างสัญญาได้เฉพาะใบที่ลูกค้าตกลงแล้ว' }, { status: 400 })

  const [items, insts, [cust]] = await Promise.all([
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, id)),
    db.select().from(quotationInstallments).where(eq(quotationInstallments.quotationId, id)),
    db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1),
  ])
  const t = quoteTotals(q, items, [])
  const w = num(cust?.widthM), l = num(cust?.lengthM)
  const settings = await getSettings()
  // สัญญาออกแบบ: มูลค่าสัญญาคือค่าออกแบบ 10% ของมูลค่าโครงการ — เก็บมูลค่าโครงการไว้อ้างอิงในตัวสัญญา
  const projectValue = t.total
  const amount = design ? Math.round(projectValue * DESIGN_FEE_PCT) / 100 : projectValue
  const buildDays = design ? DEFAULT_DESIGN_DAYS : q.buildDays

  const [made] = await db.insert(contracts).values({
    quotationId: id,
    customerId: q.customerId,
    kind,
    // เลขที่สัญญาใช้รหัสลูกค้า เช่น BU1-20260909-002 ตามฟอร์มสัญญาจริง
    code: cust?.code || q.code,
    contractAmount: String(amount),
    projectValue: design ? String(projectValue) : null,
    feePct: design ? String(DESIGN_FEE_PCT) : null,
    designRevisions: design ? DESIGN_REVISIONS : null,
    vatPct: q.vatPct,
    whtPct: '0',
    buildDays,
    extendDays: DEFAULT_EXTEND_DAYS,
    startWithinDays: DEFAULT_START_WITHIN,
    payWithinDays: DEFAULT_PAY_WITHIN,
    penaltyPerDay: String(DEFAULT_PENALTY),
    workHours: design ? null : DEFAULT_WORK_HOURS,
    warrantyYears: design ? null : DEFAULT_WARRANTY_YEARS,
    buildingSize: w && l ? `${w}*${l}` : null,
    buildingSqm: nstr(num(cust?.sqm)),
    // ทุกอย่างที่เดาจากใบเสนอราคา/ลูกค้าได้ เติมให้หมด — ในหน้าร่างสัญญาแก้ทับได้
    projectName: defaultProjectName(cust ?? null, q.custName),
    siteAddress: defaultSite(cust ?? null, q.custAddress),
    employerSigner: defaultEmployerSigner(q.custName || cust?.name || cust?.chname),
    contractorSigner: settings.signerName || null,
    // สัญญาออกแบบไม่ใช้สเปควัสดุ/การรับประกันของงานก่อสร้าง — ขอบเขตงานออกแบบเป็นรายการแบบที่ส่งมอบ
    scopeIncluded: design ? DEFAULT_DESIGN_SCOPE : q.spec,
    scopeExcluded: design ? DEFAULT_DESIGN_EXCLUDED : q.exclusions,
    warrantyText: design ? null : q.warranty,
    signDate: today(),
    dueDate: buildDays ? addDays(today(), buildDays) : null,
    createdBy: me.id,
  }).returning({ id: contracts.id })

  if (design) {
    // สามงวดตามความคืบหน้าของแบบ: มัดจำ 30 / เสนอแบบร่าง 40 / เขียนแบบเสร็จ 30 — ไม่แตกงวดย่อย
    await db.insert(contractInstallments).values(DESIGN_INSTALLMENTS.map((x, n) => ({
      contractId: made.id, seq: n + 1, title: x.title, percent: String(x.percent),
      amount: String(Math.round(amount * x.percent) / 100), subsJson: null, note: x.note,
    })))
  } else {
    const rows = [...insts].sort((a, b2) => a.seq - b2.seq)
    if (rows.length) {
      await db.insert(contractInstallments).values(rows.map((i, n) => ({
        contractId: made.id, seq: n + 1, title: i.title, percent: i.percent, amount: String(n0(i.amount)), note: i.detail,
        // งวดที่ 1 เป็นมัดจำจ่ายก้อนเดียว ตั้งแต่งวดที่ 2 แตกครึ่งเป็น "งวดที่ N.1 / N.2" อย่างละ 50%
        subsJson: n === 0 ? null : JSON.stringify(halfSubs(n0(i.amount), n + 1)),
      })))
    }
  }
  await db.insert(activityLog).values({
    customerId: q.customerId, quotationId: id, userId: me.id,
    action: 'contract-create', field: 'สัญญา',
    newValue: `${contractKindMeta(kind).draft}เลขที่ ${cust?.code || q.code}`,
  })
  return NextResponse.json({ ok: true, id: made.id, existed: false, kind })
}
