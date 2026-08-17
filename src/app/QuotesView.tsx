'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUS, BU_NAMES, COST_CATS, DEFAULT_INSTALLMENTS, QDOC_STATUSES, qdocMeta,
  canEdit, isAdminUp, type Role,
} from '@/lib/constants'
import { commas, thDate, fmtPhone } from '@/lib/format'
import { calcTotals, pickImage, type Quote, type HistItem } from './biz-shared'

type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }
type Cust = { id: number; code: string; bu: string; name: string | null; chname: string | null; phone: string | null; province: string | null; sqm: number | null; d: string | null }

/* ================= รายการใบเสนอราคา ================= */
export default function QuotesView({ me, records, limitedData, showToast, onChanged, onOpenProject }: {
  me: Me; records: Cust[]; limitedData?: boolean
  showToast: (m: string) => void; onChanged: () => void; onOpenProject: (projectId: number) => void
}) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [q, setQ] = useState(''); const [fStat, setFStat] = useState(''); const [fBu, setFBu] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const editable = canEdit(me.role)

  const load = useCallback(async () => {
    const r = await fetch('/api/quotes', { cache: 'no-store' })
    if (r.ok) setQuotes((await r.json()).quotes)
    else showToast('โหลดใบเสนอราคาไม่สำเร็จ')
  }, [showToast])
  useEffect(() => { load() }, [load])

  const list = useMemo(() => {
    if (!quotes) return []
    const ql = q.trim().toLowerCase()
    return quotes.filter((x) => {
      if (fStat && x.status !== fStat) return false
      if (fBu && x.bu !== fBu) return false
      if (ql && !`${x.code} ${x.customerName || ''} ${x.customerCode || ''} ${x.creatorName || ''}`.toLowerCase().includes(ql)) return false
      return true
    })
  }, [quotes, q, fStat, fBu])

  const create = async (customerId: number) => {
    const r = await fetch('/api/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerId }) })
    const j = await r.json()
    if (r.ok) { setPickerOpen(false); showToast('สร้างใบเสนอราคา ' + j.code); await load(); onChanged(); setOpenId(j.id) }
    else showToast(j.error || 'สร้างไม่สำเร็จ')
  }

  if (!quotes) return <div className="empty">กำลังโหลดใบเสนอราคา…</div>
  return (
    <>
      <div className="view-head">
        <div><h1>ใบเสนอราคา</h1><p>สร้าง → ขออนุมัติภายใน → พิมพ์ส่งลูกค้า → ลูกค้าตกลง → เปิดงานก่อสร้าง (Budget Control)</p></div>
        {editable && <button className="btn btn-primary" onClick={() => setPickerOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>สร้างใบเสนอราคา</button>}
      </div>
      <div className="tbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ / ชื่อลูกค้า / ผู้ทำ…" />
        </div>
        <select value={fStat} onChange={(e) => setFStat(e.target.value)}><option value="">ทุกสถานะ</option>{QDOC_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fBu} onChange={(e) => setFBu(e.target.value)}><option value="">ทุก BU</option>{BUS.map((b) => <option key={b} value={b}>{BU_NAMES[b]}</option>)}</select>
        <span className="tcount">{commas(list.length)} ใบ</span>
      </div>
      <div className="tscroll">
        <table style={{ minWidth: 900 }}>
          <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th className="r" style={{ textAlign: 'right' }}>ยอดรวมทั้งสิ้น</th><th className="r" style={{ textAlign: 'right' }}>กำไรคาด</th><th>สถานะ</th><th>ผู้ทำ</th><th>วันที่ออก</th><th className="act" /></tr></thead>
          <tbody>
            {list.map((x) => {
              const m = qdocMeta(x.status)
              return (
                <tr key={x.id}>
                  <td className="code">{x.code}{x.rev > 1 && <span className="tag-new">Rev.{x.rev}</span>}</td>
                  <td className="name">{x.customerName || '—'}<span className="prov">{x.customerCode}</span></td>
                  <td className="amt">฿{commas(x.total)}</td>
                  <td className="amt" style={{ color: x.profit == null ? 'var(--text-faint)' : x.profit >= 0 ? '#3f8f3a' : 'var(--accent)' }}>
                    {x.profit == null ? '—' : `฿${commas(x.profit)} (${(x.profitPct || 0).toFixed(0)}%)`}
                  </td>
                  <td><span className="qchip" style={{ color: m.c, background: m.b, cursor: 'default' }}>{m.k}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{x.creatorName || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{x.issueDate ? thDate(x.issueDate) : '—'}</td>
                  <td className="act" style={{ whiteSpace: 'nowrap' }}>
                    <button className="row-btn" onClick={() => setOpenId(x.id)}>เปิด</button>
                    <button className="row-btn" style={{ marginLeft: 5 }} onClick={() => window.open(`/quotes/${x.id}/print`, '_blank')}>พิมพ์</button>
                  </td>
                </tr>
              )
            })}
            {!list.length && <tr><td colSpan={8}><div className="empty">ยังไม่มีใบเสนอราคา — กด &quot;สร้างใบเสนอราคา&quot; เพื่อเริ่ม</div></td></tr>}
          </tbody>
        </table>
      </div>

      {pickerOpen && <CustomerPicker records={records} limitedData={limitedData} onClose={() => setPickerOpen(false)} onPick={create} />}
      {openId != null && (
        <QuoteModal id={openId} me={me} showToast={showToast}
          onClose={() => setOpenId(null)}
          onChanged={() => { load(); onChanged() }}
          onOpenProject={onOpenProject} />
      )}
    </>
  )
}

/* ---------------- เลือกลูกค้าเพื่อสร้างใบ ---------------- */
function CustomerPicker({ records, limitedData, onClose, onPick }: { records: Cust[]; limitedData?: boolean; onClose: () => void; onPick: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return records
      .filter((r) => !ql || `${r.name || ''} ${r.chname || ''} ${r.code} ${r.phone || ''}`.toLowerCase().includes(ql))
      .sort((a, b) => ((b.d || '') < (a.d || '') ? -1 : 1))
      .slice(0, 60)
  }, [records, q])
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 520 }}>
        <div className="modal-h"><div><h3>สร้างใบเสนอราคา</h3><div className="sub">เลือกลูกค้า — ระบบตั้งต้นรายการจากพื้นที่ × เรตของ BU ให้เลย</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form" style={{ gridTemplateColumns: '1fr' }}>
          <div className="search" style={{ minWidth: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / เบอร์…" autoFocus />
          </div>
          <div className="alist" style={{ maxHeight: 380, overflowY: 'auto' }}>
            {list.map((r) => (
              <div className="arow" key={r.id} style={{ cursor: busy ? 'wait' : 'pointer' }} onClick={() => { if (!busy) { setBusy(true); onPick(r.id) } }}>
                <div className="ab" style={{ background: 'var(--accent)' }} />
                <div className="aw">
                  <div className="an">{r.name || r.chname || r.code}</div>
                  <div className="as">{r.code} · {BU_NAMES[r.bu as keyof typeof BU_NAMES] || r.bu}{r.province ? ' · ' + r.province : ''}{r.sqm ? ` · ${commas(r.sqm)} ตร.ม.` : ''}{r.phone ? ' · ' + fmtPhone(r.phone) : ''}</div>
                </div>
                <span className="row-btn">เลือก</span>
              </div>
            ))}
            {!list.length && <div className="empty">ไม่พบลูกค้า</div>}
          </div>
          {limitedData && <div className="hintline">แสดงเฉพาะลูกค้า 3 เดือนล่าสุด — หาไม่เจอ ให้กดปุ่ม &quot;📅 3 เดือนล่าสุด&quot; ที่แถบบนเพื่อสลับเป็นข้อมูลทั้งหมด</div>}
        </div>
      </div>
    </div>
  )
}

