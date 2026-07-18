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
}

/**
 * อ่านผู้ใช้ปัจจุบันจาก Clerk แล้ว sync เข้า users table.
 * - ถ้ายังไม่มี admin เลย → คนแรกที่ล็อกอินกลายเป็น admin (bootstrap)
 * - นอกนั้น default = viewer (แอดมินค่อยเลื่อนสิทธิ์ทีหลัง)
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
    return { id: u.id, email: u.email, name, image, role: u.role as Role, bu: u.bu }
  }

  const [{ n: adminCount }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'admin'))) as unknown as [{ n: number }]
  const role: Role = adminCount === 0 ? 'admin' : 'viewer'

  const [created] = await db.insert(users).values({ email, name, image, role }).returning()
  return { id: created.id, email: created.email, name, image, role, bu: created.bu }
}
