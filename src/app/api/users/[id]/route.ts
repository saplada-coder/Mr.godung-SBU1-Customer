import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { canManageUsers, ROLES, BUS, type Role } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const clerkErr = (e: unknown, fallback: string) =>
  (e as { errors?: { longMessage?: string }[] })?.errors?.[0]?.longMessage || (e as Error).message || fallback

/** แก้ไขผู้ใช้: บทบาท / BU / ระงับ-เปิดใช้ / ตั้งรหัสผ่านใหม่ (เจ้าของ+ผู้ดูแลระบบทำได้เสมอ) */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageUsers(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const id = Number((await ctx.params).id)
  const b = await req.json()
  const db = getDb()
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // ผู้ดูแลระบบแตะบัญชีเจ้าของไม่ได้ (ยกเว้นเจ้าของจัดการกันเอง)
  if (target.role === 'owner' && me.role !== 'owner' && target.id !== me.id)
    return NextResponse.json({ error: 'บัญชีเจ้าของ แก้ไขได้เฉพาะเจ้าของ' }, { status: 403 })

  const patch: Record<string, unknown> = {}

  if ('role' in b) {
    if (!(ROLES as readonly string[]).includes(b.role)) return NextResponse.json({ error: 'บทบาทไม่ถูกต้อง' }, { status: 400 })
    if (target.id === me.id && b.role !== me.role)
      return NextResponse.json({ error: 'เปลี่ยนบทบาทตัวเองไม่ได้ (กันล็อกตัวเองออกจากสิทธิ์)' }, { status: 400 })
    if (b.role === 'owner' && me.role !== 'owner')
      return NextResponse.json({ error: 'เฉพาะเจ้าของที่ตั้งบทบาทเจ้าของได้' }, { status: 403 })
    patch.role = b.role as Role
  }
  if ('bu' in b) patch.bu = (BUS as readonly string[]).includes(b.bu) ? b.bu : null
  if ('active' in b) {
    if (target.id === me.id && !b.active)
      return NextResponse.json({ error: 'ระงับบัญชีตัวเองไม่ได้' }, { status: 400 })
    patch.active = !!b.active
  }

  if ('password' in b) {
    const pw = String(b.password ?? '')
    if (pw.length < 8) return NextResponse.json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' }, { status: 400 })
    try {
      const client = await clerkClient()
      const list = await client.users.getUserList({ emailAddress: [target.email] })
      const cu = list.data[0]
      if (!cu) return NextResponse.json({ error: 'ผู้ใช้นี้ยังไม่ตอบรับคำเชิญ / ยังไม่เคยเข้าสู่ระบบ จึงยังตั้งรหัสผ่านให้ไม่ได้' }, { status: 400 })
      await client.users.updateUser(cu.id, { password: pw, signOutOfOtherSessions: true })
    } catch (e) {
      return NextResponse.json({ error: clerkErr(e, 'ตั้งรหัสผ่านไม่สำเร็จ') }, { status: 400 })
    }
  }

  if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, id))
  return NextResponse.json({ ok: true })
}

/** ยกเลิกคำเชิญ (id รูปแบบ inv_...) — ลบแถวผู้ใช้ที่จองไว้ด้วยถ้ายังไม่เคยเข้าระบบ */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageUsers(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const raw = (await ctx.params).id
  if (!raw.startsWith('inv_')) return NextResponse.json({ error: 'ยกเลิกได้เฉพาะคำเชิญ' }, { status: 400 })

  try {
    const client = await clerkClient()
    const inv = await client.invitations.revokeInvitation(raw)
    const email = inv.emailAddress.toLowerCase()
    // ถ้าอีเมลนี้ยังไม่มีบัญชีใน Clerk (ไม่เคยเข้าระบบ) → ลบแถวที่จองบทบาทไว้
    const list = await client.users.getUserList({ emailAddress: [email] })
    if (!list.data.length) await getDb().delete(users).where(eq(users.email, email))
  } catch (e) {
    return NextResponse.json({ error: clerkErr(e, 'ยกเลิกคำเชิญไม่สำเร็จ') }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
