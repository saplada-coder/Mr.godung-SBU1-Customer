import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations } from '@/db/schema'
import QuoteDoc, { loadQuoteDoc } from '../../quotes/[id]/print/doc'
import { PublicPrintToolbar } from '../../quotes/[id]/print/toolbar'

export const dynamic = 'force-dynamic'
// ลิงก์ส่วนตัวของลูกค้าแต่ละราย — ห้ามให้เสิร์ชเอนจินเก็บ
export const metadata: Metadata = { title: 'ใบเสนอราคา', robots: { index: false, follow: false } }

/**
 * ลิงก์สาธารณะของใบเสนอราคา: /q/{token} — เปิดได้โดยไม่ต้องล็อกอิน สำหรับส่งลูกค้าทางไลน์
 * โทเคนสุ่ม 16 ตัวเดาไม่ได้ · ลิงก์ไม่มีวันหมดอายุ ลูกค้าย้อนกลับมาเปิดใบเดิมได้เสมอ
 * ใบที่ถูกลบหรือยกเลิกให้ตอบ 404 เหมือนไม่มีลิงก์นี้อยู่ — เป็นทางเดียวที่ปิดลิงก์ที่ส่งไปแล้ว
 */
export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 24) notFound()
  const [q] = await getDb().select().from(quotations).where(eq(quotations.shareToken, token)).limit(1)
  if (!q || q.deletedAt || q.status === 'ยกเลิก') notFound()
  return <QuoteDoc data={await loadQuoteDoc(q)} toolbar={<PublicPrintToolbar />} />
}
