import type { Metadata } from 'next'
import { Noto_Sans_Thai } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { thTH } from '@clerk/localizations'
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
    <ClerkProvider localization={thTH}>
      <html lang="th" className={`${notoThai.variable} h-full antialiased`}>
        <body className="min-h-full">{children}</body>
      </html>
    </ClerkProvider>
  )
}
