import { NextResponse } from 'next/server'
import { desc, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { billingDocs, billingDocImages, projects, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { n0 } from '@/lib/biz'

export const dynamic = 'force-dynamic'

/** เอกสารการเงินทั้งหมดทุกงาน (สำหรับหน้ารวม "เอกสารการเงิน") */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getDb()
  const [rows, projs, allUsers, imgCounts] = await Promise.all([
    db.select().from(billingDocs).orderBy(desc(billingDocs.id)),
    db.select({ id: projects.id, name: projects.name, code: projects.code }).from(projects),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
    db.select({ docId: billingDocImages.docId, n: sql<number>`count(*)::int` }).from(billingDocImages).groupBy(billingDocImages.docId),
  ])
  const projMap = new Map(projs.map((p) => [p.id, p]))
  const userMap = new Map(allUsers.map((u) => [u.id, u.name || u.email]))
  const imgMap = new Map(imgCounts.map((x) => [x.docId, x.n]))
  return NextResponse.json({
    docs: rows.map((d) => ({
      id: d.id, kind: d.kind, code: d.code, custName: d.custName,
      projectId: d.projectId, projectName: projMap.get(d.projectId)?.name || projMap.get(d.projectId)?.code || '—',
      issueDate: d.issueDate, dueDate: d.dueDate, payDate: d.payDate, payMethod: d.payMethod,
      total: n0(d.total), vatAmount: n0(d.vatAmount), whtAmount: n0(d.whtAmount),
      status: d.status, cancelReason: d.cancelReason, imageCount: imgMap.get(d.id) ?? 0,
      createdByName: d.createdBy ? userMap.get(d.createdBy) : null, createdAt: d.createdAt,
    })),
  })
}
