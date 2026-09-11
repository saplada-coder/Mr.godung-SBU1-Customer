'use client'

import { useEffect, useState } from 'react'

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ — ใช้ร่วมกับหน้าพิมพ์ใบเสนอราคา สัญญา ใบวางบิล และ PO
 * ส่ง shareApi มาเฉพาะเอกสารที่ส่งให้ลูกค้าได้ (ใบเสนอราคา/สัญญา) จะได้ปุ่มส่งลูกค้าเพิ่ม
 *
 * ไลน์ส่วนตัวไม่มี API ให้ส่งไฟล์แทนคนได้ ตัวเอกสารจึงไปเป็นไฟล์ PDF ที่พนักงานแนบเองในแชท
 * "บันทึก PDF ส่งลูกค้า" = เปิดหน้าต่างบันทึก PDF และมาร์กว่าส่งลูกค้าแล้ว
 * "เปิดไลน์" = เรียกแอป LINE ขึ้นมาให้ไปแนบไฟล์ต่อ — มีเฉพาะมือถือ
 *   บนพีซี LINE for Windows ไม่รับคำสั่งเปิดจากเว็บ (ลองแล้วได้หน้าให้สแกน QR ที่สแกนแล้วก็ไม่ไปไหน)
 *   ปุ่มที่กดแล้วพาไปทางตันแย่กว่าไม่มีปุ่ม จึงบอกให้เปิดแอปจากทาสก์บาร์แทน
 *
 * window.print() ต้องถูกเรียกในจังหวะที่กดปุ่มจริง ๆ ห้ามมี await คั่นก่อน
 * ไม่งั้นเบราว์เซอร์จะถือว่าไม่ได้มาจากการกดปุ่มแล้วบล็อกทิ้งเงียบ ๆ — การมาร์กว่าส่งแล้วจึงยิงเป็นงานเบื้องหลัง
 */
export default function PrintToolbar({ shareApi }: { shareApi?: string }) {
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  // ตัดสินหลัง mount เท่านั้น — ตอน render ฝั่งเซิร์ฟเวอร์ไม่มี navigator และห้ามให้ HTML สองฝั่งต่างกัน
  const [mobile, setMobile] = useState(false)
  useEffect(() => { setMobile(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)) }, [])

  const sendLine = () => {
    setErr('')
    setSent(true)
    fetch(shareApi!, { method: 'POST' })
      .then(async (r) => { if (!r.ok) setErr((await r.json().catch(() => ({}))).error || 'มาร์กว่าส่งแล้วไม่สำเร็จ') })
      .catch(() => setErr('มาร์กว่าส่งแล้วไม่สำเร็จ — ตัวไฟล์ PDF ยังใช้ได้ตามปกติ'))
    window.print()
  }

  /** มือถือ: ลิงก์ https ของไลน์เอง (universal link) ที่ iOS/Android ส่งต่อให้แอปเปิดหน้ารายการแชท */
  const openLine = () => { window.location.href = 'https://line.me/R/nv/chat' }

  return (
    <div className="ptoolbar">
      {err && <div className="pmsg err">{err}</div>}
      {sent && (
        <div className="pshare">
          <b>เหลืออีก 2 ขั้นตอน</b>
          <ol className="psteps">
            <li>ในหน้าต่างที่เปิดขึ้น เลือกปลายทางเป็น <b>บันทึกเป็น PDF</b> แล้วกด Save</li>
            <li>
              {mobile ? <>กด <b>💬 เปิดไลน์</b> แล้วเลือกแชทลูกค้า</> : <>เปิดแอป <b>LINE</b> จากทาสก์บาร์ แล้วเลือกแชทลูกค้า</>}
              {' '}<b>แนบไฟล์ที่เพิ่งบันทึก</b> (ชื่อไฟล์คือเลขที่เอกสาร + ชื่อลูกค้า)
            </li>
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
          {mobile && <button className="line" onClick={openLine}>💬 เปิดไลน์</button>}
        </>
      ) : (
        <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
      )}
    </div>
  )
}
