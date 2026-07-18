import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { canManageUsers, ROLES, BUS, type Role } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/** รายชื่อผู้ใช้ทั้งหมด + คำเชิญที่ยังค้าง (เฉพาะเจ้าของ/ผู้ดูแลระบบ) */
export async function GET() {
  const me = await getSessionUser()
  if (!me || !me.active) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageUsers(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const db = getDb()
  const rows = await db.select().from(users).orderBy(users.id)

  let invitations: { id: string; email: string; createdAt: number }[] = []
  try {
    const client = await clerkClient()
    const inv = await client.invitations.getInvitationList({ status: 'pending' })
    invitations = inv.data.map((i) => ({ id: i.id, email: i.emailAddress.toLowerCase(), createdAt: i.createdAt }))
  } catch {
    // Clerk ล่มไม่ควรทำให้รายชื่อผู้ใช้ดูไม่ได้
  }

  return NextResponse.json({
    users: rows.map((u) => ({
      id: u.id, email: u.email, name: u.name, image: u.image,
      role: u.role, bu: u.bu, active: u.active,
      invited: invitations.some((i) => i.email === u.email),
    })),
    invitations: invitations.filter((i) => !rows.some((u) => u.email === i.email)),
    hasOwner: rows.some((u) => u.role === 'owner' && u.active),
  })
}

/** เชิญผู้ใช้ใหม่ทางอีเมล — Clerk ส่งลิงก์ให้ไปสมัคร/ตั้งรหัสผ่านเอง */
export async function POST(req: Request) {
  const me = await getSessionUser()
  if (!me || !me.active) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageUsers(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const b = await req.json()
  const email = String(b.email ?? '').trim().toLowerCase()
  const role = (ROLES as readonly string[]).includes(b.role) ? (b.role as Role) : 'viewer'
  const bu = (BUS as readonly string[]).includes(b.bu) ? b.bu : null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'อีเมลไม่ถูกต้อง' }, { status: 400 })
  if (role === 'owner' && me.role !== 'owner')
    return NextResponse.json({ error: 'เฉพาะเจ้าของที่ตั้งบทบาทเจ้าของได้' }, { status: 403 })

  const db = getDb()
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  try {
    const client = await clerkClient()
    await client.invitations.createInvitation({ emailAddress: email, notify: true, ignoreExisting: true })
  } catch (e) {
    const msg = (e as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0]?.longMessage
      || (e as Error).message || 'ส่งคำเชิญไม่สำเร็จ'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // จองบทบาท/BU ไว้ล่วงหน้า — ตอนผู้ใช้ล็อกอินครั้งแรก getSessionUser จะเจอแถวนี้
  if (existing) await db.update(users).set({ role, bu, active: true }).where(eq(users.id, existing.id))
  else await db.insert(users).values({ email, role, bu })

  return NextResponse.json({ ok: true })
}
