'use client'

import { useCallback, useEffect, useState } from 'react'
import { BU_NAMES, qdocMeta, projMeta, contractMeta, billKindMeta } from '@/lib/constants'
import { commas, fmtPhone, thDate } from '@/lib/format'

/**
 * กล่อง "เอกสารของลูกค้า" — เปิดได้จากทุกหน้าที่มีชื่อลูกค้า
 * รวมใบเสนอราคา สัญญา งานก่อสร้าง และเอกสารการเงินของลูกค้ารายนั้นไว้ที่เดียว
 * แต่ละแถวกดเปิดเอกสารตัวจริงในแท็บใหม่ได้ทันที ไม่ต้องไล่หาทีละหน้า
 */

type Quote = { id: number; code: string; rev: number; status: string; issueDate: string | null; validUntil: string | null; grand: number; trashed: boolean }
type Contract = { id: number; code: string; status: string; amount: number; signDate: string | null; dueDate: string | null }
type Project = { id: number; code: string; name: string; status: string; contractAmount: number; dueDate: string | null; received: number; instDone: number; instTotal: number; trashed: boolean }
type Bill = { id: number; kind: string; code: string; issueDate: string | null; total: number; status: string; projectId: number; projectName: string | null }
type Cust = { id: number; code: string; bu: string; name: string | null; chname: string | null; phone: string | null; province: string | null; status: string; quoteStatus: string }
type Docs = { customer: Cust; quotes: Quote[]; contracts: Contract[]; projects: Project[]; billing: Bill[] }

const chip = (label: string, c: string, b: string) => (
  <span className="qchip" style={{ color: c, background: b, cursor: 'default' }}>{label}</span>
)
const TRASH = chip('อยู่ในถังขยะ', '#b0281c', '#f4dbd7')

