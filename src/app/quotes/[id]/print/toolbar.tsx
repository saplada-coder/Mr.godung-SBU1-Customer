'use client'

import { useState } from 'react'

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ (ซ่อนอัตโนมัติตอนพิมพ์) — ใช้ร่วมกับหน้าพิมพ์ใบวางบิลและ PO ด้วย
 * ส่ง quoteId มาเฉพาะใบเสนอราคา จะได้ปุ่ม "ส่งไลน์" เพิ่ม: ขอลิงก์สาธารณะของใบนี้จากเซิร์ฟเวอร์
 * แล้วเปิดไลน์พร้อมข้อความ + ลิงก์ ให้เลือกแชทลูกค้าได้เลย
 */
export default function PrintToolbar({ quoteId }: { quoteId?: number }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null)

  const sendLine = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/quotes/${quoteId}/share`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setMsg({ t: d.error || 'สร้างลิงก์ไม่สำเร็จ', err: true }); return }
      // ก๊อบลิงก์ไว้ให้ด้วย เผื่ออยากวางในแชทอื่นหรือไลน์ไม่เปิด
      let copied = false
      try { await navigator.clipboard.writeText(d.url); copied = true } catch { /* เบราว์เซอร์บล็อกคลิปบอร์ด — ลิงก์ไปกับข้อความอยู่แล้ว */ }
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(d.text)}`, '_blank', 'noopener')
      setMsg({ t: `เปิดไลน์แล้ว เลือกแชทลูกค้าได้เลย${copied ? ' · ก๊อบลิงก์ไว้ให้ด้วย' : ''}\n${d.url}` })
    } catch {
      setMsg({ t: 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง', err: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ptoolbar">
      {msg && <div className={'pmsg' + (msg.err ? ' err' : '')} style={{ whiteSpace: 'pre-wrap' }}>{msg.t}</div>}
      <button onClick={() => window.close()}>ปิด</button>
      {quoteId != null && <button className="line" disabled={busy} onClick={sendLine}>{busy ? 'กำลังสร้างลิงก์…' : '💬 ส่งไลน์'}</button>}
      <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
    </div>
  )
}

/** แถบปุ่มของหน้าลิงก์สาธารณะที่ลูกค้าเปิด — มีแค่พิมพ์/บันทึก PDF */
export function PublicPrintToolbar() {
  return (
    <div className="ptoolbar">
      <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
    </div>
  )
}
