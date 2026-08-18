'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUS, BU_NAMES, COST_CATS, costCatMeta, projMeta, expMeta, instWorkMeta, instPayMeta,
  INST_WORK, INST_PAY, PROJECT_STATUSES, BILL_KINDS, billKindMeta, PAY_METHODS, canEdit, isAdminUp, type Role,
} from '@/lib/constants'
import { commas, fmtB, thDate } from '@/lib/format'
import { bizGroupedBars, bizProjectBars, bizSCurve, cumulative, pickImage, type ProjectRow, type ExpenseRow, type InstRow, type HistItem } from './biz-shared'

type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }
type Cust = { id: number; code: string; bu: string; name: string | null; chname: string | null; province: string | null; status: string; shownVal: number | null; d: string | null; isFinal: boolean }
const Svg = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />

/* ช่องจำนวนเงินแบบมี , คั่นหลักพัน (เก็บค่าจริงเป็นเลขล้วน) */
const stripC = (s: string) => s.replace(/[^\d]/g, '')
const fmtC = (s: string) => (s ? Number(s).toLocaleString('en-US') : '')

/* ================= รายการงานก่อสร้าง + ภาพรวมบริษัท ================= */
export default function ProjectsView({ me, records, limitedData, showToast, onChanged, openProjectId, onOpenedProject }: {
  me: Me; records: Cust[]; limitedData?: boolean; showToast: (m: string) => void; onChanged: () => void
  openProjectId: number | null; onOpenedProject: () => void
}) {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [fStat, setFStat] = useState(''); const [fBu, setFBu] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/projects', { cache: 'no-store' })
    if (r.ok) setProjects((await r.json()).projects)
    else showToast('โหลดรายการงานไม่สำเร็จ')
  }, [showToast])
  useEffect(() => { load() }, [load])
  // เปิดงานที่ส่งต่อมาจากหน้าใบเสนอราคา (หลังกด "เปิดงานก่อสร้าง")
  useEffect(() => { if (openProjectId != null) { setOpenId(openProjectId); onOpenedProject() } }, [openProjectId, onOpenedProject])

  const list = useMemo(() => (projects || []).filter((p) => (!fStat || p.status === fStat) && (!fBu || p.bu === fBu)), [projects, fStat, fBu])

  if (!projects) return <div className="empty">กำลังโหลดงานก่อสร้าง…</div>

  const active = projects.filter((p) => p.status !== 'ปิดงาน')
  const contractSum = projects.reduce((a, p) => a + p.contractAmount, 0)
  const receivedSum = projects.reduce((a, p) => a + p.received, 0)
  const spentSum = projects.reduce((a, p) => a + p.spent, 0)

  return (
    <>
      <div className="view-head">
        <div><h1>งานก่อสร้าง &amp; Budget Control</h1><p>เปิดงานจากใบเสนอราคาที่ลูกค้าตกลง — คุมงบ 6 หมวด บันทึกรายจ่าย เก็บเงินตามงวด</p></div>
        <span className="head-ctrl">
          <select value={fStat} onChange={(e) => setFStat(e.target.value)}><option value="">ทุกสถานะ</option>{PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={fBu} onChange={(e) => setFBu(e.target.value)}><option value="">ทุก BU</option>{BUS.map((b) => <option key={b} value={b}>{BU_NAMES[b]}</option>)}</select>
          {isAdminUp(me.role) && <button className="btn btn-primary" onClick={() => setNewOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>เปิดงานใหม่</button>}
        </span>
      </div>

      <div className="kpis">
        <Tile rail="var(--accent)" lab="งานทั้งหมด" big={String(projects.length)} unit={`งาน (กำลังทำ ${active.length})`} foot={`มูลค่าสัญญารวม ฿${fmtB(contractSum)}`} />
        <Tile rail="#2563c9" lab="รับเงินแล้วรวม" big={fmtB(receivedSum)} unit="บาท" foot={contractSum ? `${(receivedSum / contractSum * 100).toFixed(1)}% ของมูลค่าสัญญา` : '—'} />
        <Tile rail="#c2610a" lab="จ่ายแล้วรวม (อนุมัติ)" big={fmtB(spentSum)} unit="บาท" foot={`ค้างอนุมัติ ฿${fmtB(projects.reduce((a, p) => a + p.pendingAmount, 0))}`} />
        <Tile rail="#3f8f3a" lab="กำไรรับ−จ่าย รวม" big={fmtB(receivedSum - spentSum)} unit="บาท" foot="เฉพาะเงินเข้า-ออกจริง" />
      </div>

      {list.length > 0 && <BudgetOverviewChart projects={list} />}

      <div className="alist">
        {list.map((p) => {
          const pm = projMeta(p.status)
          const recPct = p.contractAmount > 0 ? p.received / p.contractAmount * 100 : 0
          const spendPct = p.budgetTotal > 0 ? p.spent / p.budgetTotal * 100 : 0
          const spendCol = spendPct > 100 ? '#b0281c' : spendPct >= 80 ? '#b58600' : '#3f8f3a'
          return (
            <div className="arow" key={p.id} style={{ cursor: 'pointer', alignItems: 'stretch' }} onClick={() => setOpenId(p.id)}>
              <div className="ab" style={{ background: pm.c }} />
              <div className="aw" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="an">{p.name}</span>
                  <span className="qchip" style={{ color: pm.c, background: pm.b, cursor: 'default' }}>{pm.k}</span>
                  {p.pendingCount > 0 && <span className="qchip" style={{ color: '#b58600', background: '#fbeec0', cursor: 'default' }}>รออนุมัติ {p.pendingCount}</span>}
                </div>
                <div className="as">{p.code} · {p.customerName || '—'} · {BU_NAMES[p.bu as keyof typeof BU_NAMES] || p.bu} · สัญญา ฿{commas(p.contractAmount)}{p.dueDate ? ' · กำหนดเสร็จ ' + thDate(p.dueDate) : ''}</div>
                <div className="pj-bars">
                  <div className="pj-bar"><span>รับเงิน {recPct.toFixed(0)}%</span><div className="prog"><i style={{ width: Math.min(100, recPct) + '%', background: '#2563c9' }} /></div><b>฿{fmtB(p.received)}</b></div>
                  <div className="pj-bar"><span>ใช้งบ {p.budgetTotal ? spendPct.toFixed(0) + '%' : '—'}</span><div className="prog"><i style={{ width: Math.min(100, spendPct) + '%', background: spendCol }} /></div><b>฿{fmtB(p.spent)}</b></div>
                  <div className="pj-bar"><span>งวดงาน {p.instDone}/{p.instTotal}</span><div className="prog"><i style={{ width: (p.instTotal ? p.instDone / p.instTotal * 100 : 0) + '%', background: '#8b2fb5' }} /></div><b>{p.instTotal ? Math.round(p.instDone / p.instTotal * 100) + '%' : '—'}</b></div>
                </div>
              </div>
              <button className="row-btn" style={{ alignSelf: 'center' }} onClick={(e) => { e.stopPropagation(); setOpenId(p.id) }}>จัดการ</button>
            </div>
          )
        })}
        {!list.length && <div className="empty">ยังไม่มีงานก่อสร้าง — เปิดจากใบเสนอราคาที่สถานะ &quot;ลูกค้าตกลง&quot;</div>}
      </div>

      {/* ---- ภาพรวมบริษัท ---- */}
      {projects.length > 0 && (
        <div className="grid g-2 mt">
          <section className="card">
            <div className="card-h"><h2>กำไรต่องาน (รับเงินจริง − จ่ายจริง)</h2><span className="hint">บาท</span></div>
            <div className="rlist">
              {[...projects].sort((a, b) => b.profit - a.profit).slice(0, 12).map((p) => {
                const mx = Math.max(1, ...projects.map((x) => Math.abs(x.profit)))
                return (
                  <div className="rrow" key={p.id}>
                    <div className="rn" title={p.name}>{p.name}</div>
                    <div className="rtrack"><div className="rfill" style={{ width: (Math.abs(p.profit) / mx * 100) + '%', background: p.profit >= 0 ? 'linear-gradient(90deg,#3f8f3a,#3f8f3a88)' : 'linear-gradient(90deg,#b0281c,#b0281c88)' }} /></div>
                    <div className="rval" style={{ color: p.profit >= 0 ? '#3f8f3a' : '#b0281c' }}>{p.profit < 0 ? '−' : ''}฿{fmtB(Math.abs(p.profit))}</div>
                  </div>
                )
              })}
            </div>
          </section>
          <CompanyCostBreakdown projects={projects} />
        </div>
      )}

      {newOpen && (
        <NewProjectModal records={records} limitedData={limitedData} showToast={showToast}
          onClose={() => setNewOpen(false)}
          onCreated={(pid) => { setNewOpen(false); load(); onChanged(); setOpenId(pid) }} />
      )}
      {openId != null && <ProjectModal id={openId} me={me} showToast={showToast} onClose={() => setOpenId(null)} onChanged={() => { load(); onChanged() }} />}
    </>
  )
}

/* ---------------- เปิดงานตรงจากลูกค้า (ไม่มีใบเสนอราคา) ---------------- */
function NewProjectModal({ records, limitedData, onClose, onCreated, showToast }: {
  records: Cust[]; limitedData?: boolean; onClose: () => void; onCreated: (id: number) => void; showToast: (m: string) => void
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Cust | null>(null)
  const [name, setName] = useState('')
  const [contract, setContract] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return records
      .filter((r) => !ql || `${r.name || ''} ${r.chname || ''} ${r.code}`.toLowerCase().includes(ql))
      // ลูกค้าที่ปิดการขายแล้วขึ้นก่อน (กลุ่มเป้าหมายหลักของการเปิดงานตรง)
      .sort((a, b) => (Number(b.isFinal) - Number(a.isFinal)) || ((b.d || '') < (a.d || '') ? -1 : 1))
      .slice(0, 50)
  }, [records, q])

  const pick = (r: Cust) => {
    setPicked(r)
    setName(r.name || r.chname || r.code)
    setContract(r.shownVal != null ? String(r.shownVal) : '')
  }
  const save = async () => {
    if (!picked) return
    if (!(+contract > 0)) { showToast('ระบุมูลค่าสัญญา'); return }
    setBusy(true)
    const r = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerId: picked.id, name, contractAmount: +contract, startDate }) })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { showToast('เปิดงาน ' + j.code + ' แล้ว — ตั้งงบในแท็บงบประมาณ และกดใช้แม่แบบงวดได้เลย'); onCreated(j.id) }
    else showToast(j.error || 'เปิดงานไม่สำเร็จ')
  }

  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 540 }}>
        <div className="modal-h"><div><h3>เปิดงานใหม่ (ไม่มีใบเสนอราคา)</h3><div className="sub">สำหรับงานที่ปิดการขายไปแล้ว — งบและงวดเงินเริ่มว่าง ไปตั้งต่อในหน้างานได้</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form" style={{ gridTemplateColumns: '1fr' }}>
          {!picked ? (
            <>
              <div className="search" style={{ minWidth: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาลูกค้า…" autoFocus />
              </div>
              <div className="alist" style={{ maxHeight: 360, overflowY: 'auto' }}>
                {list.map((r) => (
                  <div className="arow" key={r.id} style={{ cursor: 'pointer' }} onClick={() => pick(r)}>
                    <div className="ab" style={{ background: r.isFinal ? '#3f8f3a' : 'var(--text-faint)' }} />
                    <div className="aw">
                      <div className="an">{r.name || r.chname || r.code}</div>
                      <div className="as">{r.code} · {r.status}{r.shownVal ? ` · ฿${commas(r.shownVal)}` : ''}</div>
                    </div>
                    <span className="row-btn">เลือก</span>
                  </div>
                ))}
              </div>
              {limitedData && <div className="hintline">แสดงเฉพาะลูกค้า 3 เดือนล่าสุด — งานเก่าหาไม่เจอ ให้กดปุ่ม &quot;📅 3 เดือนล่าสุด&quot; ที่แถบบนเพื่อสลับเป็นข้อมูลทั้งหมด</div>}
            </>
          ) : (
            <>
              <div className="field full"><label>ลูกค้า</label><input readOnly value={`${picked.name || picked.chname || picked.code} (${picked.code})`} /></div>
              <div className="field full"><label>ชื่องาน *</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="field full"><label>มูลค่าสัญญา (บาท) *</label><input type="number" value={contract} onChange={(e) => setContract(e.target.value)} /><div className="hintline">ดึงจากมูลค่าในระบบ CRM — แก้ให้ตรงสัญญาจริงได้</div></div>
              <div className="field full"><label>วันเริ่มงาน</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            </>
          )}
        </div>
        <div className="modal-f">
          {picked && <button className="btn" style={{ marginRight: 'auto' }} onClick={() => setPicked(null)}>← เปลี่ยนลูกค้า</button>}
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          {picked && <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังเปิดงาน…' : '🏗 เปิดงาน'}</button>}
        </div>
      </div>
    </div>
  )
}

/**
 * ภาพรวม Budget Control — กราฟแท่ง 4 ชุด (สัญญา/รับแล้ว/จ่ายแล้ว/กำไร) ต่อโปรเจค
 * เรียงแยกตาม BU (เส้นประคั่นเมื่อเปลี่ยน BU) และช่องสุดท้ายเป็นยอดรวม
 */
function BudgetOverviewChart({ projects }: { projects: ProjectRow[] }) {
  const sorted = [...projects].sort((a, b) => (a.bu < b.bu ? -1 : a.bu > b.bu ? 1 : a.id - b.id))
  const short = (s: string) => (s.length > 9 ? s.slice(0, 8) + '…' : s)
  const groups = [
    ...sorted.map((p, i) => ({ label: short(p.name), sub: p.bu, divider: i > 0 && sorted[i - 1].bu !== p.bu })),
    { label: 'รวม', sub: `${sorted.length} งาน`, divider: true, emph: true },
  ]
  const sum = (f: (p: ProjectRow) => number) => sorted.reduce((a, p) => a + f(p), 0)
  const series = [
    { name: 'มูลค่าสัญญา', color: 'var(--pending, #9c9093)', vals: [...sorted.map((p) => p.contractAmount), sum((p) => p.contractAmount)] },
    { name: 'รับเงินแล้ว', color: '#2563c9', vals: [...sorted.map((p) => p.received), sum((p) => p.received)] },
    { name: 'จ่ายแล้วรวม', color: '#c2610a', vals: [...sorted.map((p) => p.spent), sum((p) => p.spent)] },
    { name: 'กำไรรับ−จ่าย', color: '#3f8f3a', vals: [...sorted.map((p) => p.profit), sum((p) => p.profit)] },
  ]
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-h"><h2>ภาพรวม Budget Control — ทุกโปรเจค</h2><span className="hint">บาท · ชี้ที่แท่งเพื่อดูตัวเลขเต็ม</span></div>
      <p className="card-desc">แท่งละโปรเจค เรียงแยกตาม BU · ช่องขวาสุด = ยอดรวม · กำไรติดลบแสดงเป็นแท่งแดงใต้เส้นศูนย์</p>
      <div className="chart-xscroll"><Svg html={bizProjectBars(groups, series)} /></div>
      <div className="legend">
        <span><i style={{ background: 'var(--pending, #9c9093)' }} />มูลค่าสัญญา</span>
        <span><i style={{ background: '#2563c9' }} />รับเงินแล้ว</span>
        <span><i style={{ background: '#c2610a' }} />จ่ายแล้วรวม (อนุมัติ)</span>
        <span><i style={{ background: '#3f8f3a' }} />กำไรรับ−จ่าย</span>
      </div>
    </section>
  )
}

