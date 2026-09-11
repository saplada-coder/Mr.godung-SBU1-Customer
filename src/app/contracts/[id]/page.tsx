import { redirect, notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { n0, num } from '@/lib/biz'
import { loadContract, type SubRow } from './print/doc'
import ContractForm from './form'

export const dynamic = 'force-dynamic'

/** หน้าร่างสัญญา — แก้ทุกช่องที่ใบเสนอราคาเติมให้ไม่ได้ แล้วกดพิมพ์เป็นสัญญาฉบับจริง */
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) redirect('/sign-in')
  const data = await loadContract(Number((await params).id))
  if (!data) notFound()
  const { c, insts, q, cust } = data

  return (
    <ContractForm
      role={me.role}
      init={{
        id: c.id,
        code: c.code,
        status: c.status,
        projectName: c.projectName ?? '',
        siteAddress: c.siteAddress ?? '',
        contractorSigner: c.contractorSigner ?? '',
        employerSigner: c.employerSigner ?? '',
        contractAmount: n0(c.contractAmount),
        vatPct: num(c.vatPct) ?? 0,
        whtPct: num(c.whtPct) ?? 0,
        buildDays: c.buildDays ?? 0,
        extendDays: c.extendDays ?? 0,
        startWithinDays: c.startWithinDays ?? 0,
        payWithinDays: c.payWithinDays ?? 0,
        penaltyPerDay: n0(c.penaltyPerDay),
        workHours: c.workHours ?? '',
        warrantyYears: c.warrantyYears ?? 1,
        buildingSize: c.buildingSize ?? '',
        buildingSqm: num(c.buildingSqm) ?? 0,
        scopeIncluded: c.scopeIncluded ?? '',
        scopeExcluded: c.scopeExcluded ?? '',
        warrantyText: c.warrantyText ?? '',
        note: c.note ?? '',
        signDate: c.signDate ?? '',
        dueDate: c.dueDate ?? '',
        installments: insts.map((i) => ({
          title: i.title,
          // สัญญาที่ร่างก่อนมีช่อง % จะว่าง — คิดจากบาทให้ก่อน จะได้ไม่ต้องไล่กรอกเองทั้ง 9 งวด
          percent: num(i.percent) ?? (n0(c.contractAmount) > 0 ? Math.round(n0(i.amount) / n0(c.contractAmount) * 10000) / 100 : null),
          amount: n0(i.amount),
          note: i.note ?? '',
          subs: parseSubs(i.subsJson),
        })),
      }}
      ctx={{
        quoteCode: q?.code ?? '',
        quoteId: q?.id ?? 0,
        employer: q?.custName || cust?.name || cust?.chname || '',
        employerAddr: q?.custAddress || cust?.province || '',
        employerTax: q?.custTaxId || '',
      }}
    />
  )
}

function parseSubs(s: string | null): SubRow[] {
  if (!s) return []
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}