/* ================= ฟอร์มใบเสนอราคา ================= */
type ItemRow = { description: string; qty: string; unit: string; unitPrice: string; amount: string; note: string }
type InstRowE = { title: string; detail: string; percent: string; amount: string; note: string }

export function QuoteModal({ id, me, onClose, onChanged, onOpenProject, showToast }: {
  id: number; me: Me; onClose: () => void; onChanged: () => void
  onOpenProject: (projectId: number) => void; showToast: (m: string) => void
}) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])
  const [busy, setBusy] = useState(false)
  // ฟิลด์แก้ไข (string ทั้งหมด เพื่อพิมพ์ได้ลื่น)
  const [f, setF] = useState({ issueDate: '', validUntil: '', refNo: '', opFeePct: '', discountDesign: '', discountBuild: '', vat: false, permitDays: '', buildDays: '', exclusions: '', warranty: '', spec: '', note: '', includePortfolio: true })
  const [items, setItems] = useState<ItemRow[]>([])
  const [insts, setInsts] = useState<InstRowE[]>([])
  const [costs, setCosts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const r = await fetch(`/api/quotes/${id}`, { cache: 'no-store' })
    if (!r.ok) { showToast('โหลดใบเสนอราคาไม่สำเร็จ'); onClose(); return }
    const j = await r.json()
    const qt: Quote = j.quote
    setQuote(qt); setHistory(j.history || [])
    setF({
      issueDate: qt.issueDate || '', validUntil: qt.validUntil || '', refNo: qt.refNo || '',
      opFeePct: qt.opFeePct != null ? String(qt.opFeePct) : '', discountDesign: qt.discountDesign != null ? String(qt.discountDesign) : '',
      discountBuild: qt.discountBuild != null ? String(qt.discountBuild) : '', vat: (qt.vatPct || 0) > 0,
      permitDays: qt.permitDays != null ? String(qt.permitDays) : '', buildDays: qt.buildDays != null ? String(qt.buildDays) : '',
      exclusions: qt.exclusions || '', warranty: qt.warranty || '', spec: qt.spec || '', note: qt.note || '',
      includePortfolio: qt.includePortfolio,
    })
    setItems(qt.items.map((i) => ({ description: i.description, qty: i.qty != null ? String(i.qty) : '', unit: i.unit || '', unitPrice: i.unitPrice != null ? String(i.unitPrice) : '', amount: String(i.amount), note: i.note || '' })))
    setInsts(qt.installments.map((i) => ({ title: i.title, detail: i.detail || '', percent: i.percent != null ? String(i.percent) : '', amount: String(i.amount), note: i.note || '' })))
    setCosts(Object.fromEntries((qt.costs || []).map((c) => [c.category, String(c.amount)])))
  }, [id, onClose, showToast])
  useEffect(() => { load() }, [load])

  const admin = isAdminUp(me.role)
  const mine = quote?.createdBy === me.id
  const canEditDoc = !!quote && canEdit(me.role) && (mine || admin) && ['ร่าง', 'รออนุมัติ'].includes(quote.status)
  const seeCosts = quote?.costs != null

  const t = calcTotals(items.map((i) => ({ amount: +i.amount || 0 })), +f.opFeePct || 0, +f.discountDesign || 0, +f.discountBuild || 0, f.vat ? 7 : 0)
  const costTotal = COST_CATS.reduce((a, c) => a + (+costs[c.k] || 0), 0)
  const instSum = insts.reduce((a, i) => a + (+i.amount || 0), 0)

  const setItem = (i: number, k: keyof ItemRow, v: string) => setItems((o) => {
    const n = [...o]; n[i] = { ...n[i], [k]: v }
    if (k === 'qty' || k === 'unitPrice') {
      const qty = +n[i].qty, up = +n[i].unitPrice
      if (qty > 0 && up > 0) n[i].amount = String(Math.round(qty * up))
    }
    return n
  })
  const setInst = (i: number, k: keyof InstRowE, v: string) => setInsts((o) => {
    const n = [...o]; n[i] = { ...n[i], [k]: v }
    if (k === 'percent') { const p = +v; if (p > 0) n[i].amount = String(Math.round(t.total * p / 100)) }
    return n
  })

  const save = async (silent = false): Promise<boolean> => {
    setBusy(true)
    const body = {
      issueDate: f.issueDate, validUntil: f.validUntil || null, refNo: f.refNo,
      opFeePct: f.opFeePct === '' ? null : +f.opFeePct, discountDesign: f.discountDesign === '' ? null : +f.discountDesign,
      discountBuild: f.discountBuild === '' ? null : +f.discountBuild, vatPct: f.vat ? 7 : 0,
      permitDays: f.permitDays === '' ? null : +f.permitDays, buildDays: f.buildDays === '' ? null : +f.buildDays,
      exclusions: f.exclusions, warranty: f.warranty, spec: f.spec, note: f.note, includePortfolio: f.includePortfolio,
      items: items.map((i) => ({ description: i.description, qty: i.qty === '' ? null : +i.qty, unit: i.unit, unitPrice: i.unitPrice === '' ? null : +i.unitPrice, amount: +i.amount || 0, note: i.note })),
      installments: insts.map((i) => ({ title: i.title, detail: i.detail, percent: i.percent === '' ? null : +i.percent, amount: +i.amount || 0, note: i.note })),
      ...(seeCosts ? { costs: COST_CATS.map((c) => ({ category: c.k, amount: +costs[c.k] || 0 })) } : {}),
    }
    const r = await fetch(`/api/quotes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) { if (!silent) showToast('บันทึกแล้ว'); await load(); onChanged(); return true }
    showToast((await r.json()).error || 'บันทึกไม่สำเร็จ'); return false
  }

  const action = async (a: string, extra: Record<string, unknown> = {}, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(true)
    const r = await fetch(`/api/quotes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: a, ...extra }) })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { await load(); onChanged() } else showToast(j.error || 'ทำรายการไม่สำเร็จ')
    return r.ok
  }

  const del = async () => {
    if (!window.confirm('ลบใบร่างนี้ถาวร?')) return
    const r = await fetch(`/api/quotes/${id}`, { method: 'DELETE' })
    if (r.ok) { showToast('ลบแล้ว'); onChanged(); onClose() } else showToast((await r.json()).error || 'ลบไม่สำเร็จ')
  }
  const revise = async () => {
    if (!window.confirm('สร้างฉบับแก้ไข (Revision) ใหม่? ใบปัจจุบันจะถูกมาร์กว่า "ถูกแทนที่"')) return
    setBusy(true)
    const r = await fetch(`/api/quotes/${id}/revise`, { method: 'POST' })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { showToast('สร้าง Revision ใหม่แล้ว'); onChanged(); onClose() } else showToast(j.error || 'ทำรายการไม่สำเร็จ')
  }
  const openProject = async () => {
    if (!window.confirm('เปิดงานก่อสร้างจากใบนี้?\n• มูลค่าสัญญา = ยอดรวมทั้งสิ้น\n• งบประมาณ = ประมาณการต้นทุน 6 หมวด\n• งวดเงิน = งวดในใบเสนอราคา\n• สถานะลูกค้า → ปิดงาน (ได้งาน)')) return
    setBusy(true)
    const r = await fetch(`/api/quotes/${id}/open-project`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { showToast('เปิดงานก่อสร้าง ' + j.code + ' แล้ว'); onChanged(); onClose(); onOpenProject(j.id) }
    else showToast(j.error || 'เปิดงานไม่สำเร็จ')
  }
  const submitForApproval = async () => { if (await save(true)) { if (await action('submit')) showToast('ส่งขออนุมัติแล้ว') } }

  if (!quote) return <div className="modal-bd"><div className="modal" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>กำลังโหลด…</div></div>
  const m = qdocMeta(quote.status)

  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ width: 'min(880px,100%)' }}>
        <div className="modal-h">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              {quote.code}{quote.rev > 1 && <span className="tag-new">Rev.{quote.rev}</span>}
              <span className="qchip" style={{ color: m.c, background: m.b, cursor: 'default' }}>{m.k}</span>
            </h3>
            <div className="sub">{quote.customerName || '—'} · {quote.customerCode} · {BU_NAMES[quote.bu as keyof typeof BU_NAMES] || quote.bu}{quote.creatorName ? ' · ผู้ทำ ' + quote.creatorName : ''}</div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div className="form">
          {quote.rejectReason && quote.status === 'ร่าง' && (
            <div className="field full"><div className="rejbox">ตีกลับ: {quote.rejectReason} — แก้ไขแล้วส่งขออนุมัติใหม่</div></div>
          )}
          {quote.projectId != null && (
            <div className="field full"><div className="okbox">ใบนี้เปิดงานก่อสร้างแล้ว <button type="button" className="btn btn-sm" onClick={() => { onClose(); onOpenProject(quote.projectId!) }}>เปิดดูงาน →</button></div></div>
          )}

          <div className="field"><label>วันที่ออกเอกสาร</label><input type="date" value={f.issueDate} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, issueDate: e.target.value }))} /></div>
          <div className="field"><label>ใช้ได้ถึงวันที่ (ยืนราคา)</label><input type="date" value={f.validUntil} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, validUntil: e.target.value }))} /></div>
          <div className="field"><label>เลขที่อ้างอิง</label><input value={f.refNo} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, refNo: e.target.value }))} /></div>
          <div className="field"><label>ระยะเวลา ขออนุญาต / ก่อสร้าง (วัน)</label>
            <div className="dims" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input type="number" value={f.permitDays} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, permitDays: e.target.value }))} placeholder="ขออนุญาต" />
              <input type="number" value={f.buildDays} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, buildDays: e.target.value }))} placeholder="ก่อสร้าง" />
            </div>
          </div>

          {/* ---- รายการ ---- */}
          <div className="fs"><div className="fs-t">รายการประมาณราคาก่อสร้าง</div></div>
          <div className="field full">
            <div className="qitems">
              <div className="qi-h"><span /><span>รายการ</span><span>จำนวน</span><span>หน่วย</span><span>ราคา/หน่วย</span><span>รวม (บาท)</span><span>หมายเหตุ</span><span /></div>
              {items.map((it, i) => (
                <div className="qi-r" key={i}>
                  <span className="qi-n">{i + 1}</span>
                  <input value={it.description} disabled={!canEditDoc} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="เช่น ขนาดอาคาร 1,600 ตร.ม." />
                  <input type="number" value={it.qty} disabled={!canEditDoc} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                  <input value={it.unit} disabled={!canEditDoc} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="ตร.ม." />
                  <input type="number" value={it.unitPrice} disabled={!canEditDoc} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} />
                  <input type="number" value={it.amount} disabled={!canEditDoc} onChange={(e) => setItem(i, 'amount', e.target.value)} />
                  <input value={it.note} disabled={!canEditDoc} onChange={(e) => setItem(i, 'note', e.target.value)} />
                  {canEditDoc ? <button type="button" className="qi-x" onClick={() => setItems((o) => o.filter((_, x) => x !== i))}>×</button> : <span />}
                </div>
              ))}
              {canEditDoc && <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setItems((o) => [...o, { description: '', qty: '', unit: '', unitPrice: '', amount: '', note: '' }])}>+ เพิ่มรายการ</button>}
            </div>
          </div>

          {/* ---- สรุปราคา ---- */}
          <div className="field"><label>ค่าดำเนินการ (%)</label><input type="number" value={f.opFeePct} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, opFeePct: e.target.value }))} /><div className="hintline">ตั้งต้น 15% — แก้รายใบได้</div></div>
          <div className="field"><label>ส่วนลดค่าแบบ / ส่วนลดค่าก่อสร้าง (บาท)</label>
            <div className="dims" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input type="number" value={f.discountDesign} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, discountDesign: e.target.value }))} placeholder="ค่าแบบ" />
              <input type="number" value={f.discountBuild} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, discountBuild: e.target.value }))} placeholder="ค่าก่อสร้าง" />
            </div>
          </div>
          <div className="field full">
            <div className="sumbox">
              <div><span>รวมรายการ</span><b>฿{commas(t.subtotal)}</b></div>
              <div><span>ค่าดำเนินการ {+f.opFeePct || 0}%</span><b>฿{commas(t.opFee)}</b></div>
              {(+f.discountDesign > 0 || +f.discountBuild > 0) && <div><span>ส่วนลด</span><b style={{ color: 'var(--accent)' }}>−฿{commas((+f.discountDesign || 0) + (+f.discountBuild || 0))}</b></div>}
              <div className="grand"><span>รวมทั้งสิ้น</span><b>฿{commas(t.total)}</b></div>
              <div>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: canEditDoc ? 'pointer' : 'default', fontSize: 12.5 }}>
                  <input type="checkbox" checked={f.vat} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, vat: e.target.checked }))} />VAT 7%
                </label>
                <b>{f.vat ? '฿' + commas(t.vatAmount) : '—'}</b>
              </div>
              {f.vat && <div className="grand"><span>รวมรวม VAT</span><b>฿{commas(t.grand)}</b></div>}
            </div>
          </div>

          {/* ---- ต้นทุนประมาณการ (ภายใน) ---- */}
          {seeCosts && (
            <>
              <div className="fs"><div className="fs-t">ประมาณการต้นทุน (ภายใน — ไม่ขึ้นหน้าพิมพ์)</div><div className="hintline">เมื่อเปิดงานก่อสร้าง 6 หมวดนี้จะกลายเป็นงบประมาณตั้งต้นของงานทันที</div></div>
              {COST_CATS.map((c) => (
                <div className="field" key={c.k}><label>{c.label}</label><input type="number" value={costs[c.k] || ''} disabled={!canEditDoc} onChange={(e) => setCosts((o) => ({ ...o, [c.k]: e.target.value }))} /></div>
              ))}
              <div className="field full">
                <div className="sumbox">
                  <div><span>ต้นทุนรวม</span><b>฿{commas(costTotal)}</b></div>
                  <div className="grand"><span>กำไรคาดการณ์</span><b style={{ color: t.total - costTotal >= 0 ? '#3f8f3a' : 'var(--accent)' }}>฿{commas(t.total - costTotal)} ({t.total > 0 ? ((t.total - costTotal) / t.total * 100).toFixed(1) : 0}%)</b></div>
                </div>
              </div>
            </>
          )}

          {/* ---- งวดงาน ---- */}
          <div className="fs"><div className="fs-t">งวดงาน / งวดเงิน</div>
            <div className="hintline">
              รวมงวด ฿{commas(instSum)} / ยอด ฿{commas(t.total)} {Math.abs(instSum - t.total) > 1 && <b style={{ color: 'var(--accent)' }}>· ไม่ตรงกัน ({instSum > t.total ? '+' : ''}{commas(instSum - t.total)})</b>}
            </div>
          </div>
          <div className="field full">
            {canEditDoc && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button type="button" className="btn btn-sm" onClick={() => setInsts(DEFAULT_INSTALLMENTS.map((d) => ({ title: d.title, detail: d.detail, percent: String(d.percent), amount: String(Math.round(t.total * d.percent / 100)), note: d.note })))}>ใช้แม่แบบ 9 งวด (30/10×6/5/5)</button>
                <button type="button" className="btn btn-sm" onClick={() => setInsts((o) => o.map((x) => ({ ...x, amount: x.percent ? String(Math.round(t.total * +x.percent / 100)) : x.amount })))}>คำนวณเงินจาก % ใหม่</button>
              </div>
            )}
            <div className="qinsts">
              {insts.map((it, i) => (
                <div className="qin-r" key={i}>
                  <div className="qin-top">
                    <input className="qin-title" value={it.title} disabled={!canEditDoc} onChange={(e) => setInst(i, 'title', e.target.value)} placeholder={`งวดที่ ${i + 1}`} />
                    <input className="qin-pct" type="number" value={it.percent} disabled={!canEditDoc} onChange={(e) => setInst(i, 'percent', e.target.value)} placeholder="%" />
                    <span className="qin-pcts">%</span>
                    <input className="qin-amt" type="number" value={it.amount} disabled={!canEditDoc} onChange={(e) => setInst(i, 'amount', e.target.value)} placeholder="บาท" />
                    {canEditDoc ? <button type="button" className="qi-x" onClick={() => setInsts((o) => o.filter((_, x) => x !== i))}>×</button> : <span />}
                  </div>
                  <textarea value={it.detail} disabled={!canEditDoc} onChange={(e) => setInst(i, 'detail', e.target.value)} placeholder="รายละเอียดงานของงวดนี้…" rows={2} />
                  <input value={it.note} disabled={!canEditDoc} onChange={(e) => setInst(i, 'note', e.target.value)} placeholder="หมายเหตุ (ขึ้นสีแดงบนฟอร์ม)" />
                </div>
              ))}
              {canEditDoc && <button type="button" className="btn btn-sm" onClick={() => setInsts((o) => [...o, { title: `งวดที่ ${o.length + 1}`, detail: '', percent: '', amount: '', note: '' }])}>+ เพิ่มงวด</button>}
            </div>
          </div>

          {/* ---- เงื่อนไข / สเปค ---- */}
          <div className="fs"><div className="fs-t">เงื่อนไข &amp; สเปค (ขึ้นหน้าพิมพ์)</div></div>
          <div className="field full"><label>ราคาไม่รวม / ข้อยกเว้น (ขึ้นสีแดง)</label><textarea value={f.exclusions} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, exclusions: e.target.value }))} rows={2} /></div>
          <div className="field full"><label>การรับประกันคุณภาพ</label><textarea value={f.warranty} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, warranty: e.target.value }))} rows={3} /></div>
          <div className="field full"><label>รายละเอียดสเปค (SPEC)</label><textarea value={f.spec} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, spec: e.target.value }))} rows={5} /></div>
          <div className="field full"><label>หมายเหตุท้ายใบ</label><textarea value={f.note} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, note: e.target.value }))} rows={2} /></div>
          <div className="field full">
            <label style={{ display: 'inline-flex', gap: 7, alignItems: 'center', cursor: canEditDoc ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={f.includePortfolio} disabled={!canEditDoc} onChange={(e) => setF((o) => ({ ...o, includePortfolio: e.target.checked }))} />
              แนบรูปผลงานท้ายใบ (จัดการรูปในตั้งค่าบริษัท)
            </label>
          </div>

          {/* ---- ประวัติ ---- */}
          <div className="fs"><div className="fs-t">ประวัติ</div></div>
          <div className="field full">
            {history.length === 0 ? <div className="hintline">ยังไม่มีประวัติ</div> : (
              <div className="histlist">{history.map((h, i) => (
                <div className="histrow" key={i}>
                  <div className="histdot" />
                  <div className="histbody">
                    <div className="histtext">{histText(h)}</div>
                    <div className="histmeta">{h.who} · {new Date(h.at).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}</div>
            )}
          </div>
        </div>

        <div className="modal-f" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => window.open(`/quotes/${id}/print`, '_blank')}>🖨 พิมพ์ / PDF</button>
          <span style={{ flex: 1 }} />
          {quote.status === 'ร่าง' && (mine || admin) && <button className="btn" style={{ color: '#b0281c' }} onClick={del}>ลบร่าง</button>}
          {canEditDoc && <button className="btn" disabled={busy} onClick={() => save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>}
          {quote.status === 'ร่าง' && (mine || admin) && <button className="btn btn-primary" disabled={busy} onClick={submitForApproval}>ส่งขออนุมัติ</button>}
          {quote.status === 'รออนุมัติ' && admin && (
            <>
              <button className="btn" style={{ color: '#b0281c' }} disabled={busy} onClick={async () => { const reason = window.prompt('เหตุผลที่ตีกลับ:'); if (reason?.trim()) { if (await action('reject', { reason })) showToast('ตีกลับแล้ว') } }}>ตีกลับ</button>
              <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await action('approve')) showToast('อนุมัติแล้ว') }}>✓ อนุมัติ</button>
            </>
          )}
          {quote.status === 'อนุมัติแล้ว' && <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await action('send')) showToast('มาร์กส่งลูกค้าแล้ว') }}>ส่งลูกค้าแล้ว</button>}
          {quote.status === 'ส่งลูกค้าแล้ว' && (
            <>
              <button className="btn" disabled={busy} onClick={revise}>แก้ไขเป็นฉบับใหม่</button>
              <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await action('accept')) showToast('บันทึกลูกค้าตกลงแล้ว') }}>✓ ลูกค้าตกลง</button>
            </>
          )}
          {['อนุมัติแล้ว'].includes(quote.status) && <button className="btn" disabled={busy} onClick={revise}>แก้ไขเป็นฉบับใหม่</button>}
          {['อนุมัติแล้ว', 'ส่งลูกค้าแล้ว'].includes(quote.status) && (mine || admin) && <button className="btn" style={{ color: '#b0281c' }} disabled={busy} onClick={() => action('cancel', {}, 'ยกเลิกใบเสนอราคานี้?')}>ยกเลิกใบ</button>}
          {quote.status === 'ลูกค้าตกลง' && !quote.projectId && admin && <button className="btn btn-primary" disabled={busy} onClick={openProject}>🏗 เปิดงานก่อสร้าง</button>}
        </div>
      </div>
    </div>
  )
}

