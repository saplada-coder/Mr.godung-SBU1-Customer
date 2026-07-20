import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { SignOutButton } from '@clerk/nextjs'
import { getSessionUser } from '@/lib/auth'
import Dashboard from './Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const me = await getSessionUser()
  if (!me) {
    const { userId } = await auth()
    if (!userId) redirect('/sign-in')
    // ล็อกอิน Clerk สำเร็จแต่อีเมลไม่ได้ถูกเชิญ — ระบบเป็นแบบเชิญเท่านั้น
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', textAlign: 'center', padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>บัญชีนี้ไม่ได้รับสิทธิ์เข้าใช้งาน</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>
            ระบบเปิดให้เฉพาะผู้ที่ได้รับคำเชิญจากเจ้าของ/ผู้ดูแลระบบเท่านั้น<br />
            หากคุณควรมีสิทธิ์ กรุณาติดต่อผู้ดูแลให้ส่งคำเชิญไปที่อีเมลของคุณ
          </p>
          <SignOutButton><button className="btn">ออกจากระบบ</button></SignOutButton>
        </div>
      </div>
    )
  }
  if (!me.active) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', textAlign: 'center', padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>บัญชีถูกระงับการใช้งาน</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>ติดต่อเจ้าของหรือผู้ดูแลระบบเพื่อเปิดใช้งานอีกครั้ง ({me.email})</p>
          <SignOutButton><button className="btn">ออกจากระบบ</button></SignOutButton>
        </div>
      </div>
    )
  }
  return <Dashboard me={me} />
}
