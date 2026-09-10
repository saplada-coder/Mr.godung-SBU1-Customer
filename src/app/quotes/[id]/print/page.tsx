import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, customers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import QuoteDoc, { loadQuoteDoc } from './doc'
import PrintToolbar from './toolbar'

export const dynamic = 'force-dynamic'

/**
 * ชื่อหน้า = ชื่อไฟล์ที่เบราว์เซอร์ตั้งให้ตอน "บันทึกเป็น PDF"
 * ตั้งเป็นเลขที่ใบ + ชื่อลูกค้า จะได้ไฟล์แบบ "QT-BU1-2609018 คุณวีระ.pdf" ที่หาเจอตอนแนบในไลน์
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id)
  const [q] = await getDb().select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) return { title: 'ใบเสนอราคา' }
  const [cust] = await getDb().select().from(customers).where(eq(customers.id, q.customerId)).limit(1)
  const who = q.custName || cust?.name || cust?.chname || ''
  return { title: [q.code, who].filter(Boolean).join(' ') }
}

/** หน้าพิมพ์ใบเสนอราคา — ต้องล็อกอิน · ใบที่ส่งให้ลูกค้าคือไฟล์ PDF ที่บันทึกจากหน้านี้ */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) redirect('/sign-in')
  const id = Number((await params).id)
  const [q] = await getDb().select().from(quotations).where(eq(quotations.id, id)).limit(1)
  if (!q) notFound()
  return <QuoteDoc data={await loadQuoteDoc(q)} toolbar={<PrintToolbar shareApi={`/api/quotes/${q.id}/share`} />} />
}