function histText(h: HistItem): string {
  const map: Record<string, string> = {
    'quote-create': 'สร้างใบเสนอราคา', 'quote-edit': 'แก้ไขเนื้อหา', 'quote-submit': 'ส่งขออนุมัติ',
    'quote-approve': 'อนุมัติภายใน ✓', 'quote-reject': 'ตีกลับ', 'quote-send': 'ส่งลูกค้า',
    'quote-accept': 'ลูกค้าตกลง ✓', 'quote-revise': 'สร้าง Revision', 'quote-cancel': 'ยกเลิกใบ', 'project-open': 'เปิดงานก่อสร้าง',
  }
  const base = map[h.kind] || h.kind
  if (h.kind === 'quote-reject') return `${base}: ${h.newValue || ''}`
  if (h.newValue && h.oldValue) return `${base} (${h.oldValue} → ${h.newValue})`
  if (h.newValue) return `${base} ${h.newValue}`
  return base
}

/* ================= ตั้งค่าบริษัท (หัวกระดาษ/บัญชี/แม่แบบ/รูปผลงาน) ================= */
export function CompanySettingsModal({ onClose, showToast }: { onClose: () => void; showToast: (m: string) => void }) {
  const [f, setFRaw] = useState<Record<string, string>>({})
  const [logo, setLogo] = useState<string | null>(null)
  const [portfolio, setPortfolio] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setFRaw((o) => ({ ...o, [k]: v }))

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      const s = j.settings
      setFRaw({
        name: s.name || '', address: s.address || '', phone: s.phone || '', lineId: s.lineId || '', website: s.website || '',
        email: s.email || '', taxId: s.taxId || '', bankPersonal: s.bankPersonal || '', bankCompany: s.bankCompany || '',
        warrantyText: s.warrantyText || '', exclusionsText: s.exclusionsText || '',
        permitDays: String(s.permitDays ?? ''), buildDays: String(s.buildDays ?? ''), opFeePct: String(s.opFeePct ?? ''),
      })
      setLogo(s.logoUrl); setPortfolio(s.portfolio || []); setLoaded(true)
    }).catch(() => showToast('โหลดตั้งค่าไม่สำเร็จ'))
  }, [showToast])

  const save = async () => {
    setBusy(true)
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, logoUrl: logo, portfolio }) })
    setBusy(false)
    if (r.ok) { showToast('บันทึกตั้งค่าบริษัทแล้ว'); onClose() } else showToast((await r.json()).error || 'บันทึกไม่สำเร็จ')
  }

  if (!loaded) return <div className="modal-bd"><div className="modal" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>กำลังโหลด…</div></div>
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ width: 'min(760px,100%)' }}>
        <div className="modal-h"><div><h3>ตั้งค่าบริษัท &amp; ใบเสนอราคา</h3><div className="sub">หัวกระดาษ บัญชีรับเงิน ข้อความตั้งต้น และรูปผลงาน — ใช้กับใบเสนอราคาทุกใบ</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="fs" style={{ borderTop: 'none', paddingTop: 0 }}><div className="fs-t">หัวกระดาษ</div></div>
          <div className="field full" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, background: '#000' }} /> : <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--text-faint)' }}>โลโก้</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => pickImage(setLogo, showToast)}>อัปโหลดโลโก้</button>
              {logo && <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }} onClick={() => setLogo(null)}>ลบ</button>}
            </div>
          </div>
          <div className="field full"><label>ชื่อบริษัท</label><input value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field full"><label>ที่อยู่ (บรรทัดเดียวตามหัวกระดาษ)</label><input value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></div>
          <div className="field"><label>โทร (คั่นด้วย ,)</label><input value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="field"><label>Line ID</label><input value={f.lineId || ''} onChange={(e) => set('lineId', e.target.value)} /></div>
          <div className="field"><label>เว็บไซต์</label><input value={f.website || ''} onChange={(e) => set('website', e.target.value)} /></div>
          <div className="field"><label>Email</label><input value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="field"><label>เลขทะเบียนนิติบุคคล</label><input value={f.taxId || ''} onChange={(e) => set('taxId', e.target.value)} /></div>

          <div className="fs"><div className="fs-t">ช่องทางการชำระเงิน</div></div>
          <div className="field"><label>นามบุคคล (ไม่รับ VAT)</label><textarea rows={3} value={f.bankPersonal || ''} onChange={(e) => set('bankPersonal', e.target.value)} placeholder={'เลขที่บัญชี : …\nชื่อบัญชี : …\nธนาคาร : …'} /></div>
          <div className="field"><label>นามบริษัท (รับ VAT 7%)</label><textarea rows={3} value={f.bankCompany || ''} onChange={(e) => set('bankCompany', e.target.value)} placeholder={'เลขที่บัญชี : …\nชื่อบัญชี : …\nธนาคาร : …'} /></div>

          <div className="fs"><div className="fs-t">ค่าตั้งต้นของใบเสนอราคาใหม่</div></div>
          <div className="field"><label>ค่าดำเนินการ (%)</label><input type="number" value={f.opFeePct || ''} onChange={(e) => set('opFeePct', e.target.value)} /></div>
          <div className="field"><label>ระยะเวลา ขออนุญาต / ก่อสร้าง (วัน)</label>
            <div className="dims" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input type="number" value={f.permitDays || ''} onChange={(e) => set('permitDays', e.target.value)} />
              <input type="number" value={f.buildDays || ''} onChange={(e) => set('buildDays', e.target.value)} />
            </div>
          </div>
          <div className="field full"><label>ราคาไม่รวม / ข้อยกเว้น</label><textarea rows={2} value={f.exclusionsText || ''} onChange={(e) => set('exclusionsText', e.target.value)} /></div>
          <div className="field full"><label>การรับประกันคุณภาพ</label><textarea rows={3} value={f.warrantyText || ''} onChange={(e) => set('warrantyText', e.target.value)} /></div>

          <div className="fs"><div className="fs-t">รูปผลงานแนบท้ายใบเสนอราคา (สูงสุด 8 รูป)</div></div>
          <div className="field full">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {portfolio.map((src, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={{ width: 110, height: 80, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border)' }} />
                  <button type="button" className="qi-x" style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 6 }} onClick={() => setPortfolio((o) => o.filter((_, x) => x !== i))}>×</button>
                </div>
              ))}
              {portfolio.length < 8 && <button type="button" className="btn" style={{ width: 110, height: 80, justifyContent: 'center' }} onClick={() => pickImage((u) => setPortfolio((o) => [...o, u]), showToast)}>+ รูป</button>}
            </div>
          </div>
        </div>
        <div className="modal-f"><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกตั้งค่า'}</button></div>
      </div>
    </div>
  )
}

