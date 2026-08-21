'use client'

import { useCallback, useEffect, useState } from 'react'
import { costCatMeta, isAdminUp, type Role } from '@/lib/constants'
import { commas, thDate } from '@/lib/format'
import { uiConfirm, uiPrompt } from './biz-shared'

type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }
type PendingPo = {
  id: number; code: string; vendor: string; category: string | null
  projectId: number | null; projectName: string
  issueDate: string; deliveryDate: string | null; total: number
  createdByName: string | null; createdAt: string; overBudget: boolean; overBy: number
}

/** กล่องรออนุมัติ — เฉพาะใบสั่งซื้อ (PO): ค่าใช้จ่าย/เอกสารอื่นบันทึกแล้วมีผลทันที */
export default function ApprovalsView({ me, showToast, onChanged, onOpenProject }: {
  me: Me; showToast: (m: string) => void; onChanged: () => void; onOpenProject: (projectId: number) => void
}) {
  const [data, setData] = useState<{ pos: PendingPo[] } | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const admin = isAdminUp(me.role)

  const load = useCallback(async () => {
    const r = await fetch('/api/approvals', { cache: 'no-store' })
    if (r.ok) { setData(await r.json()); setSel(new Set()) }
    else showToast('โหลดรายการรออนุมัติไม่สำเร็จ')
  }, [showToast])
  useEffect(() => { load() }, [load])

  const toggle = (id: number) => setSel((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const poAction = async (id: number, action: 'approve' | 'reject') => {
    let body: Record<string, unknown> = { action }
    if (action === 'reject') {
      const reason = await uiPrompt('เหตุผลที่ตีกลับ:')
      if (!reason?.trim()) return
      body = { action, reason }
    }
    const r = await fetch(`/api/po/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { showToast(action === 'approve' ? 'อนุมัติ PO แล้ว' : 'ตีกลับแล้ว'); load(); onChanged() }
    else showToast((await r.json()).error || 'ทำรายการไม่สำเร็จ')
  }
  const bulkApprove = async () => {
    if (!sel.size || !(await uiConfirm(`อนุมัติใบสั่งซื้อ ${sel.size} ใบที่เลือก?`))) return
    setBulkBusy(true)
    let ok = 0, fail = 0
    for (const id of sel) {
      const r = await fetch(`/api/po/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })
      if (r.ok) ok++; else fail++
    }
    setBulkBusy(false)
    showToast(`อนุมัติแล้ว ${ok} ใบ${fail ? ` · ล้มเหลว ${fail}` : ''}`)
    load(); onChanged()
  }

  if (!data) return <div className="empty">กำลังโหลด…</div>

  return (
    <>
      <div className="view-head">
        <div><h1>รออนุมัติ — ใบสั่งซื้อ (PO)</h1><p>{admin ? 'ตรวจใบ PO แล้วอนุมัติ/ตีกลับได้จากหน้านี้เลย' : 'ใบ PO ที่รอเจ้าของ/ผู้ดูแลระบบอนุมัติ'} · ค้าง {data.pos.length} ใบ — ค่าใช้จ่ายและเอกสารอื่นบันทึกแล้วมีผลทันที ไม่ต้องอนุมัติ</p></div>
      </div>

      <section className="card">
        <div className="sec-h">
          <h2>ใบสั่งซื้อรออนุมัติ</h2><span className="cnt-chip" style={{ background: '#8b2fb5' }}>{data.pos.length}</span>
          {admin && data.pos.length > 1 && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="row-btn" onClick={() => setSel(sel.size === data.pos.length ? new Set() : new Set(data.pos.map((e) => e.id)))}>
                {sel.size === data.pos.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
              {sel.size > 0 && <button className="btn btn-primary btn-sm" disabled={bulkBusy} onClick={bulkApprove}>{bulkBusy ? 'กำลังอนุมัติ…' : `✓ อนุมัติที่เลือก (${sel.size})`}</button>}
            </span>
          )}
        </div>
        <div className="alist">
          {data.pos.map((x) => {
            const cm = x.category ? costCatMeta(x.category) : null
            return (
              <div className="arow" key={x.id} style={x.overBudget ? { borderColor: '#b0281c66' } : undefined}>
                {admin && <input type="checkbox" checked={sel.has(x.id)} onChange={() => toggle(x.id)} style={{ width: 17, height: 17, flex: 'none', cursor: 'pointer' }} />}
                <div className="ab" style={{ background: '#8b2fb5' }} />
                <div className="aw">
                  <div className="an">
                    {x.code} · {x.vendor}
                    {cm && <span style={{ color: cm.c, fontSize: 11.5 }}> · {cm.label}</span>}
                    {x.overBudget && <span className="qchip" style={{ color: '#b0281c', background: '#f4dbd7', cursor: 'default', marginLeft: 6 }}>🚩 เกินงบ ฿{commas(x.overBy)}</span>}
                  </div>
                  <div className="as">{x.projectName} · สั่ง {thDate(x.issueDate)}{x.deliveryDate ? ' · ส่งของ ' + thDate(x.deliveryDate) : ''} · โดย {x.createdByName || '—'}</div>
                </div>
                <div className="ad">฿{commas(x.total)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <button className="row-btn" onClick={() => window.open(`/po/${x.id}/print`, '_blank')}>🖨 เปิดดูใบ</button>
                  {admin && (
                    <>
                      <button className="row-btn" style={{ color: '#3f8f3a' }} onClick={() => poAction(x.id, 'approve')}>✓ อนุมัติ</button>
                      <button className="row-btn" style={{ color: '#b0281c' }} onClick={() => poAction(x.id, 'reject')}>ตีกลับ</button>
                    </>
                  )}
                  {!admin && x.projectId != null && <button className="row-btn" onClick={() => onOpenProject(x.projectId!)}>เปิดดูงาน</button>}
                </div>
              </div>
            )
          })}
          {!data.pos.length && <div className="empty">ไม่มีใบสั่งซื้อค้างอนุมัติ 🎉</div>}
        </div>
      </section>
    </>
  )
}
