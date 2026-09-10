'use client'

import { useEffect } from 'react'

/**
 * ย่อเนื้อหาของแต่ละหน้าเอกสารให้พอดีกระดาษ A4 หนึ่งแผ่น (ใช้ทั้งใบเสนอราคาและสัญญา)
 *
 * เอกสารที่รายการเยอะจะสูงเกินแผ่นนิดเดียว แล้วบล็อกลายเซ็นตกไปหน้าถัดไปจนเซ็นไม่ได้
 * ลดฟอนต์ตายตัวแก้ได้เฉพาะใบที่เจอตอนนั้น ใบที่ยาวกว่านั้นก็ตกอยู่ดี จึงวัดความสูงจริง
 * แล้วย่อเฉพาะหน้าที่เกิน — หน้าที่พอดีอยู่แล้วไม่ถูกแตะ ขนาดตัวอักษรจึงเท่าเดิมในเอกสารส่วนใหญ่
 *
 * โครงที่ต้องมี: .page > .pg-fit > .pg-in > เนื้อหา
 * transform ไม่เปลี่ยนขนาดที่ layout จองไว้ .pg-fit จึงต้องถูกตั้งความสูงตามที่ย่อแล้ว
 * ไม่งั้นกระดาษยังถูกดันเป็นสองแผ่นเหมือนเดิม
 */
const PX_PER_MM = 96 / 25.4
const A4_H = 297 * PX_PER_MM
/** เผื่อความคลาดเคลื่อนของเบราว์เซอร์ตอนแปลง mm เป็นพิกเซล */
const SAFETY = 2 * PX_PER_MM
/** ย่อได้ต่ำสุดเท่านี้ ต่ำกว่านี้ตัวหนังสือเล็กจนอ่านไม่ออก ปล่อยให้ล้นไปหน้าถัดไปดีกว่า */
const MIN_SCALE = 0.6

export default function FitPages() {
  useEffect(() => {
    const fit = () => {
      document.querySelectorAll<HTMLElement>('.pg-fit').forEach((box) => {
        const inner = box.firstElementChild as HTMLElement | null
        if (!inner) return
        // ล้างค่าเดิมก่อนวัด ไม่งั้นจะวัดความสูงของสิ่งที่ย่อไว้รอบก่อน
        box.style.height = ''
        inner.style.transform = ''
        inner.style.width = ''
        // ขอบบน-ล่างอ่านจาก .page จริง — ใบเสนอราคาใช้ 12mm สัญญาใช้ 16mm
        const page = box.parentElement
        const cs = page && getComputedStyle(page)
        const pad = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 0
        const avail = A4_H - pad - SAFETY
        const h = inner.scrollHeight
        if (h <= avail) return
        const s = Math.max(MIN_SCALE, avail / h)
        inner.style.transformOrigin = 'top left'
        inner.style.transform = `scale(${s})`
        inner.style.width = `${100 / s}%`
        box.style.height = `${Math.ceil(h * s)}px`
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