/* ================= ลายเซ็นของฉัน ================= */
export function SignatureModal({ me, onClose, showToast }: { me: Me; onClose: () => void; showToast: (m: string) => void }) {
  const [sig, setSig] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/users/${me.id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSig(j?.signatureUrl || null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [me.id])

  const save = async () => {
    setBusy(true)
    const r = await fetch(`/api/users/${me.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signatureUrl: sig }) })
    setBusy(false)
    if (r.ok) { showToast('บันทึกลายเซ็นแล้ว'); onClose() } else showToast((await r.json()).error || 'บันทึกไม่สำเร็จ')
  }

  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 440 }}>
        <div className="modal-h"><div><h3>ลายเซ็นของฉัน</h3><div className="sub">แปะอัตโนมัติในช่อง &quot;ผู้เสนอราคา&quot; บนใบเสนอราคาที่คุณสร้าง</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form" style={{ gridTemplateColumns: '1fr' }}>
          <div className="field full" style={{ alignItems: 'center' }}>
            {sig
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={sig} alt="ลายเซ็น" style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain', background: '#fff', borderRadius: 9, border: '1px solid var(--border)', padding: 8 }} />
              : <div style={{ padding: '22px 0', color: 'var(--text-faint)', fontSize: 13 }}>{loaded ? 'ยังไม่มีลายเซ็น' : 'กำลังโหลด…'}</div>}
          </div>
          <div className="field full" style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={() => pickImage(setSig, showToast)}>อัปโหลดรูปลายเซ็น</button>
            {sig && <button type="button" className="btn" style={{ color: '#b0281c' }} onClick={() => setSig(null)}>ลบลายเซ็น</button>}
          </div>
          <div className="field full"><div className="hintline">แนะนำ: เซ็นบนกระดาษขาว ถ่ายรูป/สแกน แล้วอัปโหลด — หรือไฟล์ PNG พื้นโปร่งใสจะสวยที่สุด</div></div>
        </div>
        <div className="modal-f"><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>
      </div>
    </div>
  )
}
