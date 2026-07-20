import { SignIn } from '@clerk/nextjs'

export default function Page() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#131011', padding: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontFamily: 'var(--font-thai)', fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Mr.โกดัง</h1>
        <p style={{ color: '#9c9093', fontFamily: 'var(--font-thai)', fontSize: 13, marginBottom: 22 }}>SBU1 · ระบบจัดการลูกค้า · เฉพาะผู้ได้รับคำเชิญ</p>
        <SignIn appearance={{ variables: { colorPrimary: '#d11f2a' }, elements: { footerAction: { display: 'none' } } }} forceRedirectUrl="/" />
      </div>
    </main>
  )
}
