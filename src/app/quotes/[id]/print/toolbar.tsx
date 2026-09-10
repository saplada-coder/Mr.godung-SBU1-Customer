'use client'

import { useState } from 'react'

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ — ใช้ร่วมกับหน้าพิมพ์ใบเสนอราคา สัญญา ใบวางบิล และ PO
 * ส่ง shareApi มาเฉพาะเอกสารที่ส่งให้ลูกค้าได้ (ใบเสนอราคา/สัญญา) จะได้ปุ่ม "ส่งไลน์" เพิ่ม
 *
 * ไลน์ส่วนตัวไม่มี API ให้ส่งไฟล์แทนคนได้ ตัวเอกสารจึงไปเป็นไฟล์ PDF ที่พนักงานแนบเองในแชท
 * ปุ่มนี้ทำสองอย่าง: เปิดหน้าต่างบันทึก PDF และมาร์กว่าส่งลูกค้าแล้ว
 *
 * เอกสารที่ส่งลูกค้าได้จะมีปุ่มเดียว ไม่แยก "ส่งไลน์" กับ "พิมพ์" เพราะทั้งคู่เปิดหน้าต่างบันทึก PDF เหมือนกัน
 * มีสองปุ่มแล้วคนใหม่ไม่รู้ว่าต้องกดอันไหน · หน้าใบวางบิลกับ PO ไม่มีปุ่มส่ง จึงเหลือปุ่มพิมพ์ตามเดิม
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
          <b>เหลืออีก 2 ขั้นตอน</b>
          <ol className="psteps">
            <li>ในหน้าต่างที่เปิดขึ้น เลือกปลายทางเป็น <b>บันทึกเป็น PDF</b> แล้วกด Save</li>
            <li>เปิดแชทลูกค้าในแอป LINE แล้ว<b>แนบไฟล์ที่เพิ่งบันทึก</b> (ชื่อไฟล์คือเลขที่เอกสาร + ชื่อลูกค้า)</li>
          </ol>
          <div className="row">
            <button onClick={() => window.print()}>บันทึกเป็น PDF อีกครั้ง</button>
            <button onClick={() => setSent(false)}>ปิดกล่องนี้</button>
          </div>
        </div>
      )}
      <button onClick={() => window.close()}>ปิด</button>
      {shareApi
        ? <button className="line" onClick={sendLine}>📄 บันทึก PDF ส่งลูกค้า</button>
        : <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>}
    </div>
  )
}
