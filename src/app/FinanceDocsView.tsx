'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BILL_KINDS, billKindMeta, COST_CATS, OFFICE_CATS, canEdit, isAdminUp, type Role } from '@/lib/constants'
import { commas, thDate } from '@/lib/format'
import { pickImage, uiPrompt, type InstRow } from './biz-shared'
import { CustLink } from './CustomerDocs'
import { BillingModal, BillDetailModal } from './ProjectsView'
import { CustomerPicker } from './QuotesView'

type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }
type Cust = { id: number; code: string; bu: string; name: string | null; chname: string | null; phone: string | null; province: string | null; sqm: number | null; d: string | null }
type ProjLite = { id: number; code: string; name: string; bu: string; customerId: number; customerName: string | null; status: string; contractAmount: number }
type DocRow = {
  id: number; type: string; code: string; title: string; sub: string
  total: number; issueDate: string; status: string; createdAt: string; imageCount: number
  /** ลูกค้าของงานที่เอกสารผูกอยู่ — แยกจาก sub เพื่อให้กดชื่อดูเอกสารทั้งหมดของลูกค้าได้ (PO ไม่มี) */
  customerId?: number | null; custName?: string | null
}

const stripC = (s: string) => s.replace(/[^\d]/g, '')
const fmtC = (s: string) => (s ? Number(s).toLocaleString('en-US') : '')

/**
 * ศูนย์รวมเอกสารการเงิน — สร้างได้ทุกใบจากที่เดียว แล้วค่อยเลือกลูกค้า/งาน
 * ระบบดึงรายละเอียดที่เชื่อมโยงกัน (ใบเสนอ → งาน → งวด) มาให้เอง
 */
