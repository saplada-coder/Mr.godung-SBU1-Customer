'use client'

import { useState } from 'react'

/** line.me/R/msg/text เป็นทางของแอปมือถือ — บนพีซีมันพาไปหน้าเว็บที่ต้องล็อกอินไลน์ก่อน จึงแยกทางกัน */
const isMobileUA = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ (ซ่อนอัตโนมัติตอนพิมพ์) — ใช้ร่วมกับหน้าพิมพ์ใบวางบิลและ PO ด้วย
 * ส่ง quoteId มาเฉพาะใบเสนอราคา จะได้ปุ่ม "ส่งไลน์" เพิ่ม: ขอลิงก์สาธารณะของใบนี้จากเซิร์ฟเวอร์
 * แล้วส่งต่อให้ลูกค้า — มือถือเปิดแอปไลน์พร้อมข้อความให้เลย พีซีก๊อบข้อความไว้ให้ไปวางในแอป
 */
export default function PrintToolbar({ quoteId }: { quoteId?: number }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [share, setShare] = useState<{ text: string; copied: boolean; mobile: boolean } | null>(null)

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  }

  const sendLine = async () => {
    setBusy(true); setErr(''); setShare(null)
    try {
      const r = await fetch(`/api/quotes/${quoteId}/share`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'สร้างลิงก์ไม่สำเร็จ'); return }
      const mobile = isMobileUA()
      if (mobile) {
        window.open(`https://line.me/R/msg/text/?${encodeURIComponent(d.text)}`, '_blank', 'noopener')
        setShare({ text: d.text, copied: await copy(d.text), mobile })
        return
      }
      // พีซี: ลองแผงแชร์ของ Windows ก่อน — ถ้ามีแอป LINE ติดตั้งไว้จะส่งได้ในคลิกเดียว ไม่ต้องล็อกอินไลน์บนเว็บ
      // เครื่องที่ไม่รองรับ หรือผู้ใช้กดยกเลิกแผงแชร์ ให้ตกมาที่ก๊อบ-วาง ซึ่งใช้ได้เสมอ
      if (navigator.share) {
        try { await navigator.share({ title: `ใบเสนอราคา ${d.code}`, text: d.text }); return } catch { /* ไม่รองรับหรือยกเลิก */ }
      }
      setShare({ text: d.text, copied: await copy(d.text), mobile })
    } catch {
      setErr('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ptoolbar">
      {err && <div className="pmsg err">{err}</div>}
      {share && (
        <div className="pshare">
          <b>
            {share.mobile
              ? 'เปิดไลน์แล้ว เลือกแชทลูกค้าได้เลย'
              : share.copied
                ? 'ก๊อบข้อความไว้ให้แล้ว — เปิดแอป LINE บนเครื่อง แล้ววางในแชทลูกค้า (Ctrl+V)'
                : 'ลากคลุมข้อความข้างล่าง ก๊อบไปวางในแชทลูกค้าบนแอป LINE'}
          </b>
          <textarea readOnly value={share.text} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button onClick={async () => setShare({ ...share, copied: await copy(share.text) })}>คัดลอกอีกครั้ง</button>
            {!share.mobile && <button onClick={() => { window.location.href = 'line://' }}>เปิดแอป LINE</button>}
            <button onClick={() => setShare(null)}>ปิดกล่องนี้</button>
          </div>
        </div>
      )}
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
