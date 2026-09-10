'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { KF_STATUSES, KF_OPEN, kfMeta, canEdit, isAdminUp, type Role } from '@/lib/constants'
import { thDate } from '@/lib/format'
import { uiAlert, uiConfirm } from './biz-shared'

/**
 * Key Finding — บันทึกติดตามงานจากการประชุม (แทนชีตที่ทีมใช้อยู่)
 * หนึ่งแถวคือ สิ่งที่พบ → จะทำอะไร → ใครรับผิดชอบ → เสร็จเมื่อไร → ถึงไหนแล้ว
 * เรียงงานที่เลยกำหนดไว้บนสุด เพราะสิ่งที่ทีมต้องตอบทุกประชุมคือ "อะไรค้างอยู่บ้าง"
 */

type Me = { id: number; email: string; name: string | null; image: string | null; role: Role; bu: string | null }
export type Finding = {
  id: number; meetingDate: string; topic: string | null; finding: string; actionPlan: string | null
  owner: string | null; dueDate: string | null; status: string; note: string | null
  createdAt: string; createdByName: string | null
}
type Draft = {
  meetingDate: string; topic: string; finding: string; actionPlan: string
  owner: string; dueDate: string; status: string; note: string
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const emptyDraft = (): Draft => ({
  meetingDate: todayStr(), topic: '', finding: '', actionPlan: '', owner: '', dueDate: '', status: 'ยังไม่เริ่ม', note: '',
})
/** เลยกำหนดแล้วและยังไม่เสร็จ */
const isOverdue = (f: Finding) => !!f.dueDate && f.dueDate < todayStr() && KF_OPEN.includes(f.status)

export default function KeyFindingsView({ me, showToast, onChanged }: {
  me: Me; showToast: (m: string) => void; onChanged: () => void
}) {
  const [rows, setRows] = useState<Finding[] | null>(null)
  const [q, setQ] = useState(''); const [fStat, setFStat] = useState(''); const [fOwner, setFOwner] = useState('')
  const [edit, setEdit] = useState<{ id: number | null; d: Draft } | null>(null)
  const [busy, setBusy] = useState(false)
  const editable = canEdit(me.role)

  const load = useCallback(async () => {
    const r = await fetch('/api/key-findings', { cache: 'no-store' })
    if (r.ok) { setRows((await r.json()).findings); onChanged() }
    else showToast('โหลดรายการไม่สำเร็จ')
  }, [showToast, onChanged])
  useEffect(() => { load() }, [load])

  const owners = useMemo(
    () => [...new Set((rows || []).map((r) => r.owner).filter(Boolean))].sort() as string[],
    [rows],
  )

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return (rows || [])
      .filter((r) =>
        (!fStat || r.status === fStat) &&
        (!fOwner || r.owner === fOwner) &&
        (!ql || `${r.finding} ${r.actionPlan || ''} ${r.topic || ''} ${r.owner || ''}`.toLowerCase().includes(ql)))
      // เลยกำหนดขึ้นก่อน แล้วค่อยเรียงตามกำหนดเสร็จที่ใกล้ที่สุด งานที่ไม่มีกำหนดไปท้ายสุด
      .sort((a, b) => {
        const oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1
        if (oa !== ob) return oa - ob
        if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
        return b.meetingDate < a.meetingDate ? -1 : 1
      })
  }, [rows, q, fStat, fOwner])

  const counts = useMemo(() => {
    const all = rows || []
    return {
      open: all.filter((r) => KF_OPEN.includes(r.status)).length,
      overdue: all.filter(isOverdue).length,
      done: all.filter((r) => r.status === 'เสร็จแล้ว').length,
    }
  }, [rows])

  const save = async () => {
    if (!edit) return
    if (!edit.d.finding.trim()) { await uiAlert('ต้องกรอก Key Finding ก่อนบันทึก'); return }
    setBusy(true)
    const url = edit.id ? `/api/key-findings/${edit.id}` : '/api/key-findings'
    const r = await fetch(url, {
      method: edit.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(edit.d),
    })
    setBusy(false)
    if (!r.ok) { await uiAlert((await r.json().catch(() => ({}))).error || 'บันทึกไม่สำเร็จ'); return }
    showToast(edit.id ? 'บันทึกแล้ว' : 'เพิ่มรายการแล้ว')
    setEdit(null); load()
  }

  const setStatus = async (f: Finding, status: string) => {
    const r = await fetch(`/api/key-findings/${f.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (r.ok) load()
    else await uiAlert((await r.json().catch(() => ({}))).error || 'เปลี่ยนสถานะไม่สำเร็จ')
  }

  const remove = async (f: Finding) => {
    if (!await uiConfirm(`ลบรายการนี้?\n"${f.finding.slice(0, 80)}"\n\nลบแล้วกู้คืนไม่ได้`)) return
    const r = await fetch(`/api/key-findings/${f.id}`, { method: 'DELETE' })
    if (r.ok) { showToast('ลบแล้ว'); load() }
    else await uiAlert((await r.json().catch(() => ({}))).error || 'ลบไม่สำเร็จ')
  }

  if (!rows) return <div className="empty">กำลังโหลด Key Finding…</div>

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Key Finding</h1>
          <p>สิ่งที่พบจากการประชุม → แผนที่จะทำ → ผู้รับผิดชอบ → กำหนดเสร็จ · งานที่เลยกำหนดจะถูกดันขึ้นบนสุดให้เอง</p>
        </div>
        <span className="head-ctrl">
          <div className="search" style={{ minWidth: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเรื่อง / แผนงาน / ผู้รับผิดชอบ…" />
          </div>
          <select value={fStat} onChange={(e) => setFStat(e.target.value)}>
            <option value="">ทุกสถานะ</option>
            {KF_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={fOwner} onChange={(e) => setFOwner(e.target.value)}>
            <option value="">ทุกผู้รับผิดชอบ</option>
            {owners.map((o) => <option key={o}>{o}</option>)}
          </select>
          {editable && (
            <button className="btn btn-primary" onClick={() => setEdit({ id: null, d: emptyDraft() })}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
              เพิ่มรายการ
            </button>
          )}
        </span>
      </div>

      <div className="kpis">
        <Tile rail="var(--accent)" lab="เลยกำหนด" big={String(counts.overdue)} unit="รายการ" foot="ยังไม่เสร็จและเลยวันกำหนดแล้ว" />
        <Tile rail="#2563c9" lab="ค้างอยู่" big={String(counts.open)} unit="รายการ" foot="ยังไม่เริ่ม + กำลังทำ" />
        <Tile rail="#3f8f3a" lab="เสร็จแล้ว" big={String(counts.done)} unit="รายการ" foot={`จากทั้งหมด ${rows.length} รายการ`} />
      </div>

      <div className="alist">
        {list.map((f) => {
          const m = kfMeta(f.status)
          const over = isOverdue(f)
          return (
            <div className="arow" key={f.id} style={{ alignItems: 'stretch' }}>
              <div className="ab" style={{ background: over ? '#b0281c' : m.c }} />
              <div className="aw" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {f.topic && <span className="qchip" style={{ color: '#4338ca', background: '#dfdefa', cursor: 'default' }}>{f.topic}</span>}
                  <span className="an">{f.finding}</span>
                  <span className="qchip" style={{ color: m.c, background: m.b, cursor: 'default' }}>{m.k}</span>
                  {over && <span className="qchip" style={{ color: '#b0281c', background: '#f4dbd7', cursor: 'default' }}>เลยกำหนด</span>}
                </div>
                {f.actionPlan && <div className="as" style={{ whiteSpace: 'pre-wrap' }}>▸ {f.actionPlan}</div>}
                <div className="as">
                  ประชุม {thDate(f.meetingDate)}
                  {f.owner ? ` · ผู้รับผิดชอบ ${f.owner}` : ' · ยังไม่ระบุผู้รับผิดชอบ'}
                  {f.dueDate ? ` · กำหนดเสร็จ ${thDate(f.dueDate)}` : ' · ไม่มีกำหนดเสร็จ'}
                </div>
                {f.note && <div className="as" style={{ whiteSpace: 'pre-wrap' }}>{f.note}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignSelf: 'center' }}>
                {editable && (
                  <select className="kf-status" value={f.status} onChange={(e) => setStatus(f, e.target.value)}>
                    {KF_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                )}
                {editable && <button className="row-btn" onClick={() => setEdit({ id: f.id, d: toDraft(f) })}>แก้ไข</button>}
                {isAdminUp(me.role) && <button className="row-btn" style={{ color: '#b0281c' }} onClick={() => remove(f)}>ลบ</button>}
              </div>
            </div>
          )
        })}
        {!list.length && (
          <div className="empty">
            {rows.length ? 'ไม่พบรายการตามที่กรอง' : 'ยังไม่มีรายการ — กด "เพิ่มรายการ" เพื่อบันทึกสิ่งที่พบจากการประชุม'}
          </div>
        )}
      </div>

      {edit && (
        <EditModal
          draft={edit.d} isNew={edit.id == null} busy={busy}
          onChange={(d) => setEdit({ ...edit, d })}
          onClose={() => setEdit(null)} onSave={save} />
      )}
    </>
  )
}

const toDraft = (f: Finding): Draft => ({
  meetingDate: f.meetingDate, topic: f.topic ?? '', finding: f.finding, actionPlan: f.actionPlan ?? '',
  owner: f.owner ?? '', dueDate: f.dueDate ?? '', status: f.status, note: f.note ?? '',
})

function EditModal({ draft, isNew, busy, onChange, onClose, onSave }: {
  draft: Draft; isNew: boolean; busy: boolean
  onChange: (d: Draft) => void; onClose: () => void; onSave: () => void
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v })
  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ width: 'min(640px,100%)' }}>
        <div className="modal-h">
          <div>
            <h3>{isNew ? 'เพิ่ม Key Finding' : 'แก้ไข Key Finding'}</h3>
            <div className="sub">สิ่งที่พบจากการประชุม พร้อมแผนที่จะทำและผู้รับผิดชอบ</div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="form">
          <div className="field">
            <label>วันที่ประชุม</label>
            <input type="date" value={draft.meetingDate} onChange={(e) => set('meetingDate', e.target.value)} />
          </div>
          <div className="field">
            <label>หน่วยงาน / หัวข้อ</label>
            <input value={draft.topic} placeholder="เช่น SBU1, ออฟฟิศ, Co working" onChange={(e) => set('topic', e.target.value)} />
          </div>
          <div className="field full">
            <label>Key Finding <span className="req">*</span></label>
            <textarea rows={2} value={draft.finding} placeholder="สิ่งที่พบ เช่น ขาดพนักงานเขียนแบบ 2 คน" onChange={(e) => set('finding', e.target.value)} />
          </div>
          <div className="field full">
            <label>Action Plan</label>
            <textarea rows={2} value={draft.actionPlan} placeholder="จะทำอะไร เช่น ลงประกาศรับสมัครงาน" onChange={(e) => set('actionPlan', e.target.value)} />
          </div>
          <div className="field">
            <label>ผู้รับผิดชอบ</label>
            <input value={draft.owner} placeholder="เช่น MD, MKT, คุณส้ม" onChange={(e) => set('owner', e.target.value)} />
          </div>
          <div className="field">
            <label>กำหนดเสร็จ</label>
            <input type="date" value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </div>
          <div className="field">
            <label>สถานะ</label>
            <select value={draft.status} onChange={(e) => set('status', e.target.value)}>
              {KF_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field full">
            <label>หมายเหตุ</label>
            <textarea rows={2} value={draft.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={busy} onClick={onSave}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </div>
    </div>
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
