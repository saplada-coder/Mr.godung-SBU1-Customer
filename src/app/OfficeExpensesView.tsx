'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { OFFICE_CATS, costCatMeta, expMeta, canEdit, isAdminUp, type Role } from '@/lib/constants'
import { commas, fmtB, thDate, TH_MONTHS } from '@/lib/format'
import { pickImage, uiConfirm, uiPrompt, type ExpenseRow } from './biz-shared'

type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }

/** ค่าใช้จ่ายสำนักงาน — รายจ่ายบริษัทที่ไม่ผูกกับงานลูกค้า (เงินเดือน ค่าเช่า น้ำไฟ ฯลฯ) */
export default function OfficeExpensesView({ me, showToast, onChanged }: {
  me: Me; showToast: (m: string) => void; onChanged: () => void
}) {
  const [rows, setRows] = useState<ExpenseRow[] | null>(null)
  const [fMonth, setFMonth] = useState(''); const [fCat, setFCat] = useState(''); const [fStat, setFStat] = useState('')
  const [formOpen, setFormOpen] = useState<ExpenseRow | 'new' | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const admin = isAdminUp(me.role)
  const editable = canEdit(me.role)

  const load = useCallback(async () => {
    const r = await fetch('/api/office-expenses', { cache: 'no-store' })
    if (r.ok) setRows((await r.json()).expenses)
    else showToast('โหลดค่าใช้จ่ายสำนักงานไม่สำเร็จ')
  }, [showToast])
  useEffect(() => { load() }, [load])

  const months = useMemo(() => [...new Set((rows || []).map((e) => e.expenseDate.slice(0, 7)))].sort().reverse(), [rows])
  const list = useMemo(() => (rows || []).filter((e) =>
    (!fMonth || e.expenseDate.slice(0, 7) === fMonth) && (!fCat || e.category === fCat) && (!fStat || e.status === fStat),
  ), [rows, fMonth, fCat, fStat])

  if (!rows) return <div className="empty">กำลังโหลด…</div>

  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisYear = thisMonth.slice(0, 4)
  const approved = rows.filter((e) => e.status === 'อนุมัติแล้ว')
  const monthSum = approved.filter((e) => e.expenseDate.slice(0, 7) === thisMonth).reduce((a, e) => a + e.amount, 0)
  const yearSum = approved.filter((e) => e.expenseDate.slice(0, 4) === thisYear).reduce((a, e) => a + e.amount, 0)
  const listSum = list.filter((e) => e.status === 'อนุมัติแล้ว').reduce((a, e) => a + e.amount, 0)

  // สัดส่วนรายหมวดของช่วงที่กรองอยู่
  const catRows = OFFICE_CATS.map((c) => ({ ...c, v: list.filter((e) => e.category === c.k && e.status === 'อนุมัติแล้ว').reduce((a, e) => a + e.amount, 0) })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v)
  const catMax = Math.max(1, ...catRows.map((r) => r.v))

  return (
    <>
      <div className="view-head">
        <div><h1>ค่าใช้จ่ายสำนักงาน</h1><p>รายจ่ายบริษัทที่ไม่ผูกกับงานลูกค้า — บันทึกแล้วมีผลทันที</p></div>
        {editable && <button className="btn btn-primary" onClick={() => setFormOpen('new')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>บันทึกค่าใช้จ่าย</button>}
      </div>

      <div className="statgrid4">
        <div className="stat"><div className="rail" /><div className="l">เดือนนี้ (อนุมัติแล้ว)</div><div className="v">฿{fmtB(monthSum)}</div><div className="s">{TH_MONTHS[+thisMonth.slice(5, 7)]} {thisMonth.slice(0, 4)}</div></div>
        <div className="stat"><div className="rail" /><div className="l">ปีนี้สะสม</div><div className="v">฿{fmtB(yearSum)}</div><div className="s">ปี {thisYear}</div></div>
        <div className="stat"><div className="rail" style={{ background: '#b58600' }} /><div className="l">รายการเดือนนี้</div><div className="v">{rows.filter((e) => e.expenseDate.slice(0, 7) === thisMonth).length}</div><div className="s">รายการ</div></div>
        <div className="stat"><div className="rail" style={{ background: '#3f8f3a' }} /><div className="l">ยอดตามฟิลเตอร์</div><div className="v">฿{fmtB(listSum)}</div><div className="s">{list.length} รายการ</div></div>
      </div>

      <div className="tbar">
        <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">ทุกเดือน</option>{months.map((m) => <option key={m} value={m}>{TH_MONTHS[+m.slice(5, 7)] + ' ' + m.slice(0, 4)}</option>)}</select>
        <select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">ทุกหมวด</option>{OFFICE_CATS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}</select>
        <select value={fStat} onChange={(e) => setFStat(e.target.value)}><option value="">ทุกสถานะ</option>{['รออนุมัติ', 'อนุมัติแล้ว', 'ตีกลับ'].map((s) => <option key={s}>{s}</option>)}</select>
        <span className="tcount">{commas(list.length)} รายการ</span>
      </div>

      {catRows.length > 0 && (
        <section className="card" style={{ marginBottom: 14 }}>
          <div className="card-h"><h2>สัดส่วนรายหมวด</h2><span className="hint">เฉพาะอนุมัติแล้ว ตามฟิลเตอร์</span></div>
          <div className="funnel">
            {catRows.map((r) => (
              <div className="frow" key={r.k}>
                <div className="fn"><i style={{ background: r.c }} /><span>{r.label}</span></div>
                <div className="ftrack"><div className="ffill" style={{ width: (r.v / catMax * 100) + '%', background: r.c }} /></div>
                <div className="fc" style={{ minWidth: 84 }}>฿{fmtB(r.v)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="alist">
        {list.map((e) => {
          const em = expMeta(e.status), cm = costCatMeta(e.category)
          const canRowEdit = editable && (admin || e.createdBy === me.id)
          return (
            <div className="arow" key={e.id}>
              <div className="ab" style={{ background: cm.c }} />
              {e.receiptUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.receiptUrl} alt="บิล" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid var(--border)' }} onClick={() => setLightbox(e.receiptUrl)} />
              )}
              <div className="aw">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="an">{e.description}</span>
                  <span className="qchip" style={{ color: cm.c, background: 'transparent', border: `1px solid ${cm.c}44`, cursor: 'default' }}>{cm.label}</span>
                  <span className="qchip" style={{ color: em.c, background: em.b, cursor: 'default' }}>{e.status}</span>
                </div>
                <div className="as">
                  {thDate(e.expenseDate)}{e.vendor ? ' · ' + e.vendor : ''} · โดย {e.createdByName || '—'}
                  {e.status === 'อนุมัติแล้ว' && e.approvedByName ? ` · อนุมัติโดย ${e.approvedByName}` : ''}
                  {e.status === 'ตีกลับ' && e.rejectReason ? ` · เหตุผล: ${e.rejectReason}` : ''}
                </div>
              </div>
              <div className="ad">฿{commas(e.amount)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {canRowEdit && <button className="row-btn" onClick={() => setFormOpen(e)}>แก้ไข</button>}
              </div>
            </div>
          )
        })}
        {!list.length && <div className="empty">ยังไม่มีค่าใช้จ่ายสำนักงาน{fMonth || fCat || fStat ? 'ตามฟิลเตอร์นี้' : ''}</div>}
      </div>

      {formOpen && (
        <OfficeExpenseModal exp={formOpen === 'new' ? null : formOpen} admin={admin}
          onClose={() => setFormOpen(null)}
          onSaved={() => { setFormOpen(null); load(); onChanged() }} showToast={showToast} />
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

function OfficeExpenseModal({ exp, admin, onClose, onSaved, showToast }: {
  exp: ExpenseRow | null; admin: boolean
  onClose: () => void; onSaved: () => void; showToast: (m: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    category: exp?.category && (OFFICE_CATS as readonly { k: string }[]).some((c) => c.k === exp.category) ? exp.category : 'salary',
    description: exp?.description || '', vendor: exp?.vendor || '',
    amount: exp ? String(exp.amount) : '', expenseDate: exp?.expenseDate || today,
  })
  const [receipt, setReceipt] = useState<string | null>(exp?.receiptUrl || null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!f.description.trim()) { showToast('ระบุรายละเอียดค่าใช้จ่าย'); return }
    if (!(+f.amount > 0)) { showToast('จำนวนเงินต้องมากกว่า 0'); return }
    setBusy(true)
    const body = { ...f, amount: +f.amount, receiptUrl: receipt }
    const r = exp
      ? await fetch(`/api/expenses/${exp.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/office-expenses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) {
      showToast(exp ? 'แก้ไขแล้ว' : 'บันทึกแล้ว')
      onSaved()
    } else showToast((await r.json()).error || 'บันทึกไม่สำเร็จ')
  }
  const del = async () => {
    if (!exp || !await uiConfirm('ลบรายการนี้?')) return
    const r = await fetch(`/api/expenses/${exp.id}`, { method: 'DELETE' })
    if (r.ok) { showToast('ลบแล้ว'); onSaved() } else showToast((await r.json()).error || 'ลบไม่สำเร็จ')
  }

  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 500 }}>
        <div className="modal-h"><div><h3>{exp ? 'แก้ไขค่าใช้จ่ายสำนักงาน' : 'บันทึกค่าใช้จ่ายสำนักงาน'}</h3><div className="sub">บันทึกแล้วมีผลทันที — ไม่ต้องรออนุมัติ</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field"><label>หมวด *</label>
            <select value={f.category} onChange={(e) => setF((o) => ({ ...o, category: e.target.value }))}>
              {OFFICE_CATS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
          </div>
          <div className="field"><label>วันที่จ่าย *</label><input type="date" value={f.expenseDate} max={today} onChange={(e) => setF((o) => ({ ...o, expenseDate: e.target.value }))} /></div>
          <div className="field full"><label>รายละเอียด *</label><input value={f.description} onChange={(e) => setF((o) => ({ ...o, description: e.target.value }))} placeholder="เช่น เงินเดือนทีมออฟฟิศ ส.ค. / ค่าเช่าออฟฟิศ / ค่าไฟ" autoFocus={!exp} /></div>
          <div className="field"><label>จ่ายให้ / ร้าน</label><input value={f.vendor} onChange={(e) => setF((o) => ({ ...o, vendor: e.target.value }))} /></div>
          <div className="field"><label>จำนวนเงิน (บาท) *</label><input type="number" value={f.amount} onChange={(e) => setF((o) => ({ ...o, amount: e.target.value }))} /></div>
          <div className="field full"><label>บิล / สลิป</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {receipt && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={receipt} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border)' }} />
              )}
              <button type="button" className="btn btn-sm" onClick={() => pickImage(setReceipt, showToast)}>{receipt ? 'เปลี่ยนรูป' : '📷 แนบรูปบิล'}</button>
              {receipt && <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }} onClick={() => setReceipt(null)}>ลบรูป</button>}
            </div>
          </div>
        </div>
        <div className="modal-f">
          {exp && <button className="btn" style={{ color: '#b0281c', marginRight: 'auto' }} onClick={del}>ลบรายการ</button>}
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </div>
    </div>
  )
}