function Tile({ rail, lab, big, unit, foot }: { rail: string; lab: string; big: string; unit?: string; foot: string }) {
  return (
    <div className="tile">
      <div className="rail" style={{ background: rail }} />
      <div className="lab">{lab}</div>
      <div className="big">{big}{unit && <span className="unit">{unit}</span>}</div>
      <div className="foot">{foot}</div>
    </div>
  )
}

/** สัดส่วนต้นทุนรวมทั้งบริษัท รายหมวด — ดึงจากรายละเอียดทุกงาน */
function CompanyCostBreakdown({ projects }: { projects: ProjectRow[] }) {
  const [byCat, setByCat] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    let dead = false
    Promise.all(projects.map((p) => fetch(`/api/projects/${p.id}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))))
      .then((all) => {
        if (dead) return
        const acc: Record<string, number> = {}
        for (const j of all) if (j) for (const e of j.expenses as ExpenseRow[]) if (e.status === 'อนุมัติแล้ว') acc[e.category] = (acc[e.category] || 0) + e.amount
        setByCat(acc)
      })
    return () => { dead = true }
  }, [projects])
  const rows = COST_CATS.map((c) => ({ ...c, v: byCat?.[c.k] || 0 })).filter((r) => r.v > 0)
  const mx = Math.max(1, ...rows.map((r) => r.v))
  return (
    <section className="card">
      <div className="card-h"><h2>ต้นทุนจริงรวมทั้งบริษัท รายหมวด</h2><span className="hint">เฉพาะที่อนุมัติแล้ว</span></div>
      {!byCat ? <div className="empty">กำลังคำนวณ…</div> : !rows.length ? <div className="empty">ยังไม่มีค่าใช้จ่ายที่อนุมัติ</div> : (
        <div className="funnel">
          {rows.sort((a, b) => b.v - a.v).map((r) => (
            <div className="frow" key={r.k}>
              <div className="fn"><i style={{ background: r.c }} /><span>{r.label}</span></div>
              <div className="ftrack"><div className="ffill" style={{ width: (r.v / mx * 100) + '%', background: r.c }} /></div>
              <div className="fc" style={{ minWidth: 74 }}>฿{fmtB(r.v)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ================= หน้างานรายตัว (แท็บ) ================= */
type BillingRow = {
  id: number; kind: string; code: string; invoiceRefId: number | null
  issueDate: string; dueDate: string | null; total: number; subtotal: number
  vatAmount: number; whtAmount: number
  payMethod: string | null; payDate: string | null; status: string; cancelReason: string | null
  createdByName: string | null
}
type Detail = {
  project: {
    id: number; code: string; name: string; bu: string; customerId: number; quotationId: number | null
    contractAmount: number; vatPct: number | null; status: string; startDate: string | null; dueDate: string | null
    closedAt: string | null; closedByName: string | null; ownerId: number | null; ownerName: string | null
    customerName: string | null; customerPhone: string | null
  }
  budgets: { category: string; amount: number }[]
  expenses: ExpenseRow[]
  installments: InstRow[]
  billing: BillingRow[]
  history: HistItem[]
}

export function ProjectModal({ id, me, onClose, onChanged, showToast }: {
  id: number; me: Me; onClose: () => void; onChanged: () => void; showToast: (m: string) => void
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [tab, setTab] = useState<'overview' | 'inst' | 'exp' | 'budget' | 'bill'>('overview')
  const [busy, setBusy] = useState(false)
  const [expOpen, setExpOpen] = useState<ExpenseRow | 'new' | null>(null)
  const [instOpen, setInstOpen] = useState<InstRow | 'new' | null>(null)
  // ฟอร์มออกเอกสารการเงิน — preselect ประเภท/งวด/ใบแจ้งหนี้อ้างอิงจากปุ่มลัด
  const [billOpen, setBillOpen] = useState<{ kind: string; instIds: number[]; invoiceRefId?: number } | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [expCat, setExpCat] = useState(''); const [expStat, setExpStat] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}`, { cache: 'no-store' })
    if (!r.ok) { showToast('โหลดข้อมูลงานไม่สำเร็จ'); onClose(); return }
    setD(await r.json())
  }, [id, onClose, showToast])
  useEffect(() => { load() }, [load])

  const admin = isAdminUp(me.role)
  const editable = !!d && canEdit(me.role) && d.project.status !== 'ปิดงาน'

  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    setBusy(true)
    const r = await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { if (okMsg) showToast(okMsg); await load(); onChanged(); return j }
    showToast(j.error || 'ทำรายการไม่สำเร็จ'); return null
  }

  const close = async () => {
    setBusy(true)
    const r = await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'close' }) })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { showToast('ปิดงานเรียบร้อย 🎉'); await load(); onChanged(); return }
    if (j.canForce) {
      if (window.confirm(j.error + '\n\nยืนยันปิดงานทั้งที่ยังค้าง?')) {
        const r2 = await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'close', force: true }) })
        if (r2.ok) { showToast('ปิดงานเรียบร้อย'); await load(); onChanged() } else showToast((await r2.json()).error || 'ปิดงานไม่สำเร็จ')
      }
    } else showToast(j.error || 'ปิดงานไม่สำเร็จ')
  }

  if (!d) return <div className="modal-bd"><div className="modal" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>กำลังโหลด…</div></div>
  const p = d.project
  const pm = projMeta(p.status)
  const budgetOf = (k: string) => d.budgets.find((b) => b.category === k)?.amount || 0
  const spentOf = (k: string) => d.expenses.filter((e) => e.category === k && e.status === 'อนุมัติแล้ว').reduce((a, e) => a + e.amount, 0)
  const budgetTotal = d.budgets.reduce((a, b) => a + b.amount, 0)
  const spent = d.expenses.filter((e) => e.status === 'อนุมัติแล้ว').reduce((a, e) => a + e.amount, 0)
  const pendingAmt = d.expenses.filter((e) => e.status === 'รออนุมัติ').reduce((a, e) => a + e.amount, 0)
  const received = d.installments.filter((i) => i.payStatus === 'รับเงินแล้ว').reduce((a, i) => a + (i.paidAmount ?? i.amount), 0)

  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ width: 'min(920px,100%)' }}>
        <div className="modal-h">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>{p.name}<span className="qchip" style={{ color: pm.c, background: pm.b, cursor: 'default' }}>{pm.k}</span></h3>
            <div className="sub">{p.code} · {p.customerName || '—'} · {BU_NAMES[p.bu as keyof typeof BU_NAMES] || p.bu} · สัญญา ฿{commas(p.contractAmount)}{p.closedAt ? ` · ปิดงาน ${thDate(p.closedAt)} โดย ${p.closedByName || '—'}` : ''}</div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          {([['overview', 'ภาพรวม & กราฟ'], ['inst', `งวดงาน (${d.installments.length})`], ['exp', `ค่าใช้จ่าย (${d.expenses.length})`], ['bill', `เอกสารเงิน (${d.billing.length})`], ['budget', 'งบประมาณ']] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ================= ภาพรวม ================= */}
        {tab === 'overview' && (
          <div className="form" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field full">
              <div className="pj-kpis">
                <div className="pj-kpi"><span>มูลค่าสัญญา</span><b>฿{commas(p.contractAmount)}</b></div>
                <div className="pj-kpi"><span>รับเงินแล้ว</span><b style={{ color: '#2563c9' }}>฿{commas(received)}</b><small>{p.contractAmount ? (received / p.contractAmount * 100).toFixed(1) + '%' : ''}</small></div>
                <div className="pj-kpi"><span>จ่ายแล้ว (อนุมัติ)</span><b style={{ color: '#c2610a' }}>฿{commas(spent)}</b><small>{budgetTotal ? (spent / budgetTotal * 100).toFixed(1) + '% ของงบ' : 'ยังไม่ตั้งงบ'}</small></div>
                <div className="pj-kpi"><span>กำไร (รับ−จ่าย)</span><b style={{ color: received - spent >= 0 ? '#3f8f3a' : '#b0281c' }}>฿{commas(received - spent)}</b><small>คาดการณ์จบงาน ฿{commas(p.contractAmount - budgetTotal)}</small></div>
              </div>
              {pendingAmt > 0 && <div className="hintline" style={{ marginTop: 6 }}>⚠ มีค่าใช้จ่ายรออนุมัติอีก ฿{commas(pendingAmt)} — ยังไม่นับในยอดจ่ายจนกว่าจะอนุมัติ</div>}
            </div>
            <div className="field">
              <label>งบ vs จ่ายจริง รายหมวด</label>
              <Svg html={bizGroupedBars(
                COST_CATS.map((c) => c.label),
                [
                  { name: 'งบ', color: 'var(--pending, #9c9093)', vals: COST_CATS.map((c) => budgetOf(c.k)) },
                  { name: 'จ่ายจริง', color: 'var(--accent)', vals: COST_CATS.map((c) => spentOf(c.k)) },
                ],
              )} />
              <div className="legend"><span><i style={{ background: 'var(--pending, #9c9093)' }} />งบประมาณ</span><span><i style={{ background: 'var(--accent)' }} />จ่ายจริง (อนุมัติ)</span></div>
            </div>
            <div className="field">
              <label>เส้นสะสม: เงินเข้า vs จ่ายออก</label>
              <Svg html={bizSCurve(
                cumulative(d.installments.filter((i) => i.payStatus === 'รับเงินแล้ว' && i.paidAt).map((i) => ({ d: i.paidAt!, v: i.paidAmount ?? i.amount }))),
                cumulative(d.expenses.filter((e) => e.status === 'อนุมัติแล้ว').map((e) => ({ d: e.expenseDate, v: e.amount }))),
                budgetTotal, p.contractAmount,
              )} />
              <div className="legend"><span><i style={{ background: '#2563c9' }} />เงินรับเข้า</span><span><i style={{ background: 'var(--accent)' }} />จ่ายออก</span><span><i style={{ background: '#b58600' }} />เส้นงบ</span><span><i style={{ background: '#3f8f3a' }} />เส้นสัญญา</span></div>
            </div>
            <div className="field"><label>วันเริ่มงาน</label><input type="date" value={p.startDate || ''} disabled={!editable} onChange={(e) => patch({ startDate: e.target.value })} /></div>
            <div className="field"><label>กำหนดเสร็จ</label><input type="date" value={p.dueDate || ''} disabled={!editable} onChange={(e) => patch({ dueDate: e.target.value })} /></div>
            {p.status !== 'ปิดงาน' && (
              <div className="field"><label>สถานะงาน</label>
                <select value={p.status} disabled={!editable} onChange={(e) => patch({ status: e.target.value }, 'อัปเดตสถานะแล้ว')}>
                  {PROJECT_STATUSES.filter((s) => s !== 'ปิดงาน').map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              {p.status !== 'ปิดงาน' && admin && <button className="btn btn-primary" disabled={busy} onClick={close}>🏁 ปิดงาน (สรุปกำไร + ล็อก)</button>}
              {p.status === 'ปิดงาน' && me.role === 'owner' && <button className="btn" disabled={busy} onClick={() => { if (window.confirm('ปลดล็อกงานที่ปิดแล้ว?')) patch({ action: 'reopen' }, 'ปลดล็อกแล้ว') }}>ปลดล็อกงาน</button>}
            </div>
            {p.status === 'ปิดงาน' && (
              <div className="field full">
                <div className="okbox">งานปิดแล้ว — สรุป: รับเงิน ฿{commas(received)} · ต้นทุนจริง ฿{commas(spent)} · <b>กำไร ฿{commas(received - spent)} ({received > 0 ? ((received - spent) / received * 100).toFixed(1) : 0}%)</b> · ข้อมูลถูกล็อกไม่ให้แก้ไข</div>
              </div>
            )}
            <div className="fs"><div className="fs-t">ประวัติ</div></div>
            <div className="field full">
              {d.history.length === 0 ? <div className="hintline">ยังไม่มีประวัติ</div> : (
                <div className="histlist">{d.history.map((h, i) => (
                  <div className="histrow" key={i}><div className="histdot" /><div className="histbody">
                    <div className="histtext">{projHistText(h)}</div>
                    <div className="histmeta">{h.who} · {new Date(h.at).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  </div></div>
                ))}</div>
              )}
            </div>
          </div>
        )}

        {/* ================= งวดงาน ================= */}
        {tab === 'inst' && (
          <div className="form" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field full" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div className="hintline">รวมงวด ฿{commas(d.installments.reduce((a, i) => a + i.amount, 0))} / สัญญา ฿{commas(p.contractAmount)} · รับแล้ว ฿{commas(received)} — คลิกสถานะเพื่อเปลี่ยน</div>
              {editable && <button className="btn btn-primary btn-sm" onClick={() => setInstOpen('new')}>+ เพิ่มงวด</button>}
            </div>
            {d.installments.map((i) => {
              const wm = instWorkMeta(i.workStatus), pmm = instPayMeta(i.payStatus)
              return (
                <div className="arow" key={i.id} style={{ alignItems: 'flex-start' }}>
                  <div className="ab" style={{ background: pmm.c }} />
                  <div className="aw">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="an">{i.title}</span>
                      <b>฿{commas(i.amount)}</b>
                      {i.percent != null && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>({i.percent}%)</span>}
                    </div>
                    {i.detail && <div className="as" style={{ whiteSpace: 'pre-wrap' }}>{i.detail}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={i.workStatus} disabled={!editable} style={{ color: wm.c }} onChange={async (e) => { await fetch(`/api/installments/${i.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workStatus: e.target.value }) }); load(); onChanged() }}>
                        {INST_WORK.map((s) => <option key={s.k} value={s.k}>งาน: {s.k}</option>)}
                      </select>
                      <select value={i.payStatus} disabled={!editable} style={{ color: pmm.c }} onChange={async (e) => { await fetch(`/api/installments/${i.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payStatus: e.target.value }) }); load(); onChanged() }}>
                        {INST_PAY.map((s) => <option key={s.k} value={s.k}>เงิน: {s.k}</option>)}
                      </select>
                      {i.payStatus === 'รับเงินแล้ว' && (
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                          รับ ฿{commas(i.paidAmount ?? i.amount)}{i.paidAt ? ' · ' + thDate(i.paidAt) : ''}
                        </span>
                      )}
                      {editable && <button className="row-btn" onClick={() => setInstOpen(i)}>แก้ไข</button>}
                      {editable && i.payStatus === 'ยังไม่วางบิล' && <button className="row-btn" style={{ color: '#b58600' }} onClick={() => setBillOpen({ kind: 'invoice', instIds: [i.id] })}>📄 วางบิล</button>}
                      {editable && i.payStatus === 'วางบิลแล้ว' && <button className="row-btn" style={{ color: '#3f8f3a' }} onClick={() => setBillOpen({ kind: 'receipt', instIds: [i.id] })}>🧾 ออกใบเสร็จ</button>}
                    </div>
                  </div>
                </div>
              )
            })}
            {!d.installments.length && (
              <div className="empty">
                งานนี้ยังไม่มีงวดเงิน
                {editable && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-primary btn-sm" disabled={busy}
                      onClick={() => patch({ action: 'seedInstallments' }, 'ตั้งงวดมาตรฐาน 9 งวดแล้ว')}>
                      ใช้แม่แบบ 9 งวด (30/10×6/5/5) จากมูลค่าสัญญา
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= ค่าใช้จ่าย ================= */}
        {tab === 'exp' && (
          <div className="form" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field full" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div className="hintline">อนุมัติแล้ว ฿{commas(spent)} · รออนุมัติ ฿{commas(pendingAmt)} — ยอดเข้างบนับเฉพาะที่อนุมัติแล้ว</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={expCat} onChange={(e) => setExpCat(e.target.value)}><option value="">ทุกหมวด</option>{COST_CATS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}</select>
                <select value={expStat} onChange={(e) => setExpStat(e.target.value)}><option value="">ทุกสถานะ</option>{['รออนุมัติ', 'อนุมัติแล้ว', 'ตีกลับ'].map((s) => <option key={s}>{s}</option>)}</select>
                {editable && <button className="btn btn-primary btn-sm" onClick={() => setExpOpen('new')}>+ บันทึกค่าใช้จ่าย</button>}
              </div>
            </div>
            {d.expenses.filter((e) => (!expCat || e.category === expCat) && (!expStat || e.status === expStat)).map((e) => {
              const em = expMeta(e.status), cm = costCatMeta(e.category)
              const canRowEdit = editable && (admin || (e.createdBy === me.id && e.status !== 'อนุมัติแล้ว'))
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
                    {e.status === 'รออนุมัติ' && admin && d.project.status !== 'ปิดงาน' && (
                      <>
                        <button className="row-btn" style={{ color: '#3f8f3a' }} onClick={async () => { const r = await fetch(`/api/expenses/${e.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }); if (r.ok) { showToast('อนุมัติแล้ว'); load(); onChanged() } }}>✓ อนุมัติ</button>
                        <button className="row-btn" style={{ color: '#b0281c' }} onClick={async () => { const reason = window.prompt('เหตุผลที่ตีกลับ:'); if (reason?.trim()) { const r = await fetch(`/api/expenses/${e.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason }) }); if (r.ok) { showToast('ตีกลับแล้ว'); load(); onChanged() } } }}>ตีกลับ</button>
                      </>
                    )}
                    {canRowEdit && <button className="row-btn" onClick={() => setExpOpen(e)}>แก้ไข</button>}
                  </div>
                </div>
              )
            })}
            {!d.expenses.length && <div className="empty">ยังไม่มีค่าใช้จ่าย — เริ่มบันทึกค่าวัสดุ ค่าแรง ได้เลย</div>}
          </div>
        )}

        {/* ================= เอกสารเงิน ================= */}
        {tab === 'bill' && (
          <div className="form" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field full" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div className="hintline">ใบแจ้งหนี้/ใบเสร็จออกจากงวดของงาน — สถานะเงินของงวดอัปเดตให้อัตโนมัติ · เอกสารยกเลิกได้แต่ลบไม่ได้ (เลขรันต่อเนื่อง)</div>
              {editable && <button className="btn btn-primary btn-sm" onClick={() => setBillOpen({ kind: 'invoice', instIds: [] })}>+ ออกเอกสาร</button>}
            </div>
            {d.billing.map((doc) => {
              const km = billKindMeta(doc.kind)
              const cancelled = doc.status === 'ยกเลิก'
              return (
                <div className="arow" key={doc.id} style={cancelled ? { opacity: 0.55 } : undefined}>
                  <div className="ab" style={{ background: km.c }} />
                  <div className="aw">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="an" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{doc.code}</span>
                      <span className="qchip" style={{ color: km.c, background: km.b, cursor: 'default' }}>{km.label}</span>
                      {cancelled && <span className="qchip" style={{ color: '#b0281c', background: '#f4dbd7', cursor: 'default' }}>ยกเลิก</span>}
                    </div>
                    <div className="as">
                      {thDate(doc.issueDate)}
                      {doc.kind === 'invoice' && doc.dueDate ? ` · ครบกำหนด ${thDate(doc.dueDate)}` : ''}
                      {doc.kind !== 'invoice' && doc.payDate ? ` · รับเงิน ${thDate(doc.payDate)}${doc.payMethod ? ' (' + doc.payMethod + ')' : ''}` : ''}
                      {doc.whtAmount > 0 ? ` · หัก ณ ที่จ่าย ฿${commas(doc.whtAmount)}` : ''}
                      {doc.vatAmount > 0 ? ` · VAT ฿${commas(doc.vatAmount)}` : ''}
                      {' · โดย ' + (doc.createdByName || '—')}
                      {cancelled && doc.cancelReason ? ` · เหตุผล: ${doc.cancelReason}` : ''}
                    </div>
                  </div>
                  <div className="ad">฿{commas(doc.total)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <button className="row-btn" onClick={() => window.open(`/billing/${doc.id}/print`, '_blank')}>🖨 พิมพ์</button>
                    {!cancelled && doc.kind === 'invoice' && editable && (
                      <button className="row-btn" style={{ color: '#3f8f3a' }}
                        onClick={() => setBillOpen({ kind: 'receipt', instIds: d.installments.filter((i) => i.payStatus === 'วางบิลแล้ว').map((i) => i.id), invoiceRefId: doc.id })}>
                        ออกใบเสร็จ
                      </button>
                    )}
                    {!cancelled && admin && d.project.status !== 'ปิดงาน' && (
                      <button className="row-btn" style={{ color: '#b0281c' }}
                        onClick={async () => {
                          const reason = window.prompt(`ยกเลิก ${doc.code}?\nระบุเหตุผล:`)
                          if (!reason?.trim()) return
                          const r = await fetch(`/api/billing/${doc.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', reason }) })
                          if (r.ok) { showToast('ยกเลิกเอกสารแล้ว'); load(); onChanged() } else showToast((await r.json()).error || 'ยกเลิกไม่สำเร็จ')
                        }}>
                        ยกเลิก
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {!d.billing.length && <div className="empty">ยังไม่มีเอกสาร — กด &quot;วางบิล&quot; จากงวดในแท็บงวดงาน หรือ &quot;+ ออกเอกสาร&quot;</div>}
          </div>
        )}

        {/* ================= งบประมาณ ================= */}
        {tab === 'budget' && (
          <BudgetTab d={d} admin={admin} editable={editable} busy={busy}
            onSave={(budgets) => patch({ budgets }, 'บันทึกงบประมาณแล้ว')} />
        )}

        <div className="modal-f"><button className="btn" onClick={onClose}>ปิด</button></div>

        {expOpen && (
          <ExpenseModal projectId={id} exp={expOpen === 'new' ? null : expOpen} admin={admin}
            budgetInfo={(cat) => ({ budget: budgetOf(cat), spent: spentOf(cat) })}
            onClose={() => setExpOpen(null)}
            onSaved={() => { setExpOpen(null); load(); onChanged() }} showToast={showToast} />
        )}
        {instOpen && (
          <InstallmentModal projectId={id} contract={p.contractAmount} inst={instOpen === 'new' ? null : instOpen}
            onClose={() => setInstOpen(null)}
            onSaved={() => { setInstOpen(null); load(); onChanged() }} showToast={showToast} />
        )}
        {billOpen && (
          <BillingModal projectId={id} installments={d.installments} preset={billOpen}
            onClose={() => setBillOpen(null)}
            onSaved={(docId) => { setBillOpen(null); load(); onChanged(); window.open(`/billing/${docId}/print`, '_blank') }}
            showToast={showToast} />
        )}
        {lightbox && (
          <div className="modal-bd" style={{ zIndex: 90, cursor: 'zoom-out' }} onClick={() => setLightbox(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 12 }} />
          </div>
        )}
      </div>
    </div>
  )
}

function projHistText(h: HistItem): string {
  const map: Record<string, string> = {
    'project-open': 'เปิดงานก่อสร้าง', 'project-close': 'ปิดงาน 🏁', 'project-reopen': 'ปลดล็อกงาน',
    'project-status': 'เปลี่ยนสถานะ', 'project-edit': 'แก้ไขข้อมูล', 'budget-edit': 'ตั้ง/แก้งบประมาณ',
    'expense-create': 'บันทึกค่าใช้จ่าย', 'expense-approve': 'อนุมัติค่าใช้จ่าย ✓', 'expense-reject': 'ตีกลับค่าใช้จ่าย',
    'expense-edit': 'แก้ไขค่าใช้จ่าย', 'expense-delete': 'ลบค่าใช้จ่าย', installment: 'อัปเดตงวด',
  }
  const base = map[h.kind] || h.kind
  const parts = [h.field, h.oldValue && h.newValue ? `${h.oldValue} → ${h.newValue}` : h.newValue].filter(Boolean)
  return parts.length ? `${base}: ${parts.join(' · ')}` : base
}

/* ---------------- แท็บงบประมาณ ---------------- */
function BudgetTab({ d, admin, editable, busy, onSave }: {
  d: Detail; admin: boolean; editable: boolean; busy: boolean
  onSave: (budgets: { category: string; amount: number }[]) => void
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(COST_CATS.map((c) => [c.k, String(d.budgets.find((b) => b.category === c.k)?.amount || '')])),
  )
  const spentOf = (k: string) => d.expenses.filter((e) => e.category === k && e.status === 'อนุมัติแล้ว').reduce((a, e) => a + e.amount, 0)
  const pendingOf = (k: string) => d.expenses.filter((e) => e.category === k && e.status === 'รออนุมัติ').reduce((a, e) => a + e.amount, 0)
  const total = COST_CATS.reduce((a, c) => a + (+vals[c.k] || 0), 0)
  const spentTotal = COST_CATS.reduce((a, c) => a + spentOf(c.k), 0)
  return (
    <div className="form" style={{ gridTemplateColumns: '1fr' }}>
      <div className="field full"><div className="hintline">งบตั้งต้นมาจากประมาณการต้นทุนในใบเสนอราคา — เขียว &lt;80% · เหลือง 80–100% · แดงเกินงบ{admin ? '' : ' · แก้งบได้เฉพาะเจ้าของ/ผู้ดูแลระบบ'}</div></div>
      {COST_CATS.map((c) => {
        const bud = +vals[c.k] || 0, sp = spentOf(c.k), pd = pendingOf(c.k)
        const pct = bud > 0 ? sp / bud * 100 : 0
        const col = bud === 0 ? 'var(--text-faint)' : pct > 100 ? '#b0281c' : pct >= 80 ? '#b58600' : '#3f8f3a'
        return (
          <div className="budrow" key={c.k}>
            <div className="bud-l"><i style={{ background: c.c }} />{c.label}</div>
            <div className="bud-mid">
              <div className="prog"><i style={{ width: Math.min(100, pct) + '%', background: col }} /></div>
              <div className="bud-nums">
                <span style={{ color: col, fontWeight: 700 }}>จ่าย ฿{commas(sp)}{bud > 0 ? ` (${pct.toFixed(0)}%)` : ''}</span>
                {pd > 0 && <span style={{ color: '#b58600' }}> · รออนุมัติ ฿{commas(pd)}</span>}
                {bud > 0 && sp > bud && <b style={{ color: '#b0281c' }}> · เกินงบ ฿{commas(sp - bud)}!</b>}
              </div>
            </div>
            <input type="number" value={vals[c.k]} disabled={!admin || !editable} placeholder="งบ (บาท)"
              onChange={(e) => setVals((o) => ({ ...o, [c.k]: e.target.value }))}
              style={{ width: 130, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, textAlign: 'right' }} />
          </div>
        )
      })}
      <div className="field full">
        <div className="sumbox">
          <div><span>งบรวม</span><b>฿{commas(total)}</b></div>
          <div><span>จ่ายแล้วรวม</span><b style={{ color: spentTotal > total && total > 0 ? '#b0281c' : 'inherit' }}>฿{commas(spentTotal)}</b></div>
          <div className="grand"><span>คงเหลือ</span><b style={{ color: total - spentTotal >= 0 ? '#3f8f3a' : '#b0281c' }}>฿{commas(total - spentTotal)}</b></div>
        </div>
      </div>
      {admin && editable && (
        <div className="field full" style={{ alignItems: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => onSave(COST_CATS.map((c) => ({ category: c.k, amount: +vals[c.k] || 0 })))}>{busy ? 'กำลังบันทึก…' : 'บันทึกงบประมาณ'}</button>
        </div>
      )}
    </div>
  )
}

/* ---------------- ฟอร์มบันทึก/แก้ไขค่าใช้จ่าย ---------------- */
function ExpenseModal({ projectId, exp, admin, budgetInfo, onClose, onSaved, showToast }: {
  projectId: number; exp: ExpenseRow | null; admin: boolean
  budgetInfo: (cat: string) => { budget: number; spent: number }
  onClose: () => void; onSaved: () => void; showToast: (m: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    category: exp?.category || 'material', description: exp?.description || '', vendor: exp?.vendor || '',
    amount: exp ? String(exp.amount) : '', expenseDate: exp?.expenseDate || today,
  })
  const [receipt, setReceipt] = useState<string | null>(exp?.receiptUrl || null)
  const [busy, setBusy] = useState(false)

  // เตือนทันทีตอนกรอก ถ้ารายการนี้จะทำให้หมวดเกินงบ (ไม่บล็อก — ขึ้นธงแดงให้คนอนุมัติเห็น)
  const bi = budgetInfo(f.category)
  const amt = +f.amount || 0
  // ถ้าแก้รายการที่อนุมัติแล้วในหมวดเดิม ยอดเดิมถูกนับใน spent อยู่แล้ว — หักออกก่อนเทียบ
  const prevCounted = exp && exp.status === 'อนุมัติแล้ว' && exp.category === f.category ? exp.amount : 0
  const willBe = bi.spent - prevCounted + amt
  const overBudget = bi.budget > 0 && amt > 0 && willBe > bi.budget

  const save = async () => {
    if (!f.description.trim()) { showToast('ระบุรายละเอียดค่าใช้จ่าย'); return }
    if (!(+f.amount > 0)) { showToast('จำนวนเงินต้องมากกว่า 0'); return }
    setBusy(true)
    const body = { ...f, amount: +f.amount, receiptUrl: receipt }
    const r = exp
      ? await fetch(`/api/expenses/${exp.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(`/api/projects/${projectId}/expenses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) {
      const j = await r.json()
      showToast(exp ? 'แก้ไขแล้ว' : j.status === 'อนุมัติแล้ว' ? 'บันทึกแล้ว (อนุมัติทันที)' : 'บันทึกแล้ว — เข้าคิวรออนุมัติ')
      onSaved()
    } else showToast((await r.json()).error || 'บันทึกไม่สำเร็จ')
  }
  const del = async () => {
    if (!exp || !window.confirm('ลบรายการค่าใช้จ่ายนี้?')) return
    const r = await fetch(`/api/expenses/${exp.id}`, { method: 'DELETE' })
    if (r.ok) { showToast('ลบแล้ว'); onSaved() } else showToast((await r.json()).error || 'ลบไม่สำเร็จ')
  }

  return (
    <div className="modal-bd" style={{ zIndex: 80 }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 500 }}>
        <div className="modal-h"><div><h3>{exp ? 'แก้ไขค่าใช้จ่าย' : 'บันทึกค่าใช้จ่าย'}</h3><div className="sub">{admin ? 'สิทธิ์คุณอนุมัติทันที' : 'รายการจะเข้าคิวรออนุมัติจากเจ้าของ/ผู้ดูแลระบบ'}</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field"><label>หมวด *</label>
            <select value={f.category} onChange={(e) => setF((o) => ({ ...o, category: e.target.value }))}>
              {COST_CATS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
          </div>
          <div className="field"><label>วันที่จ่าย *</label><input type="date" value={f.expenseDate} max={today} onChange={(e) => setF((o) => ({ ...o, expenseDate: e.target.value }))} /></div>
          <div className="field full"><label>รายละเอียด *</label><input value={f.description} onChange={(e) => setF((o) => ({ ...o, description: e.target.value }))} placeholder="เช่น เหล็ก H-Beam 20 ท่อน / ค่าแรงทีมเชื่อม งวด 1" autoFocus={!exp} /></div>
          <div className="field"><label>ร้าน / ผู้รับเงิน</label><input value={f.vendor} onChange={(e) => setF((o) => ({ ...o, vendor: e.target.value }))} /></div>
          <div className="field"><label>จำนวนเงิน (บาท) *</label><input type="number" value={f.amount} onChange={(e) => setF((o) => ({ ...o, amount: e.target.value }))} style={overBudget ? { outline: '2px solid #b0281c' } : undefined} /></div>
          {overBudget && (
            <div className="field full">
              <div className="rejbox">⚠ รายการนี้จะทำให้หมวด &quot;{COST_CATS.find((c) => c.k === f.category)?.label}&quot; เกินงบ!
                — งบ ฿{commas(bi.budget)} · ใช้ไปแล้ว ฿{commas(bi.spent - prevCounted)} · บันทึกแล้วจะเป็น ฿{commas(willBe)} (เกิน ฿{commas(willBe - bi.budget)})
                <br />บันทึกได้ตามปกติ แต่ธงแดงนี้จะไปโผล่ให้ผู้อนุมัติเห็น</div>
            </div>
          )}
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

/* ---------------- ฟอร์มเพิ่ม/แก้ไขงวดงาน ---------------- */
function InstallmentModal({ projectId, contract, inst, onClose, onSaved, showToast }: {
  projectId: number; contract: number; inst: InstRow | null
  onClose: () => void; onSaved: () => void; showToast: (m: string) => void
}) {
  const [f, setF] = useState({
    title: inst?.title || '',
    percent: inst?.percent != null ? String(inst.percent) : '',
    amount: inst ? String(Math.round(inst.amount)) : '',
    detail: inst?.detail || '',
    note: inst?.note || '',
    dueDate: inst?.dueDate || '',
  })
  const [busy, setBusy] = useState(false)
  const paid = inst?.payStatus === 'รับเงินแล้ว'

  const setPct = (v: string) => setF((o) => ({ ...o, percent: v, amount: +v > 0 && contract > 0 ? String(Math.round(contract * +v / 100)) : o.amount }))

  const save = async () => {
    if (!f.title.trim()) { showToast('ระบุชื่องวด'); return }
    if (!(+f.amount >= 0) || f.amount === '') { showToast('ระบุจำนวนเงินของงวด'); return }
    setBusy(true)
    const body = { title: f.title, percent: f.percent === '' ? null : +f.percent, amount: +f.amount, detail: f.detail, note: f.note, dueDate: f.dueDate || null }
    const r = inst
      ? await fetch(`/api/installments/${inst.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(`/api/projects/${projectId}/installments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) { showToast(inst ? 'แก้ไขงวดแล้ว' : 'เพิ่มงวดแล้ว'); onSaved() } else showToast((await r.json()).error || 'บันทึกไม่สำเร็จ')
  }
  const del = async () => {
    if (!inst || !window.confirm(`ลบ "${inst.title}" ?`)) return
    const r = await fetch(`/api/installments/${inst.id}`, { method: 'DELETE' })
    if (r.ok) { showToast('ลบงวดแล้ว'); onSaved() } else showToast((await r.json()).error || 'ลบไม่สำเร็จ')
  }

  return (
    <div className="modal-bd" style={{ zIndex: 80 }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 520 }}>
        <div className="modal-h"><div><h3>{inst ? `แก้ไข ${inst.title}` : 'เพิ่มงวดใหม่'}</h3><div className="sub">กรอก % แล้วระบบคำนวณเงินจากมูลค่าสัญญา ฿{commas(contract)} ให้ — หรือกรอกเงินตรงๆ ได้</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field full"><label>ชื่องวด *</label><input value={f.title} onChange={(e) => setF((o) => ({ ...o, title: e.target.value }))} placeholder={`เช่น งวดที่ ${inst?.seq ?? ''}`} autoFocus={!inst} /></div>
          <div className="field"><label>เปอร์เซ็นต์ (%)</label><input type="number" value={f.percent} onChange={(e) => setPct(e.target.value)} placeholder="เช่น 10" /></div>
          <div className="field"><label>จำนวนเงิน (บาท) *</label><input inputMode="numeric" value={fmtC(f.amount)} onChange={(e) => setF((o) => ({ ...o, amount: stripC(e.target.value) }))} /></div>
          <div className="field full"><label>รายละเอียดงานของงวด</label><textarea rows={3} value={f.detail} onChange={(e) => setF((o) => ({ ...o, detail: e.target.value }))} placeholder={'- งานโครงสร้าง... แล้วเสร็จ'} /></div>
          <div className="field"><label>กำหนดส่งงาน</label><input type="date" value={f.dueDate} onChange={(e) => setF((o) => ({ ...o, dueDate: e.target.value }))} /></div>
          <div className="field"><label>หมายเหตุ</label><input value={f.note} onChange={(e) => setF((o) => ({ ...o, note: e.target.value }))} /></div>
          {paid && <div className="field full"><div className="hintline">งวดนี้รับเงินแล้ว — แก้ไขได้แต่ลบไม่ได้ (ต้องเปลี่ยนสถานะเงินกลับก่อนถึงจะลบได้)</div></div>}
        </div>
        <div className="modal-f">
          {inst && !paid && <button className="btn" style={{ color: '#b0281c', marginRight: 'auto' }} onClick={del}>ลบงวดนี้</button>}
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- ฟอร์มออกเอกสารการเงิน (ใบวางบิล/ใบเสร็จ/ใบกำกับภาษี) ---------------- */
export function BillingModal({ projectId, installments, preset, onClose, onSaved, showToast }: {
  projectId: number; installments: InstRow[]
  preset: { kind: string; instIds: number[]; invoiceRefId?: number }
  onClose: () => void; onSaved: (docId: number) => void; showToast: (m: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [kind, setKind] = useState(preset.kind)
  const [sel, setSel] = useState<Set<number>>(new Set(preset.instIds))
  const [extra, setExtra] = useState<{ description: string; amount: string }[]>([])
  const [cust, setCust] = useState({ name: '', address: '', phone: '', taxId: '' })
  const [vat, setVat] = useState(false)
  const [wht, setWht] = useState(false)
  const [f, setF] = useState({ issueDate: today, dueDate: '', payMethod: 'โอนเงิน', payDate: today, payRef: '', note: '' })
  const [busy, setBusy] = useState(false)

  // ดึงข้อมูลลูกค้าตั้งต้นจากใบเสนอราคาของงาน (fallback CRM)
  useEffect(() => {
    fetch(`/api/projects/${projectId}/billing`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.custInfo) setCust(j.custInfo) })
      .catch(() => {})
  }, [projectId])
  // เลือกใบกำกับภาษี → เปิด VAT ให้อัตโนมัติ
  useEffect(() => { if (kind === 'taxReceipt') setVat(true) }, [kind])

  const isInvoice = kind === 'invoice'
  // เลือกได้ทุกงวด (ออกเอกสารย้อนหลังได้) — งวดที่รับเงินแล้วจะไม่ถูกเปลี่ยนสถานะ/วันที่รับเดิม
  const pickable = installments
  const toggle = (id: number) => setSel((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const subtotal = installments.filter((i) => sel.has(i.id)).reduce((a, i) => a + i.amount, 0)
    + extra.reduce((a, i) => a + (+i.amount || 0), 0)
  const vatAmount = vat ? Math.round(subtotal * 7 / 100) : 0
  const whtAmount = wht ? Math.round(subtotal * 3 / 100) : 0
  const total = subtotal + vatAmount - whtAmount

  const save = async () => {
    if (!sel.size && !extra.some((x) => x.description.trim() && +x.amount > 0)) { showToast('เลือกงวดหรือเพิ่มรายการอย่างน้อย 1 รายการ'); return }
    if (kind === 'taxReceipt' && !cust.taxId.trim()) { showToast('ใบกำกับภาษีต้องกรอกเลขประจำตัวผู้เสียภาษีของลูกค้า'); return }
    setBusy(true)
    const r = await fetch(`/api/projects/${projectId}/billing`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind, installmentIds: [...sel],
        items: extra.filter((x) => x.description.trim() && +x.amount > 0).map((x) => ({ description: x.description, amount: +x.amount })),
        custName: cust.name, custAddress: cust.address, custPhone: cust.phone, custTaxId: cust.taxId,
        vatPct: vat ? 7 : 0, whtPct: wht ? 3 : 0,
        issueDate: f.issueDate, dueDate: f.dueDate || null,
        payMethod: f.payMethod, payDate: f.payDate, payRef: f.payRef, note: f.note,
        invoiceRefId: preset.invoiceRefId ?? null,
      }),
    })
    setBusy(false)
    const j = await r.json()
    if (r.ok) { showToast(`ออก ${billKindMeta(kind).label} ${j.code} แล้ว`); onSaved(j.id) }
    else showToast(j.error || 'ออกเอกสารไม่สำเร็จ')
  }

  return (
    <div className="modal-bd" style={{ zIndex: 80 }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ width: 'min(640px,100%)' }}>
        <div className="modal-h"><div><h3>ออกเอกสารการเงิน</h3><div className="sub">เอกสารดึงข้อมูลจากงวดของงาน — สถานะเงินงวดอัปเดตอัตโนมัติเมื่อบันทึก</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field full"><label>ประเภทเอกสาร</label>
            <span className="seg">
              {BILL_KINDS.map((k) => <button key={k.k} type="button" className={kind === k.k ? 'on' : ''} onClick={() => setKind(k.k)}>{k.label}</button>)}
            </span>
            {kind === 'taxReceipt' && <div className="hintline">ใบกำกับภาษี: ต้องมีเลขผู้เสียภาษีลูกค้า + คิด VAT 7% (นามบริษัท)</div>}
          </div>

          <div className="fs"><div className="fs-t">งวดที่{isInvoice ? 'วางบิล' : 'รับเงิน'}</div></div>
          <div className="field full">
            {pickable.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pickable.map((i) => (
                  <label key={i.id} style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 9, background: sel.has(i.id) ? 'var(--accent-soft, var(--surface-2))' : 'var(--surface-2)' }}>
                    <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} style={{ width: 16, height: 16 }} />
                    <span style={{ flex: 1 }}><b>{i.title}</b> <span style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>({instPayMeta(i.payStatus).k})</span></span>
                    <b>฿{commas(i.amount)}</b>
                  </label>
                ))}
              </div>
            ) : <div className="hintline">ไม่มีงวดที่{isInvoice ? 'รอวางบิล' : 'รอรับเงิน'} — เพิ่มรายการเองด้านล่างได้</div>}
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {extra.map((x, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 24px', gap: 6 }}>
                  <input value={x.description} placeholder="รายการเพิ่มเติม เช่น ค่าเพิ่มงาน…" onChange={(e) => setExtra((o) => o.map((y, z) => (z === i ? { ...y, description: e.target.value } : y)))} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
                  <input inputMode="numeric" value={fmtC(x.amount)} placeholder="บาท" onChange={(e) => setExtra((o) => o.map((y, z) => (z === i ? { ...y, amount: stripC(e.target.value) } : y)))} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, textAlign: 'right' }} />
                  <button type="button" className="qi-x" onClick={() => setExtra((o) => o.filter((_, z) => z !== i))}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setExtra((o) => [...o, { description: '', amount: '' }])}>+ เพิ่มรายการเอง</button>
            </div>
          </div>

          <div className="fs"><div className="fs-t">ข้อมูลลูกค้าบนเอกสาร</div></div>
          <div className="field"><label>ชื่อลูกค้า</label><input value={cust.name} onChange={(e) => setCust((o) => ({ ...o, name: e.target.value }))} /></div>
          <div className="field"><label>เบอร์โทร</label><input value={cust.phone} onChange={(e) => setCust((o) => ({ ...o, phone: e.target.value }))} /></div>
          <div className="field full"><label>ที่อยู่</label><input value={cust.address} onChange={(e) => setCust((o) => ({ ...o, address: e.target.value }))} /></div>
          <div className="field"><label>เลขประจำตัวผู้เสียภาษี{kind === 'taxReceipt' ? ' *' : ''}</label><input value={cust.taxId} onChange={(e) => setCust((o) => ({ ...o, taxId: e.target.value }))} inputMode="numeric" maxLength={20} /></div>

          <div className="fs"><div className="fs-t">ยอดเงิน &amp; เงื่อนไข</div></div>
          <div className="field"><label>วันที่ออกเอกสาร</label><input type="date" value={f.issueDate} onChange={(e) => setF((o) => ({ ...o, issueDate: e.target.value }))} /></div>
          {isInvoice ? (
            <div className="field"><label>ครบกำหนดชำระ</label><input type="date" value={f.dueDate} onChange={(e) => setF((o) => ({ ...o, dueDate: e.target.value }))} /></div>
          ) : (
            <>
              <div className="field"><label>วันที่รับเงิน</label><input type="date" value={f.payDate} onChange={(e) => setF((o) => ({ ...o, payDate: e.target.value }))} /></div>
              <div className="field"><label>ชำระโดย</label><select value={f.payMethod} onChange={(e) => setF((o) => ({ ...o, payMethod: e.target.value }))}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
              <div className="field"><label>อ้างอิง (เลขที่เช็ค/สลิป)</label><input value={f.payRef} onChange={(e) => setF((o) => ({ ...o, payRef: e.target.value }))} /></div>
            </>
          )}
          <div className="field full" style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: kind === 'taxReceipt' ? 'default' : 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={vat} disabled={kind === 'taxReceipt'} onChange={(e) => setVat(e.target.checked)} />VAT 7%
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={wht} onChange={(e) => setWht(e.target.checked)} />หัก ณ ที่จ่าย 3%
            </label>
          </div>
          <div className="field full"><label>หมายเหตุ</label><input value={f.note} onChange={(e) => setF((o) => ({ ...o, note: e.target.value }))} /></div>
          <div className="field full">
            <div className="sumbox">
              <div><span>รวมเงิน</span><b>฿{commas(subtotal)}</b></div>
              {vat && <div><span>VAT 7%</span><b>฿{commas(vatAmount)}</b></div>}
              {wht && <div><span>หัก ณ ที่จ่าย 3%</span><b style={{ color: 'var(--accent)' }}>−฿{commas(whtAmount)}</b></div>}
              <div className="grand"><span>{isInvoice ? 'ยอดที่ต้องชำระ' : 'ยอดรับสุทธิ'}</span><b>฿{commas(total)}</b></div>
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังออกเอกสาร…' : `ออก${billKindMeta(kind).short} + พิมพ์`}</button>
        </div>
      </div>
    </div>
  )
}
