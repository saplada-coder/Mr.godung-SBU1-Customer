import type { Metadata } from 'next'
import { Noto_Sans_Thai } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { thTH } from '@clerk/localizations'
import PwaInstall from './pwa-install'

/** ทับทุกข้อความที่ดึงชื่อแอปสุ่มของ Clerk (clerk-claret-plank) มาแสดง */
const APP = 'Mr.โกดัง · SBU1'
const SUB = `เพื่อเข้าใช้งาน ${APP}`
const localization = {
  ...thTH,
  organizationList: { ...thTH.organizationList, subtitle: SUB },
  signIn: {
    ...thTH.signIn,
    start: { ...thTH.signIn?.start, title: 'เข้าสู่ระบบ', subtitle: APP, titleCombined: 'เข้าสู่ระบบ' },
    emailCode: { ...thTH.signIn?.emailCode, subtitle: SUB },
    emailCodeMfa: { ...thTH.signIn?.emailCodeMfa, subtitle: SUB },
    emailLink: { ...thTH.signIn?.emailLink, subtitle: SUB },
    emailLinkMfa: { ...thTH.signIn?.emailLinkMfa, subtitle: SUB },
    phoneCode: { ...thTH.signIn?.phoneCode, subtitle: SUB },
    alternativePhoneCodeProvider: { ...thTH.signIn?.alternativePhoneCodeProvider, subtitle: SUB },
  },
  signUp: {
    ...thTH.signUp,
    start: { ...thTH.signUp?.start, title: 'สมัครใช้งานตามคำเชิญ', subtitle: 'ตั้งอีเมลและรหัสผ่านของคุณเอง' },
    emailLink: { ...thTH.signUp?.emailLink, subtitle: SUB },
  },
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
  // PWA: ติดตั้งลงหน้าจอหลักได้ (manifest.ts) + ไอคอนตอนเพิ่มจาก Safari
  appleWebApp: { capable: true, title: 'Mr.โกดัง', statusBarStyle: 'black-translucent' },
  icons: { apple: '/apple-touch-icon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={localization}>
      <html lang="th" className={`${notoThai.variable} h-full antialiased`}>
        <body className="min-h-full">
          {children}
          <PwaInstall />
        </body>
      </html>
    </ClerkProvider>
  )
}
