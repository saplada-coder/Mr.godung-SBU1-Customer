import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getDb } from '@/db'
import { users, shortLinks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { canManageUsers, ROLES, BUS, type Role } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/* ลิงก์เชิญของ Clerk ยาวมาก — ย่อเป็น /i/<code> บนโดเมนเราเอง */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const genCode = () => Array.from(randomBytes(6), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('')
async function shortInviteUrl(origin: string, url: string | null): Promise<string | null> {
  if (!url) return null
  const db = getDb()
  const [ex] = await db.select().from(shortLinks).where(eq(shortLinks.url, url)).limit(1)
  if (ex) return `${origin}/i/${ex.code}`
  for (let i = 0; i < 3; i++) {
    const code = genCode()
    try {
      await db.insert(shortLinks).values({ code, url })
      return `${origin}/i/${code}`
    } catch { /* code ชนกัน (โอกาสน้อยมาก) — สุ่มใหม่ */ }
  }
  return url // ย่อไม่สำเร็จ ใช้ลิงก์ยาวไปก่อน
}

/** รายชื่อผู้ใช้ทั้งหมด + คำเชิญที่ยังค้าง (เฉพาะเจ้าของ/ผู้ดูแลระบบ) */
export async function GET(req: Request) {
  const me = await getSessionUser()
  if (!me || !me.active) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageUsers(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const db = getDb()
  const origin = new URL(req.url).origin
  const [rows, invitations] = await Promise.all([
    db.select().from(users).orderBy(users.id),
    (async () => {
      try {
        const client = await clerkClient()
        const inv = await client.invitations.getInvitationList({ status: 'pending' })
        return Promise.all(inv.data.map(async (i) => ({
          id: i.id, email: i.emailAddress.toLowerCase(), createdAt: i.createdAt,
          url: await shortInviteUrl(origin, i.url ?? null),
        })))
      } catch {
        // Clerk ล่มไม่ควรทำให้รายชื่อผู้ใช้ดูไม่ได้
        return [] as { id: string; email: string; createdAt: number; url: string | null }[]
      }
    })(),
  ])

  return NextResponse.json({
    users: rows.map((u) => {
      const inv = invitations.find((i) => i.email === u.email)
      return {
        id: u.id, email: u.email, name: u.name, image: u.image,
        role: u.role, bu: u.bu, active: u.active,
        invited: !!inv, inviteUrl: inv?.url ?? null,
      }
    }),
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

  let inviteUrl: string | null = null
  try {
    const client = await clerkClient()
    const origin = new URL(req.url).origin
    // redirectUrl → หน้า /sign-up ของเราเอง (อีเมล+รหัสผ่าน ไม่มีปุ่ม Google)
    const inv = await client.invitations.createInvitation({ emailAddress: email, notify: true, ignoreExisting: true, redirectUrl: `${origin}/sign-up` })
    inviteUrl = await shortInviteUrl(origin, inv.url ?? null)
  } catch (e) {
    const msg = (e as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0]?.longMessage
      || (e as Error).message || 'ส่งคำเชิญไม่สำเร็จ'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // จองบทบาท/BU ไว้ล่วงหน้า — ตอนผู้ใช้ล็อกอินครั้งแรก getSessionUser จะเจอแถวนี้
  if (existing) await db.update(users).set({ role, bu, active: true }).where(eq(users.id, existing.id))
  else await db.insert(users).values({ email, role, bu })

  return NextResponse.json({ ok: true, inviteUrl })
}
