import type { MetadataRoute } from 'next'

/** PWA manifest — ทำให้ "เพิ่มลงหน้าจอหลัก" แล้วเปิดเต็มจอเหมือนแอป */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mr.โกดัง · SBU1 - Customer',
    short_name: 'Mr.โกดัง',
    description: 'ระบบจัดการลูกค้า ใบเสนอราคา และ Budget Control งานก่อสร้าง — Mr.โกดัง SBU1',
    start_url: '/',
    display: 'standalone',
    background_color: '#141010',
    theme_color: '#c8102e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
