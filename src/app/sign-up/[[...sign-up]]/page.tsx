import { SignUp } from '@clerk/nextjs'

/** หน้าตอบรับคำเชิญ — ลิงก์เชิญพามาที่นี่ (มี __clerk_ticket) ให้ตั้งรหัสผ่านเอง ไม่มีปุ่ม Google */
export default function Page() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#131011', padding: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontFamily: 'var(--font-thai)', fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Mr.โกดัง</h1>
        <p style={{ color: '#9c9093', fontFamily: 'var(--font-thai)', fontSize: 13, marginBottom: 22 }}>SBU1 · สมัครใช้งานตามคำเชิญ · ตั้งรหัสผ่านของคุณเอง</p>
        <SignUp
          appearance={{
            variables: { colorPrimary: '#d11f2a' },
            elements: { socialButtons: { display: 'none' }, dividerRow: { display: 'none' }, footerAction: { display: 'none' } },
          }}
          forceRedirectUrl="/"
        />
      </div>
    </main>
  )
}
