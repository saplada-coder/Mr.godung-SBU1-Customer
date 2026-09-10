'use client'

import { useState } from 'react'

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ — ใช้ร่วมกับหน้าพิมพ์ใบเสนอราคา สัญญา ใบวางบิล และ PO
 * ส่ง shareApi มาเฉพาะเอกสารที่ส่งให้ลูกค้าได้ (ใบเสนอราคา/สัญญา) จะได้ปุ่ม "ส่งไลน์" เพิ่ม
 *
 * ไลน์ส่วนตัวไม่มี API ให้ส่งไฟล์แทนคนได้ ตัวเอกสารจึงไปเป็นไฟล์ PDF ที่พนักงานแนบเองในแชท
 * ปุ่มนี้ทำสองอย่าง: เปิดหน้าต่างบันทึก PDF และมาร์กว่าส่งลูกค้าแล้ว
 *
 * สองปุ่มของเอกสารที่ส่งลูกค้าทำคนละหน้าที่ ไม่ใช่สองทางไปที่เดียวกันแบบเดิมที่ทำให้คนใหม่ต้องเดา
 * "บันทึก PDF ส่งลูกค้า" = ได้ไฟล์ · "เปิดไลน์" = เรียกแอป LINE ขึ้นมาให้ไปแนบไฟล์ต่อ
 * หน้าใบวางบิลกับ PO ไม่ได้ส่งลูกค้าทางนี้ จึงเหลือปุ่มพิมพ์ตามเดิม
 *
 * window.print() ต้องถูกเรียกในจังหวะที่กดปุ่มจริง ๆ ห้ามมี await คั่นก่อน
 * ไม่งั้นเบราว์เซอร์จะถือว่าไม่ได้มาจากการกดปุ่มแล้วบล็อกทิ้งเงียบ ๆ — การมาร์กว่าส่งแล้วจึงยิงเป็นงานเบื้องหลัง
 */
export default function PrintToolbar({ shareApi }: { shareApi?: string }) {
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const [lineTried, setLineTried] = useState(false)

  const sendLine = () => {
    setErr('')
    setSent(true)
    fetch(shareApi!, { method: 'POST' })
      .then(async (r) => { if (!r.ok) setErr((await r.json().catch(() => ({}))).error || 'มาร์กว่าส่งแล้วไม่สำเร็จ') })
      .catch(() => setErr('มาร์กว่าส่งแล้วไม่สำเร็จ — ตัวไฟล์ PDF ยังใช้ได้ตามปกติ'))
    window.print()
  }

  /**
   * เรียกแอป LINE บนเครื่องขึ้นมา (โปรโตคอล line:// ที่ทั้ง Windows, iOS และ Android รู้จัก)
   * ได้แค่เปิดแอป — เลือกแชทและแนบไฟล์ยังต้องทำเอง เพราะไลน์ส่วนตัวไม่มี API ให้ส่งแทน
   * เครื่องที่ไม่ได้ติดตั้งไลน์จะไม่มีอะไรเกิดขึ้น จึงบอกวิธีเปิดเองไว้ให้ด้วย
   */
  const openLine = () => {
    setLineTried(true)
    window.location.href = 'line://'
  }

  return (
    <div className="ptoolbar">
      {err && <div className="pmsg err">{err}</div>}
      {lineTried && <div className="pmsg">ถ้าแอป LINE ไม่เปิดขึ้นมา แปลว่าเครื่องนี้ยังไม่ได้ติดตั้ง — เปิดจากหน้าจอเองแล้วแนบไฟล์ได้เลย</div>}
      {sent && (
        <div className="pshare">
          <b>เหลืออีก 2 ขั้นตอน</b>
          <ol className="psteps">
            <li>ในหน้าต่างที่เปิดขึ้น เลือกปลายทางเป็น <b>บันทึกเป็น PDF</b> แล้วกด Save</li>
            <li>กด <b>💬 เปิดไลน์</b> แล้วเลือกแชทลูกค้า <b>แนบไฟล์ที่เพิ่งบันทึก</b> (ชื่อไฟล์คือเลขที่เอกสาร + ชื่อลูกค้า)</li>
          </ol>
          <div className="row">
            <button onClick={() => window.print()}>บันทึกเป็น PDF อีกครั้ง</button>
            <button onClick={() => setSent(false)}>ปิดกล่องนี้</button>
          </div>
        </div>
      )}
      <button onClick={() => window.close()}>ปิด</button>
      {shareApi ? (
        <>
          <button onClick={sendLine}>📄 บันทึก PDF ส่งลูกค้า</button>
          <button className="line" onClick={openLine}>💬 เปิดไลน์</button>
        </>
      ) : (
        <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
      )}
    </div>
  )
}
