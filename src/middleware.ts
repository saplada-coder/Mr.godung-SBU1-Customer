import { clerkMiddleware } from '@clerk/nextjs/server'

/**
 * แค่ติดตั้ง Clerk context (ไม่ force-protect ที่ middleware)
 * - หน้าเว็ป: page.tsx เรียก getSessionUser() แล้ว redirect('/sign-in') เองถ้ายังไม่ล็อกอิน
 * - API: แต่ละ handler เช็ค getSessionUser() แล้วตอบ 401 เอง
 * ทำแบบนี้เพื่อเลี่ยง protect-rewrite→404 ของ Clerk dev instance และได้ redirect ที่สะอาด
 */
export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
