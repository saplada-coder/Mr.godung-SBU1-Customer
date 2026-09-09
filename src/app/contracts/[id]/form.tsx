'use client'

import { useState } from 'react'
import { CONTRACT_STATUSES, contractMeta, isAdminUp, type Role } from '@/lib/constants'
import { bahtText } from '@/lib/format'
import { uiConfirm } from '../../biz-shared'

export type SubRow = { title: string; amount: number }
type Inst = { title: string; amount: number; note: string; subs: SubRow[] }
export type ContractInit = {
  id: number; code: string; status: string
  projectName: string; siteAddress: string; contractorSigner: string
  contractAmount: number; vatPct: number; whtPct: number
  buildDays: number; extendDays: number; startWithinDays: number; payWithinDays: number
  penaltyPerDay: number; workHours: string; warrantyYears: number
  buildingSize: string; buildingSqm: number
  scopeIncluded: string; scopeExcluded: string; warrantyText: string; note: string
  signDate: string; dueDate: string
  installments: Inst[]
}
type Ctx = { quoteCode: string; quoteId: number; employer: string; employerAddr: string; employerTax: string }
type NumKey = 'buildingSqm' | 'buildDays' | 'extendDays' | 'startWithinDays' | 'payWithinDays' | 'penaltyPerDay' | 'warrantyYears'

const money = (n: number) => Math.round(n).toLocaleString('en-US')