export default function FinanceDocsView({ me, records, showToast, onChanged, onCreateQuote, onOpenProject, onOpenCustomer }: {
  me: Me; records: Cust[]; showToast: (m: string) => void; onChanged: () => void
  onCreateQuote: (rec: { id: number }) => void; onOpenProject: (pid: number) => void
  onOpenCustomer: (customerId: number) => void
}) {
  const [billing, setBilling] = useState<DocRow[] | null>(null)
  const [pos, setPos] = useState<DocRow[] | null>(null)
  const [projects, setProjects] = useState<ProjLite[]>([])
  const [fType, setFType] = useState(''); const [q, setQ] = useState('')
  const [quotePicker, setQuotePicker] = useState(false)
  // เลือกงานก่อน → เปิดฟอร์มออกใบวางบิล/ใบเสร็จของงานนั้น
  const [projPicker, setProjPicker] = useState<null | 'invoice' | 'receipt'>(null)
  const [billingCtx, setBillingCtx] = useState<{ projectId: number; installments: InstRow[]; preset: { kind: string; instIds: number[] } } | null>(null)
  const [poOpen, setPoOpen] = useState(false)
  const [imgDoc, setImgDoc] = useState<DocRow | null>(null)
  const admin = isAdminUp(me.role)
  const editable = canEdit(me.role)

  const load = useCallback(async () => {
    const [rb, rp, rj] = await Promise.all([
      fetch('/api/billing', { cache: 'no-store' }),
      fetch('/api/po', { cache: 'no-store' }),
      fetch('/api/projects', { cache: 'no-store' }),
    ])
    if (rb.ok) {
      const j = await rb.json()
      setBilling((j.docs as Record<string, never>[]).map((d) => ({
        id: d.id, type: d.kind, code: d.code, title: billKindMeta(d.kind).label,
        sub: `${d.projectName}${d.createdByName ? ' · โดย ' + d.createdByName : ''}`,
        customerId: d.customerId ?? null, custName: d.custName ?? null,
        total: d.total, issueDate: d.issueDate, status: d.status, createdAt: d.createdAt, imageCount: d.imageCount || 0,
      })))
    }
    if (rp.ok) {
      const j = await rp.json()
      setPos((j.pos as Record<string, never>[]).map((d) => ({
        id: d.id, type: 'po', code: d.code, title: 'ใบสั่งซื้อ (PO)',
        sub: `${d.projectName} · ${d.vendor}${d.createdByName ? ' · โดย ' + d.createdByName : ''}`,
        total: d.total, issueDate: d.issueDate, status: d.status, createdAt: d.createdAt, imageCount: 0,
      })))
    }
    if (rj.ok) setProjects(((await rj.json()).projects as ProjLite[]).filter((p) => p.status !== 'ปิดงาน'))
  }, [])
  useEffect(() => { load() }, [load])

  const list = useMemo(() => {
    const all = [...(billing || []), ...(pos || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const ql = q.trim().toLowerCase()
    return all.filter((d) =>
      (!fType || d.type === fType) &&
      (!ql || `${d.code} ${d.title} ${d.sub}`.toLowerCase().includes(ql)))
  }, [billing, pos, fType, q])

  const openBillingFor = async (projectId: number, kind: 'invoice' | 'receipt') => {
    const r = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' })
    if (!r.ok) { showToast('โหลดข้อมูลงานไม่สำเร็จ'); return }
    const j = await r.json()
    setProjPicker(null)
    setBillingCtx({ projectId, installments: j.installments, preset: { kind, instIds: [] } })
  }

  const printUrl = (d: DocRow) => (d.type === 'po' ? `/po/${d.id}/print` : `/billing/${d.id}/print`)
  const cancelDoc = async (d: DocRow) => {
    const reason = await uiPrompt(`ยกเลิก ${d.code}?\nระบุเหตุผล:`)
    if (!reason?.trim()) return
    const url = d.type === 'po' ? `/api/po/${d.id}` : `/api/billing/${d.id}`
    const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', reason }) })
    if (r.ok) { showToast('ยกเลิกเอกสารแล้ว'); load(); onChanged() } else showToast((await r.json()).error || 'ยกเลิกไม่สำเร็จ')
  }

  if (billing == null || pos == null) return <div className="empty">กำลังโหลดเอกสารการเงิน…</div>

  const createBtn = (icon: string, title: string, sub: string, onClick: () => void) => (
    <button type="button" className="fin-create" onClick={onClick}>
      <span className="fin-ic">{icon}</span>
      <span className="fin-tt">{title}</span>
      <span className="fin-ss">{sub}</span>
    </button>
  )

  return (
    <>
      <div className="view-head">
        <div><h1>เอกสารการเงิน</h1><p>สร้างเอกสารทุกใบจากที่เดียว — เลือกลูกค้า/งาน แล้วระบบดึงรายละเอียดที่เชื่อมโยงกันมาให้</p></div>
      </div>

      {editable && (
        <div className="fin-grid">
          {createBtn('📋', 'สร้างใบเสนอราคา', 'เลือกลูกค้าจาก CRM → ตั้งต้นราคาจากพื้นที่×เรต', () => setQuotePicker(true))}
          {createBtn('📄', 'สร้างใบแจ้งหนี้/ใบวางบิล', 'เลือกงาน → เลือกงวดที่จะเก็บเงิน', () => setProjPicker('invoice'))}
          {createBtn('🧾', 'สร้างใบเสร็จรับเงิน / ใบกำกับภาษี', 'เลือกงาน → เลือกงวดที่รับเงิน (ย้อนหลังได้)', () => setProjPicker('receipt'))}
          {createBtn('🛒', 'สร้างใบสั่งซื้อ (PO)', 'สั่งของเข้างานก่อสร้าง หรือของสำนักงาน', () => setPoOpen(true))}
        </div>
      )}

      <div className="tbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ / ลูกค้า / งาน / ร้านค้า…" />
        </div>
        <select value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">ทุกประเภท</option>
          {BILL_KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
          <option value="po">ใบสั่งซื้อ (PO)</option>
        </select>
        <span className="tcount">{commas(list.length)} ใบ</span>
      </div>

      <div className="alist">
        {list.map((d) => {
          const km = d.type === 'po' ? { c: '#8b2fb5', b: '#eeddf7', label: 'ใบสั่งซื้อ (PO)' } : billKindMeta(d.type)
          const cancelled = d.status === 'ยกเลิก'
          return (
            <div className="arow" key={d.type + d.id} style={cancelled ? { opacity: 0.55 } : undefined}>
              <div className="ab" style={{ background: km.c }} />
              <div className="aw">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="an" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{d.code}</span>
                  <span className="qchip" style={{ color: km.c, background: km.b, cursor: 'default' }}>{km.label}</span>
                  {d.status === 'รออนุมัติ' && <span className="qchip" style={{ color: '#b58600', background: '#fbeec0', cursor: 'default' }}>รออนุมัติ</span>}
                  {d.status === 'ตีกลับ' && <span className="qchip" style={{ color: '#b0281c', background: '#f4dbd7', cursor: 'default' }}>ตีกลับ</span>}
                  {cancelled && <span className="qchip" style={{ color: '#b0281c', background: '#f4dbd7', cursor: 'default' }}>ยกเลิก</span>}
                </div>
                <div className="as">
                  {thDate(d.issueDate)} · {d.sub}
                  {d.custName && <> · <CustLink id={d.customerId} name={d.custName} onOpen={onOpenCustomer} /></>}
                </div>
              </div>
              <div className="ad">฿{commas(d.total)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <button className="row-btn" onClick={() => window.open(printUrl(d), '_blank')}>🖨 พิมพ์</button>
                {d.type !== 'po' && <button className="row-btn" onClick={() => setImgDoc(d)}>📝 รายละเอียด{d.imageCount ? ` · 📷 ${d.imageCount}` : ''}</button>}
                {!cancelled && admin && <button className="row-btn" style={{ color: '#b0281c' }} onClick={() => cancelDoc(d)}>ยกเลิก</button>}
              </div>
            </div>
          )
        })}
        {!list.length && <div className="empty">ยังไม่มีเอกสาร — เริ่มจากปุ่มสร้างด้านบน</div>}
      </div>

      {/* เลือกลูกค้า → สร้างใบเสนอราคา (เด้งไปหน้าใบเสนอราคา) */}
      {quotePicker && (
        <CustomerPicker records={records} onClose={() => setQuotePicker(false)}
          onPick={(id) => { setQuotePicker(false); onCreateQuote({ id }) }} />
      )}

      {/* เลือกงาน → ออกใบวางบิล/ใบเสร็จ */}
      {projPicker && (
        <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) setProjPicker(null) }}>
          <div className="modal" role="dialog" aria-modal style={{ maxWidth: 520 }}>
            <div className="modal-h"><div><h3>{projPicker === 'invoice' ? 'สร้างใบแจ้งหนี้/ใบวางบิล' : 'สร้างใบเสร็จรับเงิน'}</h3><div className="sub">เลือกงานก่อสร้าง — งวดเงินของงานจะถูกดึงมาให้เลือก</div></div><button className="modal-x" onClick={() => setProjPicker(null)}>×</button></div>
            <div className="form" style={{ gridTemplateColumns: '1fr' }}>
              <div className="alist" style={{ maxHeight: 400, overflowY: 'auto' }}>
                {projects.map((p) => (
                  <div className="arow" key={p.id} style={{ cursor: 'pointer' }} onClick={() => openBillingFor(p.id, projPicker)}>
                    <div className="ab" style={{ background: 'var(--accent)' }} />
                    <div className="aw">
                      <div className="an">{p.name}</div>
                      <div className="as">
                        {p.code} · {p.customerName ? <CustLink id={p.customerId} name={p.customerName} onOpen={onOpenCustomer} /> : '—'}
                        {' '}· สัญญา ฿{commas(p.contractAmount)}
                      </div>
                    </div>
                    <span className="row-btn">เลือก</span>
                  </div>
                ))}
                {!projects.length && <div className="empty">ยังไม่มีงานก่อสร้างที่เปิดอยู่</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {billingCtx && (
        <BillingModal projectId={billingCtx.projectId} installments={billingCtx.installments} preset={billingCtx.preset}
          onClose={() => setBillingCtx(null)}
          onSaved={(docId) => { setBillingCtx(null); load(); onChanged(); window.open(`/billing/${docId}/print`, '_blank') }}
          showToast={showToast} />
      )}

      {poOpen && (
        <PoModal projects={projects} me={me}
          onClose={() => setPoOpen(false)}
          onSaved={(poId) => { setPoOpen(false); load(); onChanged(); window.open(`/po/${poId}/print`, '_blank') }}
          showToast={showToast} />
      )}
      {imgDoc && (
        <BillDetailModal doc={{ id: imgDoc.id, kind: imgDoc.type, code: imgDoc.code, status: imgDoc.status }}
          editable={editable} onClose={() => setImgDoc(null)} onChanged={load} showToast={showToast} />
      )}
      {/* ปุ่มเปิดดูงานจากรายการยังไม่จำเป็น — เผื่ออนาคต */}
      {void onOpenProject}
    </>
  )
}

/* ---------------- ฟอร์มสร้างใบสั่งซื้อ (PO) ---------------- */
type PoItemRow = { description: string; qty: string; unit: string; unitPrice: string; amount: string }
function PoModal({ projects, me, onClose, onSaved, showToast }: {
  projects: ProjLite[]; me: Me
  onClose: () => void; onSaved: (id: number) => void; showToast: (m: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [projectId, setProjectId] = useState<string>('')
  const [f, setF] = useState({ vendor: '', vendorAddress: '', vendorPhone: '', category: 'material', issueDate: today, deliveryDate: '', note: '' })
  const [items, setItems] = useState<PoItemRow[]>([{ description: '', qty: '', unit: '', unitPrice: '', amount: '' }])
  const [vat, setVat] = useState(false)
  const [wht, setWht] = useState(false)
  const [discount, setDiscount] = useState('')
  // สำเนาบัตรประชาชนผู้ขาย — ต้องมีเมื่อหัก ณ ที่จ่าย เพื่อออกหนังสือรับรอง 50 ทวิ
  const [idCard, setIdCard] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  void me

  const isOffice = projectId === ''
  const cats = isOffice ? OFFICE_CATS : COST_CATS
  const setItem = (i: number, k: keyof PoItemRow, v: string) => setItems((o) => {
    const n = [...o]; n[i] = { ...n[i], [k]: v }
    if (k === 'qty' || k === 'unitPrice') {
      const qty = +n[i].qty, up = +n[i].unitPrice
      if (qty > 0 && up > 0) n[i].amount = String(Math.round(qty * up))
    }
    return n
  })
  const subtotal = items.reduce((a, i) => a + (+i.amount || 0), 0)
  // ลำดับเดียวกับฝั่งเซิร์ฟเวอร์: หักส่วนลดก่อน แล้ว VAT กับหัก ณ ที่จ่ายคิดจากยอดหลังหักส่วนลด
  const disc = Math.min(subtotal, +discount || 0)
  const base = subtotal - disc
  const vatAmount = vat ? Math.round(base * 7 / 100) : 0
  const whtAmount = wht ? Math.round(base * 3 / 100) : 0
  const total = base + vatAmount - whtAmount

  const save = async () => {
    if (!f.vendor.trim()) { showToast('ระบุชื่อร้าน/ผู้ขาย'); return }
    if (!items.some((i) => i.description.trim() && +i.amount > 0)) { showToast('เพิ่มรายการสั่งซื้ออย่างน้อย 1 รายการ'); return }
    setBusy(true)
    const r = await fetch('/api/po', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: projectId === '' ? null : +projectId,
        ...f, vatPct: vat ? 7 : 0, whtPct: wht ? 3 : 0, discount: disc, vendorIdCard: idCard,
        items: items.filter((i) => i.description.trim() && +i.amount > 0).map((i) => ({
          description: i.description, qty: i.qty === '' ? null : +i.qty, unit: i.unit,
          unitPrice: i.unitPrice === '' ? null : +i.unitPrice, amount: +i.amount,
        })),
      }),
    })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { showToast('ออกใบสั่งซื้อ ' + j.code + ' แล้ว'); onSaved(j.id) }
    else showToast(j.error || 'ออก PO ไม่สำเร็จ')
  }

  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ width: 'min(680px,100%)' }}>
        <div className="modal-h"><div><h3>สร้างใบสั่งซื้อ (PO)</h3><div className="sub">สั่งของเข้างานก่อสร้าง (เข้าหมวดงบของงาน) หรือของสำนักงาน</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field"><label>สั่งซื้อสำหรับ</label>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setF((o) => ({ ...o, category: e.target.value === '' ? 'salary' : 'material' })) }}>
              <option value="">🏢 สำนักงาน</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div className="field"><label>หมวด</label>
            <select value={f.category} onChange={(e) => setF((o) => ({ ...o, category: e.target.value }))}>
              {cats.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
          </div>
          <div className="field full"><label>ร้าน / ผู้ขาย *</label><input value={f.vendor} onChange={(e) => setF((o) => ({ ...o, vendor: e.target.value }))} autoFocus /></div>
          <div className="field"><label>ที่อยู่ร้าน</label><input value={f.vendorAddress} onChange={(e) => setF((o) => ({ ...o, vendorAddress: e.target.value }))} /></div>
          <div className="field"><label>เบอร์โทรร้าน</label><input value={f.vendorPhone} onChange={(e) => setF((o) => ({ ...o, vendorPhone: e.target.value }))} /></div>
          <div className="field"><label>วันที่สั่งซื้อ</label><input type="date" value={f.issueDate} onChange={(e) => setF((o) => ({ ...o, issueDate: e.target.value }))} /></div>
          <div className="field"><label>กำหนดส่งของ</label><input type="date" value={f.deliveryDate} onChange={(e) => setF((o) => ({ ...o, deliveryDate: e.target.value }))} /></div>

          <div className="fs"><div className="fs-t">รายการสั่งซื้อ</div></div>
          <div className="field full">
            <div className="qitems">
              <div className="qi-h" style={{ gridTemplateColumns: '22px 1fr 64px 56px 88px 100px 24px' }}><span /><span>รายการ</span><span>จำนวน</span><span>หน่วย</span><span>ราคา/หน่วย</span><span>รวม (บาท)</span><span /></div>
              {items.map((it, i) => (
                <div className="qi-r" key={i} style={{ gridTemplateColumns: '22px 1fr 64px 56px 88px 100px 24px' }}>
                  <span className="qi-n">{i + 1}</span>
                  <input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="เช่น เหล็ก H-Beam 200×200" />
                  <input type="number" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                  <input value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="ท่อน" />
                  <input type="number" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} />
                  <input inputMode="numeric" value={fmtC(it.amount)} onChange={(e) => setItem(i, 'amount', stripC(e.target.value))} />
                  <button type="button" className="qi-x" onClick={() => setItems((o) => o.filter((_, x) => x !== i))}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-sm" style={{ marginTop: 6, alignSelf: 'flex-start' }} onClick={() => setItems((o) => [...o, { description: '', qty: '', unit: '', unitPrice: '', amount: '' }])}>+ เพิ่มรายการ</button>
            </div>
          </div>

          <div className="field">
            <label>ส่วนลด (บาท)</label>
            <input inputMode="numeric" value={fmtC(discount)} onChange={(e) => setDiscount(stripC(e.target.value))} placeholder="0" />
            {disc > 0 && disc < +discount && <div className="err">ส่วนลดเกินรวมเงิน — ใช้ได้สูงสุด ฿{commas(subtotal)}</div>}
          </div>
          <div className="field">
            <label>ภาษี</label>
            {/* .field label ถูกจัดเป็นบล็อกหัวช่อง ช่องติ๊กจึงต้องเป็น span ไม่งั้นข้อความจะโดนดันไปคนละบรรทัดกับกล่อง */}
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', minHeight: 38 }}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => setVat((v) => !v)}>
                <input type="checkbox" checked={vat} readOnly />VAT 7%
              </span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => setWht((v) => !v)}>
                <input type="checkbox" checked={wht} readOnly />หัก ณ ที่จ่าย 3%
              </span>
            </div>
          </div>

          <div className="field full">
            <label>สำเนาบัตรประชาชนผู้ขาย</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {idCard ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={idCard} alt="บัตรประชาชนผู้ขาย" style={{ width: 160, height: 100, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border)' }} />
                  <button type="button" className="btn btn-sm" onClick={() => pickImage(setIdCard, showToast)}>เปลี่ยนรูป</button>
                  <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }} onClick={() => setIdCard(null)}>เอาออก</button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => pickImage(setIdCard, showToast)}>📷 แนบรูปบัตรประชาชน</button>
              )}
            </div>
            <div className="hintline">
              {wht
                ? 'ผู้ขายที่เป็นบุคคลธรรมดาต้องใช้เลขบัตรและที่อยู่ตามบัตรออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — แนบไว้ที่นี่จะพิมพ์เป็นหน้าแนบท้าย PO ให้ · ผู้ขายที่เป็นบริษัทไม่ต้องแนบ'
                : 'ไม่บังคับ — แนบไว้ถ้าผู้ขายเป็นบุคคลธรรมดาที่ต้องหัก ณ ที่จ่าย จะได้ไม่ต้องตามขอทีหลัง'}
            </div>
          </div>
          <div className="field full"><label>หมายเหตุ / เงื่อนไข</label><input value={f.note} onChange={(e) => setF((o) => ({ ...o, note: e.target.value }))} placeholder="เช่น ส่งของหน้างาน, เครดิต 30 วัน" /></div>
          <div className="field full">
            <div className="sumbox">
              <div><span>รวมเงิน</span><b>฿{commas(subtotal)}</b></div>
              {disc > 0 && <div><span>ส่วนลด</span><b style={{ color: '#b0281c' }}>−฿{commas(disc)}</b></div>}
              {disc > 0 && <div><span>หลังหักส่วนลด</span><b>฿{commas(base)}</b></div>}
              {vat && <div><span>VAT 7%</span><b>฿{commas(vatAmount)}</b></div>}
              {wht && <div><span>หัก ณ ที่จ่าย 3%</span><b style={{ color: '#b0281c' }}>−฿{commas(whtAmount)}</b></div>}
              <div className="grand"><span>ยอดจ่ายสุทธิ</span><b>฿{commas(total)}</b></div>
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังออก PO…' : 'ออกใบสั่งซื้อ + พิมพ์'}</button>
        </div>
      </div>
    </div>
  )
}
