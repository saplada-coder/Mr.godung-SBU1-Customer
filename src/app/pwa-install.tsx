'use client'

import { useEffect, useState } from 'react'

/**
 * แบนเนอร์ติดตั้ง PWA — "เพิ่มเว็บลงหน้าจอหลัก" ให้เปิดใช้เหมือนแอป (ไม่ใช่ดาวน์โหลดจากสโตร์)
 *
 * Android / คอมพิวเตอร์ (Chrome/Edge): ปุ่ม "ติดตั้งแอป" เรียก popup ติดตั้งมาตรฐานของ
 * เบราว์เซอร์ผ่าน event beforeinstallprompt → deferredPrompt.prompt()
 * iPhone/iPad: Safari ไม่มีคำสั่งติดตั้งให้เว็บเรียกเอง — ปุ่มเปิดคู่มือ 3 ขั้นแทน
 *
 * เงื่อนไขการโผล่: หลังเปิดหน้า ~2.5 วิ เฉพาะเมื่อ (1) ยังไม่ได้ติดตั้งเป็นแอปอยู่แล้ว
 * และ (2) ไม่เคยกด "ไว้ทีหลัง" ใน 7 วันที่ผ่านมา (จำใน localStorage)
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_DAYS = 7

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) // iPadOS ปลอมตัวเป็น Mac

export default function PwaInstall() {
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return // ติดตั้งเป็นแอปแล้ว — ไม่ต้องชวนซ้ำ
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
      if (at && Date.now() - at < DISMISS_DAYS * 864e5) return // เพิ่งกด "ไว้ทีหลัง"
    } catch { /* localStorage ปิดไว้ — โชว์ตามปกติ */ }

    setIos(isIOS())
    const onPrompt = (e: Event) => {
      e.preventDefault() // กัน popup อัตโนมัติ — เก็บไว้เรียกตอนผู้ใช้กดปุ่มเอง
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    const t = setTimeout(() => setShow(true), 2500)
    const onInstalled = () => setShow(false)
    window.addEventListener('appinstalled', onInstalled)
    return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ไม่เป็นไร */ }
    setShow(false); setGuideOpen(false)
  }

  const install = async () => {
    if (ios || !deferredPrompt) { setGuideOpen(true); return }
    await deferredPrompt.prompt() // popup ติดตั้งมาตรฐานของเบราว์เซอร์
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  // Android/เดสก์ท็อปที่เบราว์เซอร์ยังไม่ปล่อย beforeinstallprompt (ติดตั้งไม่ได้) และไม่ใช่ iOS → ไม่โชว์
  if (!show || (!ios && !deferredPrompt)) return null

  return (
    <>
      <div className="pwa-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="pwa-ic" />
        <div className="pwa-tx">
          <b>ติดตั้ง Mr.โกดัง ลงหน้าจอหลัก</b>
          <span>เปิดใช้ได้เหมือนแอป ไม่ต้องเข้าผ่านเบราว์เซอร์</span>
        </div>
        <button className="btn btn-sm" onClick={later}>ไว้ทีหลัง</button>
        <button className="btn btn-primary btn-sm" onClick={install}>{ios ? 'วิธีติดตั้ง' : 'ติดตั้งแอป'}</button>
      </div>

      {guideOpen && (
        <div className="modal-bd" style={{ zIndex: 95 }} onClick={(e) => { if (e.target === e.currentTarget) setGuideOpen(false) }}>
          <div className="modal" role="dialog" aria-modal style={{ maxWidth: 400 }}>
            <div className="modal-h"><h3>ติดตั้งลงหน้าจอโฮม (iPhone/iPad)</h3><button className="modal-x" onClick={() => setGuideOpen(false)}>×</button></div>
            <div className="form" style={{ gridTemplateColumns: '1fr' }}>
              <div className="pwa-step"><span className="pwa-n">1</span>กดปุ่ม <b>แชร์</b> <span className="pwa-share">⎋</span> ที่แถบล่างของ Safari</div>
              <div className="pwa-step"><span className="pwa-n">2</span>เลื่อนหา แล้วกด <b>&quot;เพิ่มไปยังหน้าจอโฮม&quot;</b> (Add to Home Screen)</div>
              <div className="pwa-step"><span className="pwa-n">3</span>กด <b>&quot;เพิ่ม&quot;</b> มุมขวาบน — ไอคอน Mr.โกดัง จะไปอยู่หน้าจอโฮม</div>
            </div>
            <div className="modal-f"><button className="btn" onClick={later}>ไว้ทีหลัง</button><button className="btn btn-primary" onClick={() => setGuideOpen(false)}>เข้าใจแล้ว</button></div>
          </div>
        </div>
      )}
    </>
  )
}
