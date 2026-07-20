import type { Metadata } from 'next'
import { Noto_Sans_Thai } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { thTH } from '@clerk/localizations'

/** ทับข้อความที่ดึงชื่อแอปสุ่มของ Clerk (clerk-claret-plank) มาแสดง */
const localization = {
  ...thTH,
  signIn: { ...thTH.signIn, start: { ...thTH.signIn?.start, title: 'เข้าสู่ระบบ', subtitle: 'Mr.โกดัง · SBU1 - Customer' } },
  signUp: { ...thTH.signUp, start: { ...thTH.signUp?.start, title: 'สมัครใช้งานตามคำเชิญ', subtitle: 'ตั้งอีเมลและรหัสผ่านของคุณเอง' } },
}
import './globals.css'

const notoThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-thai',
})

export const metadata: Metadata = {
  title: 'Mr.โกดัง · SBU1 - Customer',
  description: 'ระบบจัดการลูกค้าและใบเสนอราคา — Mr.โกดัง SBU1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={localization}>
      <html lang="th" className={`${notoThai.variable} h-full antialiased`}>
        <body className="min-h-full">{children}</body>
      </html>
    </ClerkProvider>
  )
}
