import { redirect, notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import PrintToolbar from '../../../quotes/[id]/print/toolbar'
import ContractDoc, { loadContract } from './doc'

export const dynamic = 'force-dynamic'

export default async function ContractPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) redirect('/sign-in')
  const data = await loadContract(Number((await params).id))
  if (!data) notFound()
  return <ContractDoc data={data} toolbar={<PrintToolbar />} />
}
