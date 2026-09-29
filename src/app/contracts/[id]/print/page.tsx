import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { contractKindMeta } from '@/lib/constants'
import PrintToolbar from '../../../quotes/[id]/print/toolbar'
import ContractDoc, { loadContract } from './doc'

export const dynamic = 'force-dynamic'

/**
 * ชื่อหน้า = ชื่อไฟล์ที่เบราว์เซอร์ตั้งให้ตอน "บันทึกเป็น PDF"
 * ตั้งเป็น "สัญญา <เลขที่> <ผู้ว่าจ้าง>" จะได้หาเจอตอนแนบในไลน์ ไม่ใช่ชื่อแอปเหมือนก่อน
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const data = await loadContract(Number((await params).id))
  if (!data) return { title: 'สัญญา' }
  const who = data.q?.custName || data.cust?.name || data.cust?.chname || ''
  // ใส่ชนิดสัญญาในชื่อไฟล์ด้วย เพราะสัญญาออกแบบและสัญญาก่อสร้างของลูกค้ารายเดียวกันใช้เลขที่เดียวกัน
  return { title: [contractKindMeta(data.c.kind).short, data.c.code, who].filter(Boolean).join(' ') }
}

export default async function ContractPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) redirect('/sign-in')
  const data = await loadContract(Number((await params).id))
  if (!data) notFound()
  return <ContractDoc data={data} toolbar={<PrintToolbar shareApi={`/api/contracts/${data.c.id}/share`} />} />
}