export default function ContractForm({ init, ctx, role }: { init: ContractInit; ctx: Ctx; role: Role }) {
  const [f, setF] = useState<ContractInit>(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null)
  const admin = isAdminUp(role)
  const locked = f.status === 'ลงนามแล้ว' && !admin

  const set = <K extends keyof ContractInit>(k: K, v: ContractInit[K]) => setF((o) => ({ ...o, [k]: v }))
  const setInst = (i: number, patch: Partial<Inst>) =>
    setF((o) => ({ ...o, installments: o.installments.map((x, n) => (n === i ? { ...x, ...patch } : x)) }))

  const instTotal = f.installments.reduce((a, i) => a + (i.amount || 0), 0)
  const diff = Math.round(instTotal - f.contractAmount)

  const save = async (extra?: Partial<ContractInit>) => {
    setBusy(true); setMsg(null)
    try {
      const body = { ...f, ...extra }
      const r = await fetch(`/api/contracts/${f.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ t: d.error || 'บันทึกไม่สำเร็จ', err: true }); return false }
      if (extra) setF((o) => ({ ...o, ...extra }))
      setMsg({ t: 'บันทึกแล้ว' })
      return true
    } catch {
      setMsg({ t: 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง', err: true }); return false
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!await uiConfirm(`ลบร่างสัญญา ${f.code}?\nงวดงานในสัญญาจะถูกลบไปด้วย — ร่างใหม่จากใบเสนอราคาเดิมได้`)) return
    setBusy(true)
    const r = await fetch(`/api/contracts/${f.id}`, { method: 'DELETE' })
    if (r.ok) window.close()
    else { setMsg({ t: (await r.json()).error || 'ลบไม่สำเร็จ', err: true }); setBusy(false) }
  }

  const meta = contractMeta(f.status)
  // เขียนเป็นฟังก์ชันคืน JSX ไม่ใช่คอมโพเนนต์ — ถ้าประกาศคอมโพเนนต์ในนี้ React จะ remount ทุกครั้งที่พิมพ์ แล้วช่องกรอกจะหลุดโฟกัส
  const numField = (k: NumKey, lab: string, suffix?: string) => (
    <div className="field" key={k}>
      <label>{lab}{suffix ? ` (${suffix})` : ''}</label>
      <input type="number" value={String(f[k] ?? 0)} disabled={locked}
        onChange={(e) => set(k, Number(e.target.value) || 0)} />
    </div>
  )

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '22px 18px 90px' }}>
      <div className="view-head">
        <div>
          <h1>ร่างสัญญาว่าจ้างรับเหมาก่อสร้าง</h1>
          <p>
            เลขที่ {f.code} · จากใบเสนอราคา {ctx.quoteCode} · ผู้ว่าจ้าง {ctx.employer || '—'}
            <span className="qchip" style={{ color: meta.c, background: meta.b, cursor: 'default', marginLeft: 8 }}>{f.status}</span>
          </p>
        </div>
        <span className="head-ctrl">
          <button className="btn" onClick={() => window.open(`/contracts/${f.id}/print`, '_blank')}>🖨 พิมพ์สัญญา</button>
          <button className="btn btn-primary" disabled={busy || locked} onClick={() => save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </span>
      </div>

      {locked && <div className="hintline" style={{ marginBottom: 12 }}>สัญญาลงนามแล้ว — แก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ</div>}
      {msg && (
        <div style={{ marginBottom: 14, padding: '9px 13px', borderRadius: 9, fontSize: 13, background: msg.err ? '#f4dbd7' : '#dcedd2', color: msg.err ? '#8f2018' : '#2c6b28' }}>{msg.t}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="fs"><div className="fs-t">หัวสัญญา</div></div>
        <div className="field full">
          <label>ชื่อโครงการ</label>
          <input value={f.projectName} disabled={locked} placeholder="เช่น โครงการก่อสร้างโกดังเก็บสินค้า (ให้เช่า)"
            onChange={(e) => set('projectName', e.target.value)} />
        </div>
        <div className="field full">
          <label>ที่ตั้งโครงการ</label>
          <input value={f.siteAddress} disabled={locked} placeholder="เช่น ตำบลคูคต อำเภอลำลูกกา จังหวัดปทุมธานี"
            onChange={(e) => set('siteAddress', e.target.value)} />
        </div>
        <div className="field">
          <label>ผู้มีอำนาจลงนาม (ฝ่ายผู้รับจ้าง)</label>
          <input value={f.contractorSigner} disabled={locked} placeholder="เช่น นายวิเจน แก้วมณี"
            onChange={(e) => set('contractorSigner', e.target.value)} />
        </div>
        <div className="field">
          <label>ผู้ว่าจ้าง (จากใบเสนอราคา)</label>
          <input readOnly value={ctx.employer || '—'} />
          <div className="hintline">ที่อยู่/เลขภาษีดึงจากใบเสนอราคา — แก้ได้ที่ใบเสนอราคา{ctx.employerTax ? ` · เลขภาษี ${ctx.employerTax}` : ''}</div>
        </div>
        <div className="field">
          <label>ขนาดอาคาร</label>
          <input value={f.buildingSize} disabled={locked} placeholder="เช่น 11.34*24.96" onChange={(e) => set('buildingSize', e.target.value)} />
        </div>
        {numField('buildingSqm', 'พื้นที่ใช้สอย', 'ตร.ม.')}

        <div className="fs"><div className="fs-t">มูลค่าและภาษี</div></div>
        <div className="field">
          <label>มูลค่าสัญญา (Lump Sum, ก่อน VAT)</label>
          <input type="number" value={String(f.contractAmount)} disabled={locked}
            onChange={(e) => set('contractAmount', Number(e.target.value) || 0)} />
          <div className="hintline">({bahtText(f.contractAmount)})</div>
        </div>
        <div className="field">
          <label>ภาษีมูลค่าเพิ่ม / หัก ณ ที่จ่าย (%)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={String(f.vatPct)} disabled={locked} onChange={(e) => set('vatPct', Number(e.target.value) || 0)} />
            <input type="number" value={String(f.whtPct)} disabled={locked} onChange={(e) => set('whtPct', Number(e.target.value) || 0)} />
          </div>
          <div className="hintline">0 = ไม่รวม VAT / ไม่หัก ณ ที่จ่าย (ตามฟอร์มสัญญาข้อ 6.2–6.3)</div>
        </div>

        <div className="fs"><div className="fs-t">ระยะเวลาและเงื่อนไข</div></div>
        {numField('buildDays', 'ระยะเวลาก่อสร้าง', 'วัน')}
        {numField('extendDays', 'ขยายเวลาได้ไม่น้อยกว่า', 'วัน')}
        {numField('startWithinDays', 'เริ่มงานภายใน', 'วัน หลังลงนาม')}
        {numField('payWithinDays', 'ชำระงวดภายใน', 'วัน หลังตรวจรับ')}
        {numField('penaltyPerDay', 'ค่าปรับล่าช้า', 'บาท/วัน')}
        {numField('warrantyYears', 'รับประกันผลงาน', 'ปี')}
        <div className="field">
          <label>เวลาทำงาน</label>
          <input value={f.workHours} disabled={locked} placeholder="08.00 น. ถึง 21.00 น." onChange={(e) => set('workHours', e.target.value)} />
        </div>
        <div className="field">
          <label>วันลงนาม / วันกำหนดแล้วเสร็จ</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={f.signDate} disabled={locked} onChange={(e) => set('signDate', e.target.value)} />
            <input type="date" value={f.dueDate} disabled={locked} onChange={(e) => set('dueDate', e.target.value)} />
          </div>
        </div>

        <div className="fs"><div className="fs-t">งวดงาน (ข้อ 6)</div></div>
        <div className="field full">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {f.installments.map((it, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', fontWeight: 700 }}>6.1.{i + 1}</span>
                  <input value={it.title} disabled={locked} placeholder="ชื่องวด เช่น งานฐานราก"
                    onChange={(e) => setInst(i, { title: e.target.value })} style={{ flex: 1 }} />
                  <input type="number" value={String(it.amount)} disabled={locked} style={{ width: 140 }}
                    onChange={(e) => setInst(i, { amount: Number(e.target.value) || 0 })} />
                  {!locked && (
                    <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }}
                      onClick={() => setF((o) => ({ ...o, installments: o.installments.filter((_, n) => n !== i) }))}>ลบ</button>
                  )}
                </div>
                {it.subs.map((sb, m) => (
                  <div key={m} style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 26 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>6.1.{i + 1}.{m + 1}</span>
                    <input value={sb.title} disabled={locked} placeholder="เช่น วัสดุเข้างาน" style={{ flex: 1 }}
                      onChange={(e) => setInst(i, { subs: it.subs.map((x, n) => (n === m ? { ...x, title: e.target.value } : x)) })} />
                    <input type="number" value={String(sb.amount)} disabled={locked} style={{ width: 140 }}
                      onChange={(e) => setInst(i, { subs: it.subs.map((x, n) => (n === m ? { ...x, amount: Number(e.target.value) || 0 } : x)) })} />
                    {!locked && (
                      <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }}
                        onClick={() => setInst(i, { subs: it.subs.filter((_, n) => n !== m) })}>ลบ</button>
                    )}
                  </div>
                ))}
                <textarea value={it.note} disabled={locked} placeholder="รายละเอียดงวด (ไม่บังคับ)" rows={2}
                  onChange={(e) => setInst(i, { note: e.target.value })} />
                {!locked && (
                  <div>
                    <button type="button" className="btn btn-sm"
                      onClick={() => setInst(i, { subs: [...it.subs, { title: '', amount: 0 }] })}>+ แตกงวดย่อย</button>
                  </div>
                )}
              </div>
            ))}
            {!locked && (
              <button type="button" className="btn"
                onClick={() => setF((o) => ({ ...o, installments: [...o.installments, { title: '', amount: 0, note: '', subs: [] }] }))}>+ เพิ่มงวด</button>
            )}
            <div className="hintline" style={{ fontSize: 12.5 }}>
              รวมงวดงาน ฿{money(instTotal)} · มูลค่าสัญญา ฿{money(f.contractAmount)}
              {diff !== 0 && <b style={{ color: '#b0281c' }}> · ต่างกัน {diff > 0 ? '+' : ''}{money(diff)} บาท</b>}
            </div>
          </div>
        </div>

        <div className="fs"><div className="fs-t">ขอบเขตงานและการรับประกัน</div></div>
        <div className="field full">
          <label>งานที่รวมในงานเหมา — คุณสมบัติวัสดุ (ข้อ 1.1.3)</label>
          <textarea rows={8} value={f.scopeIncluded} disabled={locked} onChange={(e) => set('scopeIncluded', e.target.value)} />
        </div>
        <div className="field full">
          <label>งานที่ไม่รวมในงานเหมา (ข้อ 1.1.4)</label>
          <textarea rows={4} value={f.scopeExcluded} disabled={locked} onChange={(e) => set('scopeExcluded', e.target.value)} />
        </div>
        <div className="field full">
          <label>เงื่อนไขการรับประกันเพิ่มเติม (ข้อ 7.1)</label>
          <textarea rows={4} value={f.warrantyText} disabled={locked} onChange={(e) => set('warrantyText', e.target.value)} />
        </div>
        <div className="field full">
          <label>หมายเหตุท้ายสัญญา</label>
          <textarea rows={3} value={f.note} disabled={locked} onChange={(e) => set('note', e.target.value)} />
        </div>

        <div className="fs"><div className="fs-t">สถานะ</div></div>
        <div className="field">
          <label>สถานะสัญญา</label>
          <select value={f.status} disabled={locked} onChange={(e) => save({ status: e.target.value })}>
            {CONTRACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="hintline">เลือก &quot;ลงนามแล้ว&quot; เมื่อเซ็นสัญญาจริงแล้ว — หลังจากนั้นแก้ได้เฉพาะเจ้าของ/ผู้ดูแลระบบ</div>
        </div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          {admin && <button type="button" className="btn" style={{ color: '#b0281c' }} disabled={busy} onClick={remove}>🗑 ลบร่างสัญญา</button>}
        </div>
      </div>
    </div>
  )
}
