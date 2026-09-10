'use client'

import { useState } from 'react'

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ — ใช้ร่วมกับหน้าพิมพ์ใบเสนอราคา สัญญา ใบวางบิล และ PO
 * ส่ง shareApi มาเฉพาะเอกสารที่ส่งให้ลูกค้าได้ (ใบเสนอราคา/สัญญา) จะได้ปุ่ม "ส่งไลน์" เพิ่ม
 *
 * ไลน์ส่วนตัวไม่มี API ให้ส่งไฟล์แทนคนได้ ตัวเอกสารจึงไปเป็นไฟล์ PDF ที่พนักงานแนบเองในแชท
 * ปุ่มนี้ทำสองอย่าง: เปิดหน้าต่างบันทึก PDF และมาร์กว่าส่งลูกค้าแล้ว
 *
 * window.print() ต้องถูกเรียกในจังหวะที่กดปุ่มจริง ๆ ห้ามมี await คั่นก่อน
 * ไม่งั้นเบราว์เซอร์จะถือว่าไม่ได้มาจากการกดปุ่มแล้วบล็อกทิ้งเงียบ ๆ — การมาร์กว่าส่งแล้วจึงยิงเป็นงานเบื้องหลัง
 */
export default function PrintToolbar({ shareApi }: { shareApi?: string }) {
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  const sendLine = () => {
    setErr('')
    setSent(true)
    fetch(shareApi!, { method: 'POST' })
      .then(async (r) => { if (!r.ok) setErr((await r.json().catch(() => ({}))).error || 'มาร์กว่าส่งแล้วไม่สำเร็จ') })
      .catch(() => setErr('มาร์กว่าส่งแล้วไม่สำเร็จ — ตัวไฟล์ PDF ยังใช้ได้ตามปกติ'))
    window.print()
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
          </ol>
          <div className="row">
            <button onClick={() => window.print()}>บันทึกเป็น PDF อีกครั้ง</button>
            <button onClick={() => setSent(false)}>ปิดกล่องนี้</button>
          </div>
        </div>
      )}
      <button onClick={() => window.close()}>ปิด</button>
      {shareApi && <button className="line" onClick={sendLine}>💬 ส่งไลน์</button>}
      <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
    </div>
  )
}
