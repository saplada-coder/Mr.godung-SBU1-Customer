'use client'

import { useCallback, useEffect, useState } from 'react'
import { costCatMeta, isAdminUp, type Role } from '@/lib/constants'
import { commas, thDate } from '@/lib/format'
import { QuoteModal } from './QuotesView'

type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }
type PendingQuote = { id: number; code: string; rev: number; customerName: string; total: number; profit: number; profitPct: number; creatorName: string | null; updatedAt: string }
type PendingExpense = { id: number; projectId: number | null; projectName: string; category: string; description: string; vendor: string | null; amount: number; expenseDate: string; receiptUrl: string | null; createdByName: string | null; createdAt: string; overBudget: boolean; overBy: number }

/** กล่องรออนุมัติ — ใบเสนอราคา (ก่อนส่งลูกค้า) + ค่าใช้จ่าย (ทุกงาน) */
export default function ApprovalsView({ me, showToast, onChanged, onOpenProject }: {
  me: Me; showToast: (m: string) => void; onChanged: () => void; onOpenProject: (projectId: number) => void
}) {
  const [data, setData] = useState<{ quotes: PendingQuote[]; expenses: PendingExpense[] } | null>(null)
  const [openQuote, setOpenQuote] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
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
  const bulkApprove = async () => {
    if (!sel.size || !window.confirm(`อนุมัติค่าใช้จ่าย ${sel.size} รายการที่เลือก?`)) return
    setBulkBusy(true)
    let ok = 0, fail = 0
    for (const id of sel) {
      const r = await fetch(`/api/expenses/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })
      if (r.ok) ok++; else fail++
    }
    setBulkBusy(false)
    showToast(`อนุมัติแล้ว ${ok} รายการ${fail ? ` · ล้มเหลว ${fail}` : ''}`)
    load(); onChanged()
  }

  const expAction = async (id: number, action: 'approve' | 'reject') => {
    let body: Record<string, unknown> = { action }
    if (action === 'reject') {
      const reason = window.prompt('เหตุผลที่ตีกลับ:')
      if (!reason?.trim()) return
      body = { action, reason }
    }
    const r = await fetch(`/api/expenses/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { showToast(action === 'approve' ? 'อนุมัติแล้ว' : 'ตีกลับแล้ว'); load(); onChanged() }
    else showToast((await r.json()).error || 'ทำรายการไม่สำเร็จ')
  }

  if (!data) return <div className="empty">กำลังโหลด…</div>
  const total = data.quotes.length + data.expenses.length

  return (
    <>
      <div className="view-head">
        <div><h1>รออนุมัติ</h1><p>{admin ? 'อนุมัติ/ตีกลับได้จากหน้านี้เลย' : 'รายการที่รอเจ้าของ/ผู้ดูแลระบบอนุมัติ'} · ค้างทั้งหมด {total} รายการ</p></div>
      </div>

      <section className="card">
        <div className="sec-h"><h2>ใบเสนอราคา — รออนุมัติภายใน</h2><span className="cnt-chip" style={{ background: '#b58600' }}>{data.quotes.length}</span></div>
        <div className="alist">
          {data.quotes.map((q) => (
            <div className="arow" key={q.id}>
              <div className="ab" style={{ background: '#b58600' }} />
              <div className="aw">
                <div className="an">{q.code}{q.rev > 1 ? ` (Rev.${q.rev})` : ''} · {q.customerName}</div>
                <div className="as">ยอด ฿{commas(q.total)} · กำไรคาด ฿{commas(q.profit)} ({q.profitPct.toFixed(0)}%) · โดย {q.creatorName || '—'}</div>
              </div>
              <button className="row-btn" onClick={() => setOpenQuote(q.id)}>เปิดตรวจ / อนุมัติ</button>
            </div>
          ))}
          {!data.quotes.length && <div className="empty">ไม่มีใบเสนอราคาค้างอนุมัติ 🎉</div>}
        </div>
      </section>

      <section className="card mt">
        <div className="sec-h">
          <h2>ค่าใช้จ่าย — รออนุมัติ</h2><span className="cnt-chip" style={{ background: 'var(--accent)' }}>{data.expenses.length}</span>
          {admin && data.expenses.length > 1 && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="row-btn" onClick={() => setSel(sel.size === data.expenses.length ? new Set() : new Set(data.expenses.map((e) => e.id)))}>
                {sel.size === data.expenses.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
              {sel.size > 0 && <button className="btn btn-primary btn-sm" disabled={bulkBusy} onClick={bulkApprove}>{bulkBusy ? 'กำลังอนุมัติ…' : `✓ อนุมัติที่เลือก (${sel.size})`}</button>}
            </span>
          )}
        </div>
        <div className="alist">
          {data.expenses.map((e) => {
            const cm = costCatMeta(e.category)
            return (
              <div className="arow" key={e.id} style={e.overBudget ? { borderColor: '#b0281c66' } : undefined}>
                {admin && <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} style={{ width: 17, height: 17, flex: 'none', cursor: 'pointer' }} />}
                <div className="ab" style={{ background: cm.c }} />
                {e.receiptUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={e.receiptUrl} alt="บิล" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid var(--border)' }} onClick={() => setLightbox(e.receiptUrl)} />
                )}
                <div className="aw">
                  <div className="an">{e.description} <span style={{ color: cm.c, fontSize: 11.5 }}>· {cm.label}</span>
                    {e.overBudget && <span className="qchip" style={{ color: '#b0281c', background: '#f4dbd7', cursor: 'default', marginLeft: 6 }}>🚩 เกินงบ ฿{commas(e.overBy)}</span>}
                  </div>
                  <div className="as">{e.projectName} · {thDate(e.expenseDate)}{e.vendor ? ' · ' + e.vendor : ''} · โดย {e.createdByName || '—'}</div>
                </div>
                <div className="ad">฿{commas(e.amount)}</div>
                {admin ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <button className="row-btn" style={{ color: '#3f8f3a' }} onClick={() => expAction(e.id, 'approve')}>✓ อนุมัติ</button>
                    <button className="row-btn" style={{ color: '#b0281c' }} onClick={() => expAction(e.id, 'reject')}>ตีกลับ</button>
                  </div>
                ) : e.projectId != null ? (
                  <button className="row-btn" onClick={() => onOpenProject(e.projectId!)}>เปิดดูงาน</button>
                ) : null}
              </div>
            )
          })}
          {!data.expenses.length && <div className="empty">ไม่มีค่าใช้จ่ายค้างอนุมัติ 🎉</div>}
        </div>
      </section>

      {openQuote != null && (
        <QuoteModal id={openQuote} me={me} showToast={showToast}
          onClose={() => setOpenQuote(null)}
          onChanged={() => { load(); onChanged() }}
          onOpenProject={(pid) => { setOpenQuote(null); onOpenProject(pid) }} />
      )}
      {lightbox && (
        <div className="modal-bd" style={{ zIndex: 90, cursor: 'zoom-out' }} onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 12 }} />
        </div>
      )}
    </>
  )
}
