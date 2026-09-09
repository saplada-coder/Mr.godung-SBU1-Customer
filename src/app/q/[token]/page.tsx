import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations } from '@/db/schema'
import { today } from '@/lib/biz'
import { thDateBE } from '@/lib/format'
import QuoteDoc, { loadQuoteDoc } from '../../quotes/[id]/print/doc'
import { PublicPrintToolbar } from '../../quotes/[id]/print/toolbar'

export const dynamic = 'force-dynamic'
// ลิงก์ส่วนตัวของลูกค้าแต่ละราย — ห้ามให้เสิร์ชเอนจินเก็บ
export const metadata: Metadata = { title: 'ใบเสนอราคา', robots: { index: false, follow: false } }

/**
 * ลิงก์สาธารณะของใบเสนอราคา: /q/{token} — เปิดได้โดยไม่ต้องล็อกอิน สำหรับส่งลูกค้าทางไลน์
 * โทเคนสุ่ม 16 ตัวเดาไม่ได้ · ลิงก์หมดอายุตามช่อง "ใช้ได้ถึงวันที่" บนใบ
 * ใบที่ถูกลบหรือยกเลิกให้ตอบ 404 เหมือนไม่มีลิงก์นี้อยู่
 */
export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 24) notFound()
  const [q] = await getDb().select().from(quotations).where(eq(quotations.shareToken, token)).limit(1)
  if (!q || q.deletedAt || q.status === 'ยกเลิก') notFound()
  if (q.validUntil && q.validUntil < today()) return <Expired until={q.validUntil} />
  return <QuoteDoc data={await loadQuoteDoc(q)} toolbar={<PublicPrintToolbar />} />
}

function Expired({ until }: { until: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#777', padding: 24, fontFamily: 'var(--font)' }}>
      <div style={{ background: '#fff', color: '#111', borderRadius: 14, padding: '28px 32px', maxWidth: 420, textAlign: 'center', boxShadow: '0 2px 14px rgba(0,0,0,.35)' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>⏳</div>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>ลิงก์ใบเสนอราคาหมดอายุแล้ว</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: '#555' }}>
          ใบเสนอราคานี้ใช้ได้ถึงวันที่ {thDateBE(until)}<br />
          กรุณาติดต่อพนักงานขายเพื่อขอใบเสนอราคาฉบับใหม่
        </p>
      </div>
    </div>
  )
}