export default function CustomerDocsModal({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [d, setD] = useState<Docs | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const r = await fetch(`/api/customers/${customerId}/docs`, { cache: 'no-store' })
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || `โหลดไม่สำเร็จ (${r.status})`); return }
      setD(await r.json())
    } catch { setErr('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง') }
  }, [customerId])
  useEffect(() => { load() }, [load])

  const open = (url: string) => window.open(url, '_blank')

  return (
    <div className="modal-bd" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal style={{ width: 'min(840px,100%)' }}>
        <div className="modal-h">
          <div>
            <h3>{d ? (d.customer.name || d.customer.chname || d.customer.code) : 'เอกสารของลูกค้า'}</h3>
            <div className="sub">
              {d
                ? <>{d.customer.code} · {BU_NAMES[d.customer.bu as keyof typeof BU_NAMES] || d.customer.bu}
                    {d.customer.phone ? ' · ' + fmtPhone(d.customer.phone) : ''}
                    {d.customer.province ? ' · ' + d.customer.province : ''}</>
                : 'กำลังโหลด…'}
            </div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div className="form" style={{ gridTemplateColumns: '1fr' }}>
          {err && <div className="field full" style={{ color: '#b0281c', fontSize: 13 }}>{err}</div>}
          {!d && !err && <div className="empty">กำลังโหลดเอกสาร…</div>}

          {d && (
            <>
              <Section title={`ใบเสนอราคา (${d.quotes.length})`} empty="ยังไม่มีใบเสนอราคา" count={d.quotes.length}>
                {d.quotes.map((q) => {
                  const m = qdocMeta(q.status)
                  return (
                    <Row key={q.id}
                      rail={m.c}
                      title={<>{q.code}{q.rev > 1 && <> (Rev.{q.rev})</>} {chip(m.k, m.c, m.b)} {q.trashed && TRASH}</>}
                      sub={`${q.issueDate ? 'ออก ' + thDate(q.issueDate) : ''}${q.validUntil ? ' · ใช้ได้ถึง ' + thDate(q.validUntil) : ''}`}
                      right={`฿${commas(q.grand)}`}
                      onOpen={() => open(`/quotes/${q.id}/print`)} />
                  )
                })}
              </Section>

              <Section title={`สัญญา (${d.contracts.length})`} empty="ยังไม่มีสัญญา" count={d.contracts.length}>
                {d.contracts.map((c) => {
                  const m = contractMeta(c.status)
                  return (
                    <Row key={c.id}
                      rail={m.c}
                      title={<>{c.code} {chip(m.k, m.c, m.b)}</>}
                      sub={`${c.signDate ? 'ลงนาม ' + thDate(c.signDate) : 'ยังไม่ระบุวันลงนาม'}${c.dueDate ? ' · แล้วเสร็จ ' + thDate(c.dueDate) : ''}`}
                      right={`฿${commas(c.amount)}`}
                      onOpen={() => open(`/contracts/${c.id}`)} />
                  )
                })}
              </Section>

              <Section title={`งานก่อสร้าง (${d.projects.length})`} empty="ยังไม่มีงานก่อสร้าง" count={d.projects.length}>
                {d.projects.map((p) => {
                  const m = projMeta(p.status)
                  return (
                    <Row key={p.id}
                      rail={m.c}
                      title={<>{p.name} {chip(m.k, m.c, m.b)} {p.trashed && TRASH}</>}
                      sub={`${p.code} · รับเงิน ฿${commas(p.received)} · งวดงาน ${p.instDone}/${p.instTotal}${p.dueDate ? ' · กำหนดเสร็จ ' + thDate(p.dueDate) : ''}`}
                      right={`฿${commas(p.contractAmount)}`} />
                  )
                })}
              </Section>

              <Section title={`เอกสารการเงิน (${d.billing.length})`} empty="ยังไม่มีใบวางบิล/ใบเสร็จ" count={d.billing.length}>
                {d.billing.map((b) => {
                  const k = billKindMeta(b.kind)
                  return (
                    <Row key={b.id}
                      rail={k.c}
                      title={<>{b.code} {chip(k.short, k.c, k.b)} {b.status === 'ยกเลิก' && chip('ยกเลิก', '#b0281c', '#f4dbd7')}</>}
                      sub={`${b.issueDate ? thDate(b.issueDate) : ''}${b.projectName ? ' · ' + b.projectName : ''}`}
                      right={`฿${commas(b.total)}`}
                      onOpen={() => open(`/billing/${b.id}/print`)} />
                  )
                })}
              </Section>
            </>
          )}
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, empty, count, children }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <div className="fs"><div className="fs-t">{title}</div></div>
      <div className="field full">
        {count === 0 ? <div className="hintline">{empty}</div> : <div className="alist">{children}</div>}
      </div>
    </>
  )
}

function Row({ rail, title, sub, right, onOpen }: {
  rail: string; title: React.ReactNode; sub: string; right: string; onOpen?: () => void
}) {
  return (
    <div className="arow" style={{ alignItems: 'center' }}>
      <div className="ab" style={{ background: rail }} />
      <div className="aw">
        <div className="an" style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>{title}</div>
        {sub && <div className="as">{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{right}</b>
        {onOpen && <button className="row-btn" onClick={onOpen}>เปิด</button>}
      </div>
    </div>
  )
}

/**
 * ชื่อลูกค้าแบบกดได้ — ใช้แทนการพิมพ์ชื่อเฉย ๆ ทุกที่ที่มี id ของลูกค้าอยู่ในมือ
 * ไอคอนเอกสารต่อท้ายเป็นตัวบอกว่ากดแล้วเจออะไร ไม่ต้องรอให้เอาเมาส์ไปชี้ถึงจะรู้
 */
export function CustLink({ id, name, onOpen }: { id: number | null | undefined; name: string; onOpen?: (id: number) => void }) {
  if (id == null || !onOpen) return <>{name}</>
  return (
    <button type="button" className="cust-link"
      title={`ดูเอกสารทั้งหมดของ ${name} — ใบเสนอราคา สัญญา งานก่อสร้าง เอกสารการเงิน`}
      onClick={(e) => { e.stopPropagation(); onOpen(id) }}>
      <span>{name}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </svg>
    </button>
  )
}
