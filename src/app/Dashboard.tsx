'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UserButton } from '@clerk/nextjs'
import {
  BUS, BU_NAMES, STAGES, LEAD_STATUSES, QUOTES, QUOTE_STATUSES, CHANNELS, CATS, PROVINCES,
  DEFAULT_RATES, ROLES, ROLE_LABEL, canEdit, canManageUsers, isAdminUp, isFinal, stMeta, qMeta, ST_APPT, ST_NEW, type Role,
} from '@/lib/constants'
import { commas, fmtB, Mv, TH_MONTHS, DAY, toMs, toStr, weekStart, thDate, daysBetween, fmtPhone } from '@/lib/format'

type Appt = { type: string; date: string; time: string; note: string } | null
export type Rec = {
  id: number; code: string; bu: string
  name: string | null; channel: string | null; chname: string | null; phone: string | null; province: string | null
  detail: string | null; cat: string | null
  k: number | null; y: number | null; s: number | null; sqm: number | null
  amountEst: number | null; amountActual: number | null; shownVal: number | null; isFinal: boolean
  status: string; quote: string; d: string | null
  appt: Appt; attachCount: number; noteCount: number
}
type Meta = { updated: string; ref: string; refLabel: string; targetYear: string; targetTotal: number; quarters: { q: string; target: number }[] }
type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }
type View = 'overview' | 'alerts' | 'intake' | 'regions' | 'customers' | 'users'
const TITLES: Record<View, string> = { overview: 'ภาพรวม', alerts: 'แจ้งเตือน', intake: 'ลูกค้าเข้าใหม่', regions: 'ภูมิภาค (BU)', customers: 'รายการลูกค้า', users: 'จัดการผู้ใช้' }
const CACHE_KEY = 'sbu1-dash-cache-v1'
const REF = () => toMs('2026-07-15') // อ้างอิงข้อมูลล่าสุด
const NOW = () => Date.UTC(2026, 6, 17)

const Svg = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />

/* date-range helpers — r.d is 'YYYY-MM-DD', so string compare is chronological */
const inRange = (d: string | null | undefined, from: string, to: string) => {
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}
const rangeLabel = (from: string, to: string) =>
  (from ? thDate(from) : 'เริ่มต้น') + ' – ' + (to ? thDate(to) : 'ล่าสุด')
function RangePicker({ from, to, onFrom, onTo, onClear }: {
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; onClear: () => void
}) {
  const open = (e: React.MouseEvent<HTMLInputElement>) => {
    const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void }
    try { el.showPicker?.() } catch { /* not allowed without gesture — ignore */ }
  }
  return (
    <span className="range">
      <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} onClick={open} aria-label="วันที่เริ่มต้น" />
      <span className="range-sep">–</span>
      <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} onClick={open} aria-label="วันที่สิ้นสุด" />
      {(from || to) && <button type="button" className="range-clear" onClick={onClear} aria-label="ล้างช่วงวันที่">✕</button>}
    </span>
  )
}

