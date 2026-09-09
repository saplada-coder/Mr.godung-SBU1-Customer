'use client'

import { useState } from 'react'

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ (ซ่อนอัตโนมัติตอนพิมพ์) — ใช้ร่วมกับหน้าพิมพ์ใบวางบิลและ PO ด้วย
 * ส่ง quoteId มาเฉพาะใบเสนอราคา จะได้ปุ่ม "ส่งไลน์" เพิ่ม
 *
 * ไลน์ส่วนตัวไม่มี API ให้ส่งไฟล์แทนคนได้ ตัวใบจึงไปเป็นไฟล์ PDF ที่พนักงานแนบเองในแชท
 * ปุ่มนี้เลยรวบขั้นตอนให้: มาร์กว่าส่งลูกค้าแล้ว · ก๊อบข้อความไว้ให้ · เปิดหน้าต่างบันทึก PDF ให้เลย
 */
export default function PrintToolbar({ quoteId }: { quoteId?: number }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState<{ text: string; copied: boolean } | null>(null)

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  }

  const sendLine = async () => {
    setBusy(true); setErr(''); setSent(null)
    try {
      const r = await fetch(`/api/quotes/${quoteId}/share`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'เตรียมส่งไม่สำเร็จ'); return }
      const copied = await copy(d.text)
      setSent({ text: d.text, copied })
      // เปิดหน้าต่างบันทึก PDF ต่อทันที — ชื่อไฟล์ตั้งเป็นเลขที่ใบให้แล้วจาก <title> ของหน้านี้
      setTimeout(() => window.print(), 250)
    } catch {
      setErr('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ptoolbar">
      {err && <div className="pmsg err">{err}</div>}
      {sent && (
        <div className="pshare">
          <b>ขั้นตอนต่อไป</b>
          <ol className="psteps">
            <li>ในหน้าต่างที่เปิดขึ้น เลือกปลายทางเป็น <b>บันทึกเป็น PDF</b> แล้วกดบันทึก</li>
            <li>เปิดแชทลูกค้าในแอป LINE แล้ว<b>แนบไฟล์ PDF</b> ที่เพิ่งบันทึก</li>
            <li>{sent.copied ? 'วางข้อความที่ก๊อบไว้ให้ (Ctrl+V) แล้วส่ง' : 'ก๊อบข้อความข้างล่างไปวางแล้วส่ง'}</li>
          </ol>
          <textarea readOnly value={sent.text} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button onClick={async () => setSent({ ...sent, copied: await copy(sent.text) })}>คัดลอกข้อความ</button>
            <button onClick={() => window.print()}>เปิดหน้าบันทึก PDF อีกครั้ง</button>
            <button onClick={() => setSent(null)}>ปิดกล่องนี้</button>
          </div>
        </div>
      )}
      <button onClick={() => window.close()}>ปิด</button>
      {quoteId != null && <button className="line" disabled={busy} onClick={sendLine}>{busy ? 'กำลังเตรียม…' : '💬 ส่งไลน์'}</button>}
      <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
    </div>
  )
}
