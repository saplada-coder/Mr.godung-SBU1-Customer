import { redirect } from 'next/navigation'
import { SignOutButton } from '@clerk/nextjs'
import { getSessionUser } from '@/lib/auth'
import Dashboard from './Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const me = await getSessionUser()
  if (!me) redirect('/sign-in')
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