/* ================================================================= */
export default function Dashboard({ me }: { me: Me }) {
  const [records, setRecords] = useState<Rec[]>([])
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('overview')
  const [navOpen, setNavOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [manage, setManage] = useState<Rec | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [ratesOpen, setRatesOpen] = useState(false)
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editable = canEdit(me.role)

  const showToast = useCallback((m: string) => {
    setToast(m)
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const load = useCallback(async () => {
    const r = await fetch('/api/customers', { cache: 'no-store' })
    if (!r.ok) { showToast('โหลดข้อมูลไม่สำเร็จ'); setLoading(false); return }
    const j = await r.json()
    setRecords(j.records); setRates(j.rates); setMeta(j.meta); setLoading(false)
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ records: j.records, rates: j.rates, meta: j.meta })) } catch { /* เต็ม/ปิดไว้ ไม่เป็นไร */ }
  }, [showToast])
  useEffect(() => {
    // โชว์ข้อมูลรอบก่อนทันที (ถ้ามี) แล้วค่อยดึงของสดมาแทน — ตัดหน้าจอ "กำลังโหลด" ที่ค้างนาน
    try {
      const c = localStorage.getItem(CACHE_KEY)
      if (c) { const j = JSON.parse(c); setRecords(j.records); setRates(j.rates); setMeta(j.meta); setLoading(false) }
    } catch { /* cache เสีย — โหลดปกติ */ }
    load()
  }, [load])

  const rateOf = useCallback((bu: string) => rates[bu] ?? DEFAULT_RATES[bu as keyof typeof DEFAULT_RATES] ?? 5500, [rates])

  if (loading || !meta) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--text-dim)' }}>กำลังโหลดข้อมูล…</div>
  }
  const pipeline = records.reduce((a, r) => a + (r.amountEst || r.amountActual || 0), 0)

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <Sidebar me={me} view={view} records={records}
        onNav={(v) => { setView(v); setNavOpen(false); window.scrollTo(0, 0) }}
        onRates={isAdminUp(me.role) ? () => { setRatesOpen(true); setNavOpen(false) } : undefined} />
      {navOpen && <div className="backdrop" onClick={() => setNavOpen(false)} />}

      <div className="main">
        <div className="topbar">
          <button className="hamb" onClick={() => setNavOpen((v) => !v)} aria-label="เมนู">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="tb-title">{TITLES[view]}</span>
          <div className="tb-right">
            <span className="tb-pill">ไปป์ไลน์รวม <b>฿{fmtB(pipeline)}</b></span>
            <span className="tb-pill">{ROLE_LABEL[me.role]}</span>
          </div>
        </div>
        <div className="content">
          {view === 'overview' && <Overview records={records} meta={meta} />}
          {view === 'alerts' && <Alerts records={records} onManage={setManage} />}
          {view === 'intake' && <Intake records={records} />}
          {view === 'regions' && <Regions records={records} />}
          {view === 'users' && canManageUsers(me.role) && <UsersView me={me} showToast={showToast} />}
          {view === 'customers' && (
            <Customers records={records} editable={editable} onManage={setManage} onAdd={() => setAddOpen(true)}
              patch={async (id, body) => { const r = await fetch(`/api/customers/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) { showToast('อัปเดตแล้ว'); load() } else showToast((await r.json()).error || 'ผิดพลาด') }} />
          )}
        </div>
      </div>

      {manage && <ManageModal rec={manage} me={me} rateOf={rateOf} onClose={() => setManage(null)} onSaved={() => { setManage(null); load() }} showToast={showToast} />}
      {addOpen && <AddModal rateOf={rateOf} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} showToast={showToast} />}
      {ratesOpen && <RatesModal rates={rates} onClose={() => setRatesOpen(false)} onSaved={(r) => { setRates(r); setRatesOpen(false); load() }} showToast={showToast} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

/* ---------------- Sidebar ---------------- */
function Sidebar({ me, view, records, onNav, onRates }: {
  me: Me; view: View; records: Rec[]; onNav: (v: View) => void; onRates?: () => void
}) {
  const alertCount = useMemo(() => {
    const now = NOW()
    return records.filter((r) => r.appt?.date && daysBetween(now, toMs(r.appt.date)) <= 0 && !isFinal(r.status) && r.status !== 'ไม่สนใจ / ปิดไม่ได้').length
  }, [records])
  const item = (v: View, label: string, icon: React.ReactNode, extra?: React.ReactNode) => (
    <button className={'nav-item' + (view === v ? ' on' : '')} onClick={() => onNav(v)}>{icon}{label}{extra}</button>
  )
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sb-logo" src="/logo.jpg" alt="Mr.โกดัง" />
        <span className="sb-cap">SBU1 - Customer</span>
      </div>
      <div className="nav-lbl">เมนู</div>
      <nav>
        {item('overview', 'ภาพรวม', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>)}
        {item('alerts', 'แจ้งเตือน', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>, alertCount ? <span className="alert-badge">{alertCount}</span> : null)}
        {item('intake', 'ลูกค้าเข้าใหม่', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="7" r="3.4" /><path d="M2.5 20v-1.6a4 4 0 014-4h5a4 4 0 014 4V20" /><path d="M18 7.5v5M20.5 10h-5" /></svg>)}
        {item('regions', 'ภูมิภาค (BU)', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6l6-2 4 2 6-2v14l-6 2-4-2-6 2z" /><path d="M10 4v14M14 6v14" /></svg>)}
        {item('customers', 'รายการลูกค้า', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 5h18M3 12h18M3 19h18" /></svg>, <span className="badge">{commas(records.length)}</span>)}
        {canManageUsers(me.role) && item('users', 'จัดการผู้ใช้', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="7" r="3.4" /><path d="M2.5 20v-1.6a4 4 0 014-4h5a4 4 0 014 4V20" /><circle cx="17.5" cy="14.5" r="2.2" /><path d="M17.5 10.8v1.5M17.5 16.7v1.5M14.3 14.5h1.5M19.2 14.5h1.5" /></svg>)}
      </nav>
      <div className="sb-foot">
        {onRates && (
          <button className="sbtn" onClick={onRates}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="4" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></svg>
            ตั้งค่าเรตราคา
          </button>
        )}
        <div className="sb-user">
          <UserButton />
          <div style={{ minWidth: 0 }}>
            <div className="un">{me.name || me.email}</div>
            <div className="ur">{ROLE_LABEL[me.role]}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ---------------- shared cells ---------------- */
function chanTag(r: Rec) {
  if (!r.channel && !r.chname) return null
  const c = r.channel || ''
  const m = c.startsWith('FB') ? { cls: 'fb', s: 'FB' } : c.startsWith('Line') ? { cls: 'line', s: 'LINE' } : c === 'โทร' ? { cls: 'telc', s: 'โทร' } : c === 'MD' ? { cls: 'md', s: 'MD' } : { cls: 'telc', s: c || '—' }
  return <span className="chline"><span className={'chan ' + m.cls}>{m.s}</span>{r.chname || '—'}</span>
}
function phoneTag(r: Rec) {
  if (!r.phone) return null
  return <a className="tel" href={'tel:' + r.phone} onClick={(e) => e.stopPropagation()}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" /></svg>
    {fmtPhone(r.phone)}
  </a>
}
function apptCell(r: Rec) {
  if (!r.appt?.date) return <span style={{ color: 'var(--text-faint)' }}>—</span>
  const dd = daysBetween(NOW(), toMs(r.appt.date))
  const cls = dd < 0 ? (r.isFinal ? 'past' : 'due') : dd <= 7 ? 'soon' : ''
  const t = r.appt.type === 'zoom' ? 'Zoom' : 'หน้างาน'
  return <span className={'apt ' + cls} title={t + ' · ' + thDate(r.appt.date)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
    {(+r.appt.date.slice(8, 10)) + ' ' + TH_MONTHS[+r.appt.date.slice(5, 7)]} · {t}
  </span>
}
function sizeCell(r: Rec) {
  const dims = [r.k, r.y, r.s].some((x) => x != null) ? `${r.k ?? '–'} × ${r.y ?? '–'} × ${r.s ?? '–'} ม.` : ''
  if (r.sqm == null && !dims) return <span style={{ color: 'var(--text-faint)' }}>—</span>
  return <>{r.sqm != null ? <><b>{commas(r.sqm)}</b> ตร.ม.</> : '—'}{dims && <span className="dim">{dims}</span>}</>
}

/* ---------------- Overview ---------------- */
function funnelRows(host: { k: string; n: number }[], meta: (s: string) => { c: string; b: string; k: string }) {
  const max = Math.max(1, ...host.map((r) => r.n))
  if (!host.length) return <div className="empty">ไม่มีข้อมูลในช่วงนี้</div>
  return host.map((o) => {
    const m = meta(o.k)
    return (
      <div className="frow" key={o.k}>
        <div className="fn"><i style={{ background: m.c }} /><span title={m.k}>{m.k}</span></div>
        <div className="ftrack"><div className="ffill" style={{ width: (o.n / max * 100) + '%', background: m.c }} /></div>
        <div className="fc">{commas(o.n)}</div>
      </div>
    )
  })
}
function Overview({ records, meta }: { records: Rec[]; meta: Meta }) {
  const [period, setPeriod] = useState<'all' | string>('all')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const ranged = !!(from || to)
  const years = useMemo(() => [...new Set(records.filter((r) => r.d).map((r) => r.d!.slice(0, 4)))].sort(), [records])
  const rs = records.filter((r) => ranged ? inRange(r.d, from, to) : (period === 'all' || r.d?.slice(0, 4) === period))
  const label = ranged ? rangeLabel(from, to) : period === 'all' ? 'ทุกช่วงเวลา' : 'ปี ' + period
  const showTarget = !ranged && (period === 'all' || period === meta.targetYear)

  const pipe = rs.reduce((a, r) => a + (r.amountEst || r.amountActual || 0), 0)
  const finals = rs.filter((r) => isFinal(r.status))
  const closed = finals.reduce((a, r) => a + (r.amountActual || r.amountEst || 0), 0)
  const sent = rs.filter((r) => r.quote === 'ส่งใบเสนอราคาแล้ว').length
  const expect = rs.filter((r) => r.status === 'คาดว่าจะได้งาน')
  const newWait = rs.filter((r) => r.status === ST_NEW).length
  const target = meta.targetTotal

  const stCount: Record<string, number> = {}; rs.forEach((r) => (stCount[r.status] = (stCount[r.status] || 0) + 1))
  const qCount: Record<string, number> = {}; rs.forEach((r) => (qCount[r.quote] = (qCount[r.quote] || 0) + 1))

  // quarterly grouped bars
  const closedQ = [0, 0, 0, 0], expectQ = [0, 0, 0, 0]
  rs.forEach((r) => { if (!r.d) return; const i = Math.ceil(+r.d.slice(5, 7) / 3) - 1; if (isFinal(r.status)) closedQ[i] += Mv(r.amountActual || r.amountEst || 0); if (r.status === 'คาดว่าจะได้งาน') expectQ[i] += Mv(r.amountEst || 0) })
  const series = [
    ...(showTarget ? [{ name: 'เป้าหมาย', color: 'var(--pending)', vals: meta.quarters.map((q) => q.target) }] : []),
    { name: 'คาดว่าจะได้งาน', color: '#3f8f3a', vals: expectQ },
    { name: 'ยอดปิดจริง', color: 'var(--won)', vals: closedQ },
  ]

  return (
    <>
      <div className="view-head">
        <div><h1>ภาพรวมสำหรับผู้บริหาร</h1><p>เลือกช่วงเวลาเพื่อดูยอดขายและสถานะลูกค้าของช่วงนั้น</p></div>
        <span className="head-ctrl">
          <span className="seg">
            {(['all', ...years] as string[]).map((p) => <button key={p} className={!ranged && period === p ? 'on' : ''} onClick={() => { setPeriod(p); setFrom(''); setTo('') }}>{p === 'all' ? 'ทั้งหมด' : p}</button>)}
          </span>
          <RangePicker from={from} to={to} onFrom={setFrom} onTo={setTo} onClear={() => { setFrom(''); setTo('') }} />
        </span>
      </div>
      <div className="kpis">
        <Tile rail="var(--accent)" lab={'มูลค่าไปป์ไลน์ (' + label + ')'} big={fmtB(pipe)} unit="บาท" foot={`จาก ${commas(rs.length)} ใบเสนอราคา`} />
        <Tile rail="#5f6b76" lab="ยอดปิดจริง / เป้าปี" big={Mv(closed).toFixed(1)} unit={showTarget ? '/ ' + target + ' ล.' : 'ล้าน'} prog={showTarget ? closed / 1e6 / target * 100 : undefined} foot={showTarget ? `${(closed / 1e6 / target * 100).toFixed(1)}% ของเป้า · ${finals.length} งาน` : `${finals.length} งานที่ปิด/เซ็นแล้ว`} />
        <Tile rail="#3f8f3a" lab="ส่งใบเสนอราคาแล้ว" big={commas(sent)} unit="ราย" foot={`คาดว่าจะได้งาน ${expect.length} ราย`} />
        <Tile rail="#b58600" lab="ลูกค้าใหม่ – รอติดต่อ" big={commas(newWait)} unit="ราย" foot="ยังไม่ได้ติดต่อกลับ" />
      </div>
      <div className="grid g-2">
        <section className="card">
          <div className="card-h"><h2>เป้าหมาย vs ยอดปิดงาน รายไตรมาส</h2><span className="hint">ล้านบาท</span></div>
          <p className="card-desc">{showTarget ? `เทียบเป้า (แผนปี ${meta.targetYear}) กับมูลค่าคาดว่าจะได้และยอดปิดจริง — ${label}` : `แสดงเฉพาะมูลค่าคาดว่าจะได้และยอดปิดจริงของ${label}`}</p>
          <Svg html={groupedBarsSvg(['Q1', 'Q2', 'Q3', 'Q4'], series)} />
          <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
        </section>
        <section className="card">
          <div className="card-h"><h2>สถานะการติดตามลูกค้า</h2><span className="hint">ราย</span></div>
          <p className="card-desc">ทั้งหมด <b>{commas(rs.length)}</b> รายใน{label}</p>
          <div className="funnel">{funnelRows(LEAD_STATUSES.filter((s) => stCount[s]).map((s) => ({ k: s, n: stCount[s] })), stMeta)}</div>
        </section>
      </div>
      <section className="card mt">
        <div className="card-h"><h2>สถานะใบเสนอราคา</h2><span className="hint">ราย</span></div>
        <p className="card-desc">ส่งใบเสนอราคาแล้ว <b>{commas(sent)}</b> รายใน{label}</p>
        <div className="funnel">{funnelRows(QUOTE_STATUSES.filter((q) => qCount[q]).map((q) => ({ k: q, n: qCount[q] })), qMeta)}</div>
      </section>
    </>
  )
}
function Tile({ rail, lab, big, unit, foot, prog }: { rail: string; lab: string; big: string; unit?: string; foot: string; prog?: number }) {
  return (
    <div className="tile">
      <div className="rail" style={{ background: rail }} />
      <div className="lab">{lab}</div>
      <div className="big">{big}{unit && <span className="unit">{unit}</span>}</div>
      {prog != null && <div className="prog"><i style={{ width: Math.min(100, prog) + '%' }} /></div>}
      <div className="foot">{foot}</div>
    </div>
  )
}

/* ---------------- Alerts ---------------- */
function Alerts({ records, onManage }: { records: Rec[]; onManage: (r: Rec) => void }) {
  const now = NOW()
  const appts = records.filter((r) => r.appt?.date).map((r) => ({ r, dd: daysBetween(now, toMs(r.appt!.date)) }))
  const overdue = appts.filter((x) => x.dd < 0 && !isFinal(x.r.status) && x.r.status !== 'ไม่สนใจ / ปิดไม่ได้').sort((a, b) => b.dd - a.dd)
  const today = appts.filter((x) => x.dd === 0)
  const soon = appts.filter((x) => x.dd > 0 && x.dd <= 7).sort((a, b) => a.dd - b.dd)
  const fresh = records.filter((r) => r.status === ST_NEW && r.d && daysBetween(toMs(r.d), now) >= 0 && daysBetween(toMs(r.d), now) <= 30).sort((a, b) => toMs(a.d!) - toMs(b.d!))
  const stale = records.filter((r) => r.quote === 'ส่งใบเสนอราคาแล้ว' && !isFinal(r.status) && r.status !== 'ไม่สนใจ / ปิดไม่ได้' && r.status !== 'ติดต่อไม่ได้' && r.d && daysBetween(toMs(r.d), now) > 14).sort((a, b) => toMs(a.d!) - toMs(b.d!))

  const apptRow = (x: { r: Rec; dd: number }) => {
    const a = x.r.appt!, t = a.type === 'zoom' ? 'Zoom' : 'ดูหน้างาน'
    const rel = x.dd < 0 ? `เลยมา ${-x.dd} วัน` : x.dd === 0 ? 'วันนี้' : `อีก ${x.dd} วัน`
    const col = x.dd < 0 ? 'var(--accent)' : x.dd === 0 ? '#2563c9' : '#4338ca'
    return (
      <div className="arow" key={x.r.id}>
        <div className="ab" style={{ background: col }} />
        <div className="aw"><div className="an">{x.r.name || x.r.chname || x.r.code}{phoneTag(x.r)}</div><div className="as">{t} · {thDate(a.date)}{a.time ? ' ' + a.time + ' น.' : ''} · {BU_NAMES[x.r.bu as keyof typeof BU_NAMES]}{a.note ? ' · ' + a.note : ''}</div></div>
        <div className="ad" style={{ color: col }}>{rel}</div>
        <button className="row-btn" onClick={() => onManage(x.r)}>จัดการ</button>
      </div>
    )
  }
  const leadRow = (r: Rec, note: string, col: string, days: number) => (
    <div className="arow" key={r.id}>
      <div className="ab" style={{ background: col }} />
      <div className="aw"><div className="an">{r.name || r.chname || r.code}{phoneTag(r)}</div><div className="as">{note}</div></div>
      <div className="ad" style={{ color: days > 14 ? 'var(--accent)' : col }}>{days === 0 ? 'วันนี้' : `${days} วัน`}</div>
      <button className="row-btn" onClick={() => onManage(r)}>จัดการ</button>
    </div>
  )
  const sect = (title: string, color: string, children: React.ReactNode, empty: string, count: number) => (
    <section className="card mt">
      <div className="sec-h"><h2>{title}</h2><span className="cnt-chip" style={{ background: color }}>{count}</span></div>
      <div className="alist">{count ? children : <div className="empty">{empty}</div>}</div>
    </section>
  )
  const urgent = overdue.length + today.length
  return (
    <>
      <div className="view-head"><div><h1>แจ้งเตือน &amp; งานที่ต้องทำ</h1><p>อ้างอิงวันที่ปัจจุบัน <b>{thDate(toStr(now))}</b> · นัดที่ต้องจัดการ {urgent} รายการ</p></div></div>
      {sect('นัดหมายเลยกำหนด — ยังไม่อัปเดตผล', 'var(--accent)', overdue.slice(0, 30).map(apptRow), 'ไม่มีนัดที่เลยกำหนด 🎉', overdue.length)}
      {sect('นัดหมายวันนี้', '#2563c9', today.map(apptRow), 'วันนี้ไม่มีนัด', today.length)}
      {sect('นัดหมายใน 7 วันข้างหน้า', '#4338ca', soon.map(apptRow), 'ยังไม่มีนัดในสัปดาห์นี้', soon.length)}
      {sect('ลูกค้าใหม่ที่ยังไม่ได้ติดต่อ (30 วัน)', '#b58600', fresh.slice(0, 30).map((r) => leadRow(r, `ทักเข้ามา ${thDate(r.d!)} · ${BU_NAMES[r.bu as keyof typeof BU_NAMES]}${r.province ? ' · ' + r.province : ''}`, '#b58600', daysBetween(toMs(r.d!), now))), 'ติดต่อครบทุกรายแล้ว 🎉', fresh.length)}
      {sect('ส่งใบเสนอราคาแล้วเกิน 14 วัน', '#3f8f3a', stale.slice(0, 30).map((r) => leadRow(r, `ส่งราคา ${thDate(r.d!)} · ${stMeta(r.status).k} · ฿${commas(r.shownVal || 0)}`, 'var(--text-dim)', daysBetween(toMs(r.d!), now))), 'ไม่มีใบเสนอราคาค้างติดตาม', stale.length)}
    </>
  )
}

/* ---------------- Intake ---------------- */
function Intake({ records }: { records: Rec[] }) {
  const [mode, setMode] = useState<'day' | 'week' | 'month' | 'year'>('month')
  const [bu, setBu] = useState('')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const ranged = !!(from || to)
  const years = useMemo(() => [...new Set(records.filter((r) => r.d).map((r) => r.d!.slice(0, 4)))].sort(), [records])
  const base = records.filter((r) => r.d && (!ranged || inRange(r.d, from, to)))
  const rs = bu ? base.filter((r) => r.bu === bu) : base
  const ref = REF()

  const buckets = () => {
    const out: { key: string; label: string; full: string; match: (r: Rec) => boolean }[] = []
    if (mode === 'day') for (let i = 29; i >= 0; i--) { const k = toStr(ref - i * DAY); out.push({ key: k, label: String(+k.slice(8, 10)), full: thDate(k), match: (r) => r.d === k }) }
    else if (mode === 'week') { const w0 = weekStart(ref); for (let i = 15; i >= 0; i--) { const ms = w0 - i * 7 * DAY, k = toStr(ms); out.push({ key: k, label: (+k.slice(8, 10)) + ' ' + TH_MONTHS[+k.slice(5, 7)], full: 'สัปดาห์ ' + thDate(k), match: (r) => !!r.d && toMs(r.d) >= ms && toMs(r.d) < ms + 7 * DAY }) } }
    else if (mode === 'month') years.forEach((y) => { for (let m = 1; m <= 12; m++) { const k = y + '-' + String(m).padStart(2, '0'); if (k > '2026-07') return; out.push({ key: k, label: TH_MONTHS[m] + (m === 1 ? ' ' + y : ''), full: TH_MONTHS[m] + ' ' + y, match: (r) => r.d?.slice(0, 7) === k }) } })
    else years.forEach((y) => out.push({ key: y, label: y, full: 'ปี ' + y, match: (r) => r.d?.slice(0, 4) === y }))
    return out
  }
  const bks = buckets().map((b) => { const m = rs.filter(b.match); return { ...b, n: m.length, v: m.reduce((a, r) => a + (r.amountEst || r.amountActual || 0), 0) } })
  const wk = weekStart(ref)
  const stats = [
    ['วันล่าสุด', rs.filter((r) => r.d === '2026-07-15'), '15 ก.ค. 2026'],
    ['สัปดาห์ล่าสุด', rs.filter((r) => r.d && toMs(r.d) >= wk && toMs(r.d) < wk + 7 * DAY), 'สัปดาห์ปัจจุบัน'],
    ['เดือนล่าสุด', rs.filter((r) => r.d?.slice(0, 7) === '2026-07'), 'เดือนปัจจุบัน'],
    ['ปีนี้ (2026)', rs.filter((r) => r.d?.slice(0, 4) === '2026'), 'สะสมทั้งปี'],
  ] as const
  const buRows = BUS.map((b) => { const m = base.filter((r) => r.bu === b && buckets().some((x) => x.match(r))); return { bu: b, n: m.length, v: m.reduce((a, r) => a + (r.amountEst || r.amountActual || 0), 0) } }).sort((a, b) => b.n - a.n)
  const mx = Math.max(1, ...buRows.map((r) => r.n))

  return (
    <>
      <div className="view-head"><div><h1>ลูกค้าเข้าใหม่ตามช่วงเวลา</h1><p>นับจำนวนใบเสนอราคาที่เปิดใหม่ · {ranged ? 'ช่วง ' + rangeLabel(from, to) : 'อ้างอิงข้อมูลล่าสุด 15 ก.ค. 2026'}</p></div>
        <RangePicker from={from} to={to} onFrom={setFrom} onTo={setTo} onClear={() => { setFrom(''); setTo('') }} />
      </div>
      <div className="statgrid4">
        {stats.map(([l, m, s]) => (
          <div className="stat" key={l}><div className="rail" /><div className="l">{l}{bu ? ' · ' + BU_NAMES[bu as keyof typeof BU_NAMES] : ''}</div>
            <div className="v">{commas(m.length)} <span style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 600 }}>ราย</span></div>
            <div className="s">{s} · ฿{Mv(m.reduce((a, r) => a + (r.amountEst || r.amountActual || 0), 0)).toFixed(1)} ล.</div></div>
        ))}
      </div>
      <section className="card">
        <div className="card-h"><h2>จำนวนลูกค้าเข้าใหม่</h2>
          <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="seg">{(['day', 'week', 'month', 'year'] as const).map((m) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{{ day: 'รายวัน', week: 'รายสัปดาห์', month: 'รายเดือน', year: 'รายปี' }[m]}</button>)}</span>
            <select value={bu} onChange={(e) => setBu(e.target.value)}><option value="">ทุก BU</option>{BUS.map((b) => <option key={b} value={b}>{BU_NAMES[b]}</option>)}</select>
          </span>
        </div>
        <Svg html={barChartSvg(bks)} />
      </section>
      <section className="card mt">
        <div className="card-h"><h2>แยกราย BU</h2></div>
        <div className="rlist">{buRows.map((r) => (
          <div className="rrow" key={r.bu}><div className="rn">{BU_NAMES[r.bu as keyof typeof BU_NAMES]}</div>
            <div className="rtrack"><div className="rfill" style={{ width: (r.n / mx * 100) + '%' }} /></div>
            <div className="rval">{commas(r.n)} ราย <small>· ฿{Mv(r.v).toFixed(0)} ล.</small></div></div>
        ))}</div>
      </section>
    </>
  )
}

/* ---------------- Regions ---------------- */
function Regions({ records }: { records: Rec[] }) {
  const [period, setPeriod] = useState<'all' | string>('all')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const ranged = !!(from || to)
  const years = useMemo(() => [...new Set(records.filter((r) => r.d).map((r) => r.d!.slice(0, 4)))].sort(), [records])
  const rs = records.filter((r) => ranged ? inRange(r.d, from, to) : (period === 'all' || r.d?.slice(0, 4) === period))
  const rows = BUS.map((bu) => { const m = rs.filter((r) => r.bu === bu); return { bu, n: m.length, v: m.reduce((a, r) => a + (r.amountEst || r.amountActual || 0), 0), m } }).sort((a, b) => b.v - a.v)
  const mx = Math.max(1, ...rows.map((r) => r.v))
  return (
    <>
      <div className="view-head"><div><h1>ผลงานตามภูมิภาค (BU)</h1><p>เปรียบเทียบมูลค่าไปป์ไลน์และสัดส่วนสถานะลูกค้าของแต่ละ BU</p></div>
        <span className="head-ctrl">
          <span className="seg">{(['all', ...years] as string[]).map((p) => <button key={p} className={!ranged && period === p ? 'on' : ''} onClick={() => { setPeriod(p); setFrom(''); setTo('') }}>{p === 'all' ? 'ทั้งหมด' : p}</button>)}</span>
          <RangePicker from={from} to={to} onFrom={setFrom} onTo={setTo} onClear={() => { setFrom(''); setTo('') }} />
        </span>
      </div>
      <section className="card">
        <div className="card-h"><h2>มูลค่าไปป์ไลน์ตามภูมิภาค</h2><span className="hint">มูลค่า · จำนวน</span></div>
        <div className="rlist">{rows.map((r) => (
          <div className="rrow" key={r.bu}><div className="rn">{BU_NAMES[r.bu as keyof typeof BU_NAMES]}</div>
            <div className="rtrack"><div className="rfill" style={{ width: (r.v / mx * 100) + '%' }} /></div>
            <div className="rval">฿{Mv(r.v).toFixed(0)} ล. <small>· {r.n} งาน</small></div></div>
        ))}</div>
      </section>
      <section className="card mt">
        <div className="card-h"><h2>สัดส่วนสถานะลูกค้าในแต่ละ BU</h2><span className="hint">% ของจำนวนราย</span></div>
        <div className="slist">{rows.filter((r) => r.m.length).map((r) => (
          <div className="srow" key={r.bu}><div className="sn">{BU_NAMES[r.bu as keyof typeof BU_NAMES]}</div>
            <div className="strack">{LEAD_STATUSES.map((st) => { const n = r.m.filter((x) => x.status === st).length; if (!n) return null; const m = stMeta(st); return <div key={st} className="sseg" style={{ width: (n / r.m.length * 100) + '%', background: m.c }} title={`${m.k}: ${n}`} /> })}</div></div>
        ))}</div>
        <div className="legend">{STAGES.map((s) => <span key={s.k}><i style={{ background: s.c }} />{s.k}</span>)}</div>
      </section>
    </>
  )
}

/* ---------------- Customers table ---------------- */
type SortKey = 'code' | 'name' | 'detail' | 'sqm' | 'status' | 'quote' | 'apptDate' | 'd' | 'amount'
function Customers({ records, editable, onManage, onAdd, patch }: {
  records: Rec[]; editable: boolean; onManage: (r: Rec) => void; onAdd: () => void
  patch: (id: number, body: Record<string, unknown>) => Promise<void>
}) {
  const [q, setQ] = useState(''); const [fReg, setFReg] = useState(''); const [fStat, setFStat] = useState(''); const [fQuote, setFQuote] = useState(''); const [fMonth, setFMonth] = useState(''); const [fChan, setFChan] = useState('')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [sortK, setSortK] = useState<SortKey>('amount'); const [sortDir, setSortDir] = useState(-1); const [shown, setShown] = useState(40)
  const [pop, setPop] = useState<{ r: Rec; kind: 'status' | 'quote'; x: number; y: number } | null>(null)

  const months = useMemo(() => [...new Set(records.filter((r) => r.d).map((r) => r.d!.slice(0, 7)))].sort().reverse(), [records])
  const channels = useMemo(() => [...new Set(records.map((r) => r.channel).filter(Boolean))] as string[], [records])

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const out = records.filter((r) => {
      if (fReg && r.bu !== fReg) return false
      if (fStat && r.status !== fStat) return false
      if (fQuote && r.quote !== fQuote) return false
      if (fChan && (r.channel || '') !== fChan) return false
      if (fMonth && r.d?.slice(0, 7) !== fMonth) return false
      if ((from || to) && !inRange(r.d, from, to)) return false
      if (ql) { const hay = `${r.name || ''} ${r.chname || ''} ${r.phone || ''} ${r.province || ''} ${r.detail || ''} ${r.code}`.toLowerCase(); if (!hay.includes(ql)) return false }
      return true
    })
    out.sort((a, b) => {
      let va: string | number, vb: string | number
      if (sortK === 'amount') { va = a.shownVal || 0; vb = b.shownVal || 0 }
      else if (sortK === 'sqm') { va = a.sqm || 0; vb = b.sqm || 0 }
      else if (sortK === 'apptDate') { va = a.appt?.date || ''; vb = b.appt?.date || '' }
      else { va = (a[sortK as keyof Rec] as string) || ''; vb = (b[sortK as keyof Rec] as string) || '' }
      if (va < vb) return -sortDir; if (va > vb) return sortDir
      return a.code < b.code ? -1 : 1
    })
    return out
  }, [records, q, fReg, fStat, fQuote, fChan, fMonth, from, to, sortK, sortDir])

  const setSort = (k: SortKey) => {
    if (sortK === k) setSortDir((d) => -d)
    else { setSortK(k); setSortDir(k === 'amount' || k === 'sqm' ? -1 : 1) }
    setShown(40)
  }
  const th = (k: SortKey, label: string, r?: boolean) => (
    <th data-k={k} className={(sortK === k ? 'on' : '') + (r ? ' r' : '')} onClick={() => setSort(k)}>{label}<span className="ar">{sortK === k ? (sortDir < 0 ? '▾' : '▴') : '↕'}</span></th>
  )
  const openPop = (e: React.MouseEvent, r: Rec, kind: 'status' | 'quote') => {
    e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPop({ r, kind, x: Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 228), y: rect.bottom + window.scrollY + 6 })
  }

  return (
    <>
      <div className="view-head"><div><h1>รายการลูกค้า &amp; ใบเสนอราคา</h1><p>คลิกสถานะเพื่ออัปเดต · กด &quot;จัดการ&quot; เพื่อแนบไฟล์ ตั้งนัด และบันทึกโน้ต</p></div></div>
      <div className="tbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(40) }} placeholder="ค้นหาชื่อ ชื่อ FB/LINE เบอร์ จังหวัด…" />
        </div>
        <select value={fMonth} onChange={(e) => { setFMonth(e.target.value); setShown(40) }}><option value="">ทุกเดือน</option>{months.map((m) => <option key={m} value={m}>{TH_MONTHS[+m.slice(5, 7)] + ' ' + m.slice(0, 4)}</option>)}</select>
        <RangePicker from={from} to={to} onFrom={(v) => { setFrom(v); setShown(40) }} onTo={(v) => { setTo(v); setShown(40) }} onClear={() => { setFrom(''); setTo(''); setShown(40) }} />
        <select value={fChan} onChange={(e) => { setFChan(e.target.value); setShown(40) }}><option value="">ทุกช่องทาง</option>{channels.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={fReg} onChange={(e) => { setFReg(e.target.value); setShown(40) }}><option value="">ทุกภูมิภาค</option>{BUS.map((b) => <option key={b} value={b}>{BU_NAMES[b]}</option>)}</select>
        <select value={fStat} onChange={(e) => { setFStat(e.target.value); setShown(40) }}><option value="">ทุกสถานะติดตาม</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={fQuote} onChange={(e) => { setFQuote(e.target.value); setShown(40) }}><option value="">ทุกสถานะใบเสนอราคา</option>{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        {editable && <button className="btn btn-primary" onClick={onAdd}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>เพิ่มลูกค้า</button>}
        <span className="tcount">{commas(list.length)} รายการ</span>
      </div>
      <div className="tscroll">
        <table>
          <thead><tr>
            {th('code', 'รหัส')}{th('name', 'ลูกค้า / จังหวัด')}{th('detail', 'ใช้ทำธุรกิจอะไร')}{th('sqm', 'ขนาด')}
            {th('status', 'สถานะติดตาม')}{th('quote', 'ใบเสนอราคา')}{th('apptDate', 'นัดหมาย')}{th('d', 'วันที่')}{th('amount', 'มูลค่า', true)}<th className="act" />
          </tr></thead>
          <tbody>
            {list.slice(0, shown).map((r) => {
              const sm = stMeta(r.status), qm = qMeta(r.quote), v = r.shownVal
              return (
                <tr key={r.id}>
                  <td className="code">{r.code.replace('QT-', '')}</td>
                  <td className="name">{r.name || r.chname || <span style={{ color: 'var(--text-faint)' }}>(ไม่ระบุชื่อ)</span>}{r.code.startsWith('NEW-') && <span className="tag-new">ใหม่</span>}{r.attachCount > 0 && <span className="clip"> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12l-9 9a5.5 5.5 0 01-8-8l9-9a3.7 3.7 0 015 5l-9 9a1.8 1.8 0 01-3-2l8-8" /></svg>{r.attachCount}</span>}{phoneTag(r)}{chanTag(r)}{r.province && <span className="prov">{r.province}</span>}</td>
                  <td className="biz">{r.detail ? <span className="dtl" title={r.detail}>{r.detail}</span> : <span className="dtl" style={{ color: 'var(--text-faint)' }}>—</span>}<span className="cat">{r.cat || 'ไม่ระบุ'}</span></td>
                  <td className="size">{sizeCell(r)}</td>
                  <td>{editable ? <button className="pill" style={{ color: sm.c, background: sm.b }} onClick={(e) => openPop(e, r, 'status')}><i style={{ background: sm.c }} />{sm.k}<svg className="pcar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="M6 9l6 6 6-6" /></svg></button> : <span className="pill" style={{ color: sm.c, background: sm.b, cursor: 'default' }}><i style={{ background: sm.c }} />{sm.k}</span>}</td>
                  <td>{editable ? <button className="qchip" style={{ color: qm.c, background: qm.b }} onClick={(e) => openPop(e, r, 'quote')}>{qm.k}<svg className="pcar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="M6 9l6 6 6-6" /></svg></button> : <span className="qchip" style={{ color: qm.c, background: qm.b, cursor: 'default' }}>{qm.k}</span>}</td>
                  <td>{apptCell(r)}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>{r.d ? thDate(r.d) : '—'}</td>
                  <td className={'amt' + (v ? '' : ' zero')}>{v ? '฿' + commas(v) : '—'}{v ? <span className={'vtag' + (r.isFinal ? ' real' : '')}>{r.isFinal ? 'มูลค่าจริง' : 'ประมาณ'}</span> : null}</td>
                  <td className="act">{editable ? <button className="row-btn" onClick={() => onManage(r)}>จัดการ</button> : null}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {list.length > shown && <div className="more"><button onClick={() => setShown((s) => s + 60)}>แสดงเพิ่มเติม ({commas(list.length - shown)} รายการ)</button></div>}
      <p className="foot-note">ที่มา: <b>SBU1 - ข้อมูลลูกค้า</b> · <b>ขนาด (ตร.ม.) = กว้าง × ยาว</b> · งานที่ปิด/เซ็นแล้วใช้มูลค่าจริง ที่เหลือเป็นมูลค่าประมาณ · <b>หน้านี้มีข้อมูลติดต่อลูกค้า</b> ระวังการแชร์ให้คนนอกทีม</p>

      {pop && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 69 }} onClick={() => setPop(null)} />
          <div className="pop" style={{ left: pop.x, top: pop.y }}>
            {pop.kind === 'status' ? (
              <>
                <div className="pop-t">เปลี่ยนสถานะติดตาม</div>
                {STAGES.map((s, i) => (
                  <div key={s.k}>
                    {i > 0 && STAGES[i - 1].g !== s.g && <hr />}
                    <button className={s.k === pop.r.status ? 'cur' : ''} onClick={async () => { setPop(null); await patch(pop.r.id, { status: s.k }); if (s.k === ST_APPT || isFinal(s.k)) onManage(pop.r) }}><i style={{ background: s.c }} />{s.k}</button>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="pop-t">เปลี่ยนสถานะใบเสนอราคา</div>
                {QUOTES.map((qo) => <button key={qo.k} className={qo.k === pop.r.quote ? 'cur' : ''} onClick={async () => { setPop(null); await patch(pop.r.id, { quote: qo.k }) }}><i style={{ background: qo.c }} />{qo.k}</button>)}
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

/* ---------------- Users management ---------------- */
type AppUser = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null; active: boolean; invited: boolean; inviteUrl: string | null }
type Invite = { id: string; email: string; createdAt: number; url: string | null }
async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true } catch { return false }
}
function UsersView({ me, showToast }: { me: Me; showToast: (m: string) => void }) {
  const [data, setData] = useState<{ users: AppUser[]; invitations: Invite[]; hasOwner: boolean } | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [pwUser, setPwUser] = useState<AppUser | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/users', { cache: 'no-store' })
    if (r.ok) setData(await r.json())
    else showToast('โหลดรายชื่อผู้ใช้ไม่สำเร็จ')
  }, [showToast])
  useEffect(() => { load() }, [load])

  const patch = async (id: number, body: Record<string, unknown>, okMsg: string) => {
    const r = await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { showToast(okMsg); load() } else showToast((await r.json()).error || 'ผิดพลาด')
  }
  const revoke = async (invId: string) => {
    const r = await fetch(`/api/users/${invId}`, { method: 'DELETE' })
    if (r.ok) { showToast('ยกเลิกคำเชิญแล้ว'); load() } else showToast((await r.json()).error || 'ผิดพลาด')
  }
  const copyInvite = async (url: string | null) => {
    if (!url) { showToast('คำเชิญนี้ไม่มีลิงก์ให้คัดลอก — กด "เชิญผู้ใช้" ซ้ำเพื่อออกลิงก์ใหม่'); return }
    showToast((await copyText(url)) ? 'คัดลอกลิงก์เชิญแล้ว — ส่งให้ทางไลน์/แชทได้เลย' : 'คัดลอกไม่สำเร็จ')
  }
  const copyBtn = (url: string | null) => (
    <button className="row-btn" onClick={() => copyInvite(url)} title="คัดลอกลิงก์เชิญ">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13, verticalAlign: -2, marginRight: 3 }}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
      คัดลอกลิงก์
    </button>
  )

  if (!data) return <div className="empty">กำลังโหลดรายชื่อผู้ใช้…</div>
  const isOwner = me.role === 'owner'
  // แก้บทบาท: เจ้าของแก้ได้ทุกคน (ยกเว้นตัวเอง) · ผู้ดูแลระบบแก้ได้ทุกคนยกเว้นเจ้าของและตัวเอง
  const canEditRow = (u: AppUser) => u.id !== me.id && (isOwner || u.role !== 'owner')
  const roleOpts = ROLES.filter((r) => r !== 'owner' || isOwner)

  const statusChip = (u: AppUser) => {
    if (!u.active) return <span className="qchip" style={{ color: '#b0281c', background: '#f4dbd7', cursor: 'default' }}>ระงับ</span>
    if (u.invited && !u.image && !u.name) return <span className="qchip" style={{ color: '#b58600', background: '#fbeec0', cursor: 'default' }}>รอตอบรับคำเชิญ</span>
    return <span className="qchip" style={{ color: '#3f8f3a', background: '#dcedd2', cursor: 'default' }}>ใช้งาน</span>
  }

  return (
    <>
      <div className="view-head">
        <div><h1>จัดการผู้ใช้</h1><p>เชิญผู้ใช้ทางอีเมล — ผู้ถูกเชิญกดลิงก์ในอีเมลเพื่อสมัครและตั้งรหัสผ่านเอง · เจ้าของ/ผู้ดูแลระบบตั้งรหัสผ่านใหม่ให้ได้เสมอ</p></div>
        <button className="btn btn-primary" onClick={() => setInviteOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>เชิญผู้ใช้</button>
      </div>
      <div className="tscroll">
        <table style={{ minWidth: 760 }}>
          <thead><tr><th>ผู้ใช้</th><th>บทบาท</th><th>BU ที่ดูแล</th><th>สถานะ</th><th className="act" /></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <td className="name">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.image && <img src={u.image} alt="" style={{ width: 26, height: 26, borderRadius: '50%', verticalAlign: 'middle', marginRight: 8 }} />}
                  {u.name || <span style={{ color: 'var(--text-faint)' }}>(ยังไม่ระบุชื่อ)</span>}
                  <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 8 }}>{u.email}</span>
                  {u.id === me.id && <span className="tag-new">ตัวเอง</span>}
                </td>
                <td>
                  {canEditRow(u)
                    ? <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value }, 'เปลี่ยนบทบาทแล้ว')}>{roleOpts.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                    : ROLE_LABEL[u.role]}
                </td>
                <td>
                  {canEditRow(u) || u.id === me.id
                    ? <select value={u.bu || ''} onChange={(e) => patch(u.id, { bu: e.target.value || null }, 'อัปเดต BU แล้ว')}><option value="">ทุก BU</option>{BUS.map((b) => <option key={b} value={b}>{BU_NAMES[b]}</option>)}</select>
                    : (u.bu ? BU_NAMES[u.bu as keyof typeof BU_NAMES] : 'ทุก BU')}
                </td>
                <td>{statusChip(u)}</td>
                <td className="act" style={{ whiteSpace: 'nowrap' }}>
                  {u.invited && copyBtn(u.inviteUrl)}
                  {(isOwner || u.role !== 'owner' || u.id === me.id) && <button className="row-btn" style={{ marginLeft: u.invited ? 6 : 0 }} onClick={() => setPwUser(u)}>ตั้งรหัสผ่าน</button>}
                  {canEditRow(u) && <button className="row-btn" style={{ marginLeft: 6, color: u.active ? '#b0281c' : '#3f8f3a' }} onClick={() => patch(u.id, { active: !u.active }, u.active ? 'ระงับบัญชีแล้ว' : 'เปิดใช้งานแล้ว')}>{u.active ? 'ระงับ' : 'เปิดใช้'}</button>}
                </td>
              </tr>
            ))}
            {data.invitations.map((i) => (
              <tr key={i.id}>
                <td className="name"><span style={{ color: 'var(--text-dim)' }}>{i.email}</span></td>
                <td style={{ color: 'var(--text-faint)' }}>—</td>
                <td style={{ color: 'var(--text-faint)' }}>—</td>
                <td><span className="qchip" style={{ color: '#b58600', background: '#fbeec0', cursor: 'default' }}>รอตอบรับคำเชิญ</span></td>
                <td className="act" style={{ whiteSpace: 'nowrap' }}>
                  {copyBtn(i.url)}
                  <button className="row-btn" style={{ marginLeft: 6, color: '#b0281c' }} onClick={() => revoke(i.id)}>ยกเลิกคำเชิญ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot-note">ผู้ถูกเชิญจะได้รับอีเมลพร้อมลิงก์สมัครใช้งาน (ตั้งรหัสผ่านเองได้) · &quot;ตั้งรหัสผ่าน&quot; ใช้ได้หลังผู้ใช้ตอบรับคำเชิญแล้ว · การระงับบัญชีมีผลทันทีที่ผู้ใช้รีเฟรชหน้า</p>
      {inviteOpen && <InviteModal isOwner={isOwner} onClose={() => setInviteOpen(false)} onSaved={() => { setInviteOpen(false); load() }} showToast={showToast} />}
      {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} onSaved={() => setPwUser(null)} showToast={showToast} />}
    </>
  )
}
function InviteModal({ isOwner, onClose, onSaved, showToast }: { isOwner: boolean; onClose: () => void; onSaved: () => void; showToast: (m: string) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('sales')
  const [bu, setBu] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentUrl, setSentUrl] = useState<string | null>(null)
  const save = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { showToast('กรอกอีเมลให้ถูกต้อง'); return }
    setBusy(true)
    const r = await fetch('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim(), role, bu: bu || null }) })
    setBusy(false)
    if (r.ok) {
      const j = await r.json()
      showToast('ส่งคำเชิญไปที่ ' + email.trim() + ' แล้ว')
      if (j.inviteUrl) setSentUrl(j.inviteUrl)
      else onSaved()
    } else showToast((await r.json()).error || 'ส่งคำเชิญไม่สำเร็จ')
  }
  if (sentUrl) {
    return (
      <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onSaved() }}>
        <div className="modal" role="dialog" aria-modal style={{ maxWidth: 460 }}>
          <div className="modal-h"><div><h3>ส่งคำเชิญแล้ว 🎉</h3><div className="sub">{email.trim()}</div></div><button className="modal-x" onClick={onSaved}>×</button></div>
          <div className="form">
            <div className="field full"><label>ลิงก์เชิญ (ส่งให้ทางไลน์/แชทได้)</label>
              <input readOnly value={sentUrl} onFocus={(e) => e.currentTarget.select()} />
              <div className="hintline">อีเมลคำเชิญถูกส่งไปแล้วด้วย — ลิงก์นี้ใช้ได้ลิงก์เดียวและหมดอายุใน 30 วัน</div>
            </div>
          </div>
          <div className="modal-f">
            <button className="btn" onClick={onSaved}>ปิด</button>
            <button className="btn btn-primary" onClick={async () => showToast((await copyText(sentUrl)) ? 'คัดลอกลิงก์เชิญแล้ว' : 'คัดลอกไม่สำเร็จ')}>คัดลอกลิงก์</button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 440 }}>
        <div className="modal-h"><h3>เชิญผู้ใช้ใหม่</h3><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field full"><label>อีเมล *</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoFocus /></div>
          <div className="field"><label>บทบาท</label><select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
          <div className="field"><label>BU ที่ดูแล</label><select value={bu} onChange={(e) => setBu(e.target.value)}><option value="">ทุก BU</option>{BUS.map((b) => <option key={b} value={b}>{BU_NAMES[b]}</option>)}</select></div>
          <div className="field full"><div className="hintline">ระบบจะส่งอีเมลพร้อมลิงก์ให้ผู้ใช้สมัครและ<b>ตั้งรหัสผ่านด้วยตัวเอง</b> — บทบาทที่เลือกจะมีผลทันทีที่เข้าระบบครั้งแรก</div></div>
        </div>
        <div className="modal-f"><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังส่ง…' : 'ส่งคำเชิญ'}</button></div>
      </div>
    </div>
  )
}
function PasswordModal({ user, onClose, onSaved, showToast }: { user: AppUser; onClose: () => void; onSaved: () => void; showToast: (m: string) => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const gen = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const arr = new Uint32Array(12); crypto.getRandomValues(arr)
    const p = Array.from(arr, (n) => chars[n % chars.length]).join('')
    setPw(p); setPw2(p); setShow(true)
  }
  const save = async () => {
    if (pw.length < 8) { showToast('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'); return }
    if (pw !== pw2) { showToast('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return }
    setBusy(true)
    const r = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    setBusy(false)
    if (r.ok) { showToast('ตั้งรหัสผ่านใหม่แล้ว'); onSaved() } else showToast((await r.json()).error || 'ตั้งรหัสผ่านไม่สำเร็จ')
  }
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ maxWidth: 440 }}>
        <div className="modal-h"><div><h3>ตั้งรหัสผ่านใหม่</h3><div className="sub">{user.name || user.email}</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field full"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></div>
          <div className="field full"><label>ยืนยันรหัสผ่านใหม่</label><input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          <div className="field full" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={gen}>สุ่มรหัสผ่าน</button>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />แสดงรหัสผ่าน</label>
          </div>
          <div className="field full"><div className="hintline">ตั้งแล้วผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์ และต้องเข้าสู่ระบบด้วยรหัสใหม่ — อย่าลืมส่งรหัสให้ผู้ใช้ทางช่องทางที่ปลอดภัย</div></div>
        </div>
        <div className="modal-f"><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่าน'}</button></div>
      </div>
    </div>
  )
}

/* ---------------- SVG charts (string builders) ---------------- */
function groupedBarsSvg(cats: string[], series: { name: string; color: string; vals: number[] }[]) {
  const W = 440, H = 210, padL = 34, padR = 8, padT = 16, padB = 26
  const maxv = Math.max(1, ...series.flatMap((s) => s.vals)) * 1.12
  const iw = W - padL - padR, ih = H - padT - padB, gw = iw / cats.length, bw = Math.min(20, (gw - 14) / series.length)
  const y = (v: number) => padT + ih - (v / maxv) * ih
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`
  for (let g = 0; g <= 4; g++) { const gv = maxv * g / 4, yy = y(gv); s += `<line class="gridline" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/><text class="axis-v" x="${padL - 6}" y="${yy + 3}" text-anchor="end">${gv.toFixed(0)}</text>` }
  cats.forEach((c, gi) => {
    const gx = padL + gi * gw
    series.forEach((se, si) => { const v = se.vals[gi] || 0, bx = gx + (gw - bw * series.length - 8) / 2 + si * (bw + 4), by = y(v), bh = padT + ih - by; s += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="2.5" fill="${se.color}"/>`; if (v > 0) s += `<text class="bar-val" x="${(bx + bw / 2).toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="middle">${v.toFixed(v < 10 ? 1 : 0)}</text>` })
    s += `<text class="axis" x="${(gx + gw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-weight="700">${c}</text>`
  })
  return s + '</svg>'
}
function barChartSvg(bks: { label: string; n: number }[]) {
  const W = 760, H = 250, padL = 30, padR = 10, padT = 16, padB = 40
  const n = bks.length, maxv = Math.max(1, ...bks.map((b) => b.n))
  const iw = W - padL - padR, ih = H - padT - padB, step = iw / n, bw = Math.min(42, step * 0.66), y = (v: number) => padT + ih - (v / maxv) * ih
  let grid = ''
  for (let g = 0; g <= 4; g++) { const gv = Math.round(maxv * g / 4), yy = padT + ih - (g / 4) * ih; grid += `<line class="gridline" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/><text class="axis-v" x="${padL - 6}" y="${yy + 3}" text-anchor="end">${gv}</text>` }
  let bars = '', xl = ''; const every = n > 16 ? Math.ceil(n / 12) : 1, showN = n <= 16
  bks.forEach((b, i) => { const cx = padL + i * step + step / 2, by = y(b.n), bh = padT + ih - by; bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="3" fill="var(--accent)" opacity="${b.n ? 1 : 0.22}"/>`; if (b.n && showN) bars += `<text class="bar-val" x="${cx.toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="middle">${b.n}</text>`; if (i % every === 0) xl += `<text class="axis" x="${cx.toFixed(1)}" y="${H - 16}" text-anchor="middle">${b.label}</text>` })
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${bars}${xl}</svg>`
}

/* ---------------- Modals ---------------- */
function ManageModal({ rec, me, rateOf, onClose, onSaved, showToast }: {
  rec: Rec; me: Me; rateOf: (bu: string) => number; onClose: () => void; onSaved: () => void; showToast: (m: string) => void
}) {
  const [status, setStatus] = useState(rec.status)
  const [quote, setQuote] = useState(rec.quote)
  const [amount, setAmount] = useState(rec.shownVal != null ? String(rec.shownVal) : '')
  const [phone, setPhone] = useState(rec.phone || '')
  const [channel, setChannel] = useState(rec.channel || 'FB : Mr.โกดัง')
  const [chname, setChname] = useState(rec.chname || '')
  const [apptType, setApptType] = useState(rec.appt?.type || '')
  const [apptDate, setApptDate] = useState(rec.appt?.date || '')
  const [apptTime, setApptTime] = useState(rec.appt?.time || '')
  const [apptNote, setApptNote] = useState(rec.appt?.note || '')
  const [note, setNote] = useState('')
  const [links, setLinks] = useState<{ kind: string; name: string; url: string }[]>([])
  const [busy, setBusy] = useState(false)
  const fin = isFinal(status)
  const est = rec.sqm ? Math.round(rec.sqm * rateOf(rec.bu)) : null

  const save = async () => {
    if (status === ST_APPT && !apptDate) { showToast('สถานะนัด ต้องระบุวันที่นัด'); return }
    if (fin && !amount) { showToast('งานที่ปิด/เซ็นแล้ว ต้องระบุมูลค่าจริง'); return }
    setBusy(true)
    const body: Record<string, unknown> = {
      status, quote, phone, channel, chname, amount: amount === '' ? null : Number(amount),
      appt: apptDate ? { type: apptType || 'site', date: apptDate, time: apptTime, note: apptNote } : null,
    }
    if (note.trim()) body.note = note.trim()
    const r = await fetch(`/api/customers/${rec.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) { showToast('บันทึกแล้ว'); onSaved() } else showToast((await r.json()).error || 'บันทึกไม่สำเร็จ')
  }
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal>
        <div className="modal-h"><div><h3>{rec.name || rec.chname || rec.code}</h3><div className="sub">{rec.code} · {BU_NAMES[rec.bu as keyof typeof BU_NAMES]}{rec.phone ? ' · ' + fmtPhone(rec.phone) : ''}{rec.province ? ' · ' + rec.province : ''}</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field"><label>เบอร์โทร</label><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" /></div>
          <div className="field"><label>ช่องทางการติดต่อ</label><select value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field full"><label>ชื่อช่องทางการติดต่อ</label><input value={chname} onChange={(e) => setChname(e.target.value)} placeholder="ชื่อที่แสดงใน FB / LINE" /></div>
          <div className="field"><label>สถานะติดตาม</label><select value={status} onChange={(e) => setStatus(e.target.value)}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label>สถานะใบเสนอราคา</label><select value={quote} onChange={(e) => setQuote(e.target.value)}>{QUOTE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field full"><label>{fin ? 'มูลค่าจริง (บาท) *' : 'มูลค่าประมาณ (บาท)'}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="hintline">{est != null ? <>คำนวณ: {commas(rec.sqm)} ตร.ม. × ฿{commas(rateOf(rec.bu))}/ตร.ม. ({rec.bu}) = <b>฿{commas(est)}</b>{!fin && <> · <button type="button" className="btn-sm" style={{ padding: 0, border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }} onClick={() => setAmount(String(est))}>ใช้ค่าที่คำนวณ</button></>}</> : 'ไม่มีข้อมูลพื้นที่ จึงคำนวณให้ไม่ได้'}</div>
          </div>
          <div className="fs"><div className="fs-t">นัดหมาย Zoom / ดูหน้างาน</div><div className="hintline">ตั้งได้ทั้งก่อนและหลังใบเสนอราคา — จะไปโผล่ในหน้า &quot;แจ้งเตือน&quot;</div></div>
          <div className="field"><label>ประเภทนัด</label><select value={apptType} onChange={(e) => setApptType(e.target.value)}><option value="">— ไม่มีนัด —</option><option value="zoom">Zoom</option><option value="site">ดูหน้างาน</option></select></div>
          <div className="field"><label>วันที่นัด</label><input type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} /></div>
          <div className="field"><label>เวลานัด</label><input type="time" value={apptTime} onChange={(e) => setApptTime(e.target.value)} /></div>
          <div className="field"><label>โน้ตนัดหมาย</label><input value={apptNote} onChange={(e) => setApptNote(e.target.value)} /></div>
          <div className="fs"><div className="fs-t">บันทึกการติดตาม</div></div>
          <div className="field full"><label>โน้ต (สรุปการคุย / ลูกค้าว่ายังไง)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โทรแล้ว ลูกค้าขอคุยกับหุ้นส่วนก่อน" /></div>
        </div>
        <div className="modal-f"><button className="btn" onClick={onClose}>ปิด</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>
      </div>
    </div>
  )
}

function AddModal({ rateOf, onClose, onSaved, showToast }: { rateOf: (bu: string) => number; onClose: () => void; onSaved: () => void; showToast: (m: string) => void }) {
  const [f, setF] = useState({ name: '', phone: '', channel: 'FB : Mr.โกดัง', chname: '', bu: 'BU1', province: '', cat: CATS[0] as string, detail: '', k: '', y: '', s: '', amount: '', d: '2026-07-17', status: ST_NEW as string, quote: 'ยังไม่ทำใบเสนอราคา', apptType: 'zoom', apptDate: '', apptTime: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }))
  const sqm = (+f.k > 0 && +f.y > 0) ? +f.k * +f.y : 0
  const est = sqm ? Math.round(sqm * rateOf(f.bu)) : null
  const fin = isFinal(f.status)
  const [amtTouched, setAmtTouched] = useState(false)
  const amount = amtTouched ? f.amount : (est != null && !fin ? String(est) : f.amount)

  const save = async () => {
    if (!f.name.trim() && !f.chname.trim()) { showToast('กรอกชื่อลูกค้า หรือชื่อช่องทางอย่างน้อย 1 อย่าง'); return }
    if (fin && !amount) { showToast('งานที่ปิด/เซ็นแล้ว ต้องระบุมูลค่าจริง'); return }
    if (f.status === ST_APPT && !f.apptDate) { showToast('สถานะนัด ต้องระบุวันที่นัด'); return }
    setBusy(true)
    const r = await fetch('/api/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, amount, k: f.k || null, y: f.y || null, s: f.s || null }) })
    setBusy(false)
    if (r.ok) { showToast('เพิ่มลูกค้าแล้ว: ' + (f.name || f.chname)); onSaved() } else showToast((await r.json()).error || 'เพิ่มไม่สำเร็จ')
  }
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal>
        <div className="modal-h"><h3>เพิ่มลูกค้าใหม่</h3><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="field"><label>ชื่อลูกค้า</label><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น คุณสมชาย" /></div>
          <div className="field"><label>เบอร์โทร</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="numeric" placeholder="0812345678" /></div>
          <div className="field"><label>ช่องทางการติดต่อ</label><select value={f.channel} onChange={(e) => set('channel', e.target.value)}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label>ชื่อช่องทางการติดต่อ</label><input value={f.chname} onChange={(e) => set('chname', e.target.value)} placeholder="ชื่อใน FB / LINE" /></div>
          <div className="field"><label>ประเภทธุรกิจ</label><select value={f.cat} onChange={(e) => set('cat', e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label>รายละเอียดการใช้งาน</label><input value={f.detail} onChange={(e) => set('detail', e.target.value)} placeholder="เช่น โกดังเก็บสินค้า" /></div>
          <div className="field"><label>ภูมิภาค (BU)</label><select value={f.bu} onChange={(e) => set('bu', e.target.value)}>{BUS.map((b) => <option key={b} value={b}>{BU_NAMES[b]}</option>)}</select></div>
          <div className="field"><label>จังหวัด</label><select value={f.province} onChange={(e) => set('province', e.target.value)}><option value="">— เลือกจังหวัด —</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="field full"><label>ขนาด — กว้าง × ยาว × สูง (เมตร)</label>
            <div className="dims"><input type="number" value={f.k} onChange={(e) => set('k', e.target.value)} placeholder="กว้าง" /><input type="number" value={f.y} onChange={(e) => set('y', e.target.value)} placeholder="ยาว" /><input type="number" value={f.s} onChange={(e) => set('s', e.target.value)} placeholder="สูง" /></div>
            <div className="hintline">พื้นที่ = กว้าง × ยาว {sqm ? `= ${commas(sqm)} ตร.ม.` : ''} (สูงบันทึกไว้ไม่นับเป็นพื้นที่)</div>
          </div>
          <div className="field"><label>สถานะติดตาม</label><select value={f.status} onChange={(e) => set('status', e.target.value)}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label>สถานะใบเสนอราคา</label><select value={f.quote} onChange={(e) => set('quote', e.target.value)}>{QUOTE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field full"><label>{fin ? 'มูลค่าจริง (บาท) *' : 'มูลค่าประมาณ (บาท)'}</label>
            <input type="number" value={amount} onChange={(e) => { setAmtTouched(true); set('amount', e.target.value) }} placeholder="กรอกขนาดแล้วคำนวณให้" />
            <div className="hintline">{est != null ? <>คำนวณ: {commas(sqm)} ตร.ม. × ฿{commas(rateOf(f.bu))}/ตร.ม. ({f.bu}) = <b>฿{commas(est)}</b></> : 'กรอก กว้าง × ยาว แล้วคำนวณให้'}</div>
          </div>
          {f.status === ST_APPT && (
            <div className="field full"><div className="fs-t">นัดหมาย (จำเป็นเมื่อเลือกสถานะนัด)</div>
              <div className="dims" style={{ marginTop: 6 }}><select value={f.apptType} onChange={(e) => set('apptType', e.target.value)}><option value="zoom">Zoom</option><option value="site">ดูหน้างาน</option></select><input type="date" value={f.apptDate} onChange={(e) => set('apptDate', e.target.value)} /><input type="time" value={f.apptTime} onChange={(e) => set('apptTime', e.target.value)} /></div>
            </div>
          )}
        </div>
        <div className="modal-f"><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกลูกค้า'}</button></div>
      </div>
    </div>
  )
}

function RatesModal({ rates, onClose, onSaved, showToast }: { rates: Record<string, number>; onClose: () => void; onSaved: (r: Record<string, number>) => void; showToast: (m: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(BUS.map((b) => [b, String(rates[b] ?? DEFAULT_RATES[b])])))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const body = { rates: Object.fromEntries(BUS.map((b) => [b, Number(vals[b])])) }
    const r = await fetch('/api/rates', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) { const j = await r.json(); showToast('บันทึกเรตราคาแล้ว'); onSaved(j.rates) } else showToast((await r.json()).error || 'บันทึกไม่สำเร็จ')
  }
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 'min(470px,100%)' }} role="dialog" aria-modal>
        <div className="modal-h"><div><h3>ตั้งค่าเรตราคา</h3><div className="sub">มูลค่าประมาณ = พื้นที่ (ตร.ม.) × เรตของ BU</div></div><button className="modal-x" onClick={onClose}>×</button></div>
        <div className="form">
          <div className="hintline" style={{ gridColumn: '1/-1', margin: 0 }}>ค่าตั้งต้นวิเคราะห์จากใบเสนอราคาเดิม — แก้ให้ตรงราคาจริงได้เลย</div>
          {BUS.map((b) => (
            <div className="field" key={b}><label>{BU_NAMES[b]}</label><input type="number" value={vals[b]} onChange={(e) => setVals((o) => ({ ...o, [b]: e.target.value }))} /><div className="hintline">ค่าเริ่มต้น ฿{commas(DEFAULT_RATES[b])}/ตร.ม.</div></div>
          ))}
        </div>
        <div className="modal-f"><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>
      </div>
    </div>
  )
}
