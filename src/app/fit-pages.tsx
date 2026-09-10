'use client'

import { useEffect } from 'react'

/**
 * ย่อเนื้อหาของแต่ละหน้าเอกสารให้พอดีกระดาษ A4 หนึ่งแผ่น (ใช้ทั้งใบเสนอราคาและสัญญา)
 *
 * เอกสารที่รายการเยอะจะสูงเกินแผ่นนิดเดียว แล้วบล็อกลายเซ็นตกไปหน้าถัดไปจนเซ็นไม่ได้
 * ลดฟอนต์ตายตัวแก้ได้เฉพาะใบที่เจอตอนนั้น ใบที่ยาวกว่านั้นก็ตกอยู่ดี จึงวัดความสูงจริง
 * แล้วย่อเฉพาะหน้าที่เกิน — หน้าที่พอดีอยู่แล้วไม่ถูกแตะ
 *
 * โครงที่ต้องมี: .page > .pg-fit > .pg-in > เนื้อหา
 *
 * ย่อด้วย zoom ไม่ใช่ transform: transform ย่อแค่ภาพที่วาด ส่วนที่ layout จองไว้เท่าเดิม
 * กระดาษจึงยังถูกดันเป็นสองแผ่น และต้องไปตั้งความสูงของกล่องเองซึ่งเพี้ยนง่าย
 * zoom ย่อทั้งภาพและพื้นที่ที่จอง ความสูงของหน้าจึงลดลงจริงโดยไม่ต้องตั้งค่าอะไรเพิ่ม
 */
const PX_PER_MM = 96 / 25.4
const A4_H = 297 * PX_PER_MM
/**
 * กันไว้ให้หน้าเตี้ยกว่ากระดาษจริงพอสมควร เพราะพื้นที่พิมพ์จริงน้อยกว่า 297mm อยู่สองเรื่อง
 * 1) เบราว์เซอร์พิมพ์หัว/ท้ายกระดาษของมันเอง (URL, วันที่, "หน้าที่ 1 จาก 10") ปิดได้จากหน้าต่างพิมพ์เท่านั้น สั่งจาก CSS ไม่ได้
 * 2) ความกว้างตอนพิมพ์ไม่เท่าบนจอเป๊ะ ข้อความจึงตัดบรรทัดใหม่แล้วสูงกว่าที่วัดไว้เล็กน้อย
 */
const RESERVE = 32 * PX_PER_MM
/** ย่อได้ต่ำสุดเท่านี้ ต่ำกว่านี้ตัวหนังสือเล็กจนอ่านไม่ออก ปล่อยให้ล้นไปหน้าถัดไปดีกว่า */
const MIN_SCALE = 0.55

export default function FitPages() {
  useEffect(() => {
    const fit = () => {
      document.querySelectorAll<HTMLElement>('.pg-fit').forEach((box) => {
        const inner = box.firstElementChild as HTMLElement | null
        const page = box.parentElement
        if (!inner || !page || page.classList.contains('no-fit')) return
        // ล้างค่าเดิมก่อนวัด ไม่งั้นจะวัดความสูงของสิ่งที่ย่อไว้รอบก่อน
        inner.style.removeProperty('zoom')
        // ขอบบน-ล่างอ่านจาก .page จริง — ใบเสนอราคาใช้ 12mm สัญญาใช้ 16mm หน้าปกสัญญา 24mm
        const cs = getComputedStyle(page)
        const avail = A4_H - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - RESERVE
        const h = inner.scrollHeight
        if (h <= avail) return
        inner.style.setProperty('zoom', String(Math.max(MIN_SCALE, avail / h)))
      })
    }
    let raf = 0
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit) }
    schedule()
    // ฟอนต์ไทย โลโก้ และรูปผลงานโหลดทีหลัง ความสูงจะเปลี่ยน — วัดใหม่เมื่อของครบจริง
    document.fonts?.ready.then(schedule).catch(() => {})
    window.addEventListener('load', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('beforeprint', fit)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('load', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('beforeprint', fit)
    }
  }, [])
  return null
}
