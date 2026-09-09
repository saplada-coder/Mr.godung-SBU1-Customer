import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import QuoteDoc, { loadQuoteDoc } from './doc'
import PrintToolbar from './toolbar'

export const dynamic = 'force-dynamic'

/** หน้าพิมพ์ภายใน — ต้องล็อกอิน · ลิงก์ที่ส่งลูกค้าคือ /q/[token] ซึ่งเปิดได้โดยไม่ต้องล็อกอิน */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) redirect('/sign-in')
  const id = Number((await params).id)
  const [q] = await getDb().select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) notFound()
  return <QuoteDoc data={await loadQuoteDoc(q)} toolbar={<PrintToolbar quoteId={q.id} />} />
}
