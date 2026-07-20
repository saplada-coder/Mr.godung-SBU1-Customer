import { auth, currentUser } from '@clerk/nextjs/server'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { users } from '@/db/schema'
import type { Role } from './constants'

export type SessionUser = {
  id: number
  email: string
  name: string | null
  image: string | null
  role: Role
  bu: string | null
  active: boolean
}

/**
 * อ่านผู้ใช้ปัจจุบันจาก Clerk แล้ว sync เข้า users table.
 * ระบบเป็นแบบเชิญเท่านั้น: อีเมลต้องมีแถวใน users อยู่แล้ว (สร้างจากหน้า "จัดการผู้ใช้")
 * - ถ้ายังไม่มี owner/admin เลย → คนแรกที่ล็อกอินกลายเป็น owner (bootstrap ระบบใหม่)
 * - อีเมลที่ไม่รู้จัก (สมัครเองผ่าน Clerk) → null = ไม่มีสิทธิ์เข้าใช้
 * - บัญชีที่ถูกระงับ (active=false) ยังได้ค่ากลับไป — ผู้เรียกต้องเช็ค active เอง
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId } = await auth()
  if (!userId) return null

  const cu = await currentUser()
  const email = cu?.emailAddresses?.[0]?.emailAddress?.toLowerCase()
  if (!email) return null

  const db = getDb()
  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') || cu?.username || null
  const image = cu?.imageUrl ?? null

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length) {
    const u = existing[0]
    if (u.name !== name || u.image !== image) {
      await db.update(users).set({ name, image }).where(eq(users.id, u.id))
    }
    return { id: u.id, email: u.email, name, image, role: u.role as Role, bu: u.bu, active: u.active }
  }

  const [{ n: adminCount }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.role} in ('owner', 'admin')`)) as unknown as [{ n: number }]
  if (adminCount > 0) return null // เชิญเท่านั้น — อีเมลนี้ไม่ได้ถูกสร้างจากหน้า "จัดการผู้ใช้"

  const [created] = await db.insert(users).values({ email, name, image, role: 'owner' }).returning()
  return { id: created.id, email: created.email, name, image, role: 'owner', bu: created.bu, active: created.active }
}
