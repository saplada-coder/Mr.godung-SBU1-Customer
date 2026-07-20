import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { shortLinks } from '@/db/schema'

export const dynamic = 'force-dynamic'

/** ลิงก์สั้น (public): /i/Ab3xK9 → redirect ไปลิงก์เชิญจริงของ Clerk */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const [row] = await getDb().select().from(shortLinks).where(eq(shortLinks.code, code)).limit(1)
  return NextResponse.redirect(row ? row.url : new URL('/sign-in', req.url))
}
