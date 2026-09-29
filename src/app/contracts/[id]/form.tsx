'use client'

import { useCallback, useEffect, useState } from 'react'
import { CONTRACT_STATUSES, contractMeta, contractKindMeta, halfSubs, isAdminUp, type Role } from '@/lib/constants'
import { bahtText } from '@/lib/format'
import { siteComplete } from '@/lib/contract-defaults'
import { pickFile, uiConfirm, type PickedFile } from '../../biz-shared'

export type SubRow = { title: string; amount: number }
type Inst = { title: string; percent: number | null; amount: number; note: string; subs: SubRow[] }
export type ContractInit = {
  id: number; code: string; status: string; kind: string
  projectName: string; siteAddress: string; contractorSigner: string; employerSigner: string
  contractAmount: number; vatPct: number; whtPct: number
  projectValue: number; feePct: number; designRevisions: number; creditToBuild: boolean
  buildDays: number; extendDays: number; startWithinDays: number; payWithinDays: number
  penaltyPerDay: number; workHours: string; warrantyYears: number
  buildingSize: string; buildingSqm: number
  scopeIncluded: string; scopeExcluded: string; warrantyText: string; note: string
  payTo: string
  signDate: string; dueDate: string
  installments: Inst[]
}
type Ctx = { quoteCode: string; quoteId: number; employer: string; employerAddr: string; employerTax: string; bankDefault: string }
type CFile = { id: number; name: string; mime: string; url: string; note: string }
type NumKey = 'buildingSqm' | 'buildDays' | 'extendDays' | 'startWithinDays' | 'payWithinDays' | 'penaltyPerDay' | 'warrantyYears' | 'designRevisions'

const money = (n: number) => Math.round(n).toLocaleString('en-US')

export default function ContractForm({ init, ctx, role }: { init: ContractInit; ctx: Ctx; role: Role }) {
  const [f, setF] = useState<ContractInit>(init)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null)
  const admin = isAdminUp(role)
  const locked = f.status === 'ลงนามแล้ว' && !admin
  /** สัญญาออกแบบ: มูลค่าสัญญาคือค่าออกแบบที่คิดจากมูลค่าโครงการ และไม่มีเรื่องวัสดุ/เวลาทำงาน/การรับประกันงานก่อสร้าง */
  const design = f.kind === 'ออกแบบ'
  const kindMeta = contractKindMeta(f.kind)

  /* เอกสารแนบโหลดแยกจากตัวฟอร์ม — data URL ของรูป/PDF ใหญ่เกินกว่าจะฝังมากับหน้า */
  const [files, setFiles] = useState<CFile[] | null>(null)
  const loadFiles = useCallback(async () => {
    const r = await fetch(`/api/contracts/${init.id}/files`)
    const d = await r.json().catch(() => ({}))
    setFiles(r.ok ? d.files : [])
  }, [init.id])
  useEffect(() => { loadFiles() }, [loadFiles])

  const addFile = () => pickFile(async (pf: PickedFile) => {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/contracts/${f.id}/files`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pf),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg({ t: d.error || 'แนบไฟล์ไม่สำเร็จ', err: true }); return }
    setMsg({ t: 'แนบไฟล์แล้ว' }); loadFiles()
  }, (t) => setMsg({ t, err: true }))

  const delFile = async (file: CFile) => {
    if (!await uiConfirm(`ลบเอกสารแนบ "${file.name}" ออกจากสัญญา?`)) return
    const r = await fetch(`/api/contracts/${f.id}/files`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: file.id }),
    })
    if (r.ok) { setMsg({ t: 'ลบเอกสารแนบแล้ว' }); loadFiles() }
    else setMsg({ t: (await r.json().catch(() => ({}))).error || 'ลบไม่สำเร็จ', err: true })
  }

  const set = <K extends keyof ContractInit>(k: K, v: ContractInit[K]) => setF((o) => ({ ...o, [k]: v }))
  const setInst = (i: number, patch: Partial<Inst>) =>
    setF((o) => ({ ...o, installments: o.installments.map((x, n) => (n === i ? { ...x, ...patch } : x)) }))

  const instTotal = f.installments.reduce((a, i) => a + (i.amount || 0), 0)
  const pctTotal = Math.round(f.installments.reduce((a, i) => a + (i.percent || 0), 0) * 100) / 100
  const diff = Math.round(instTotal - f.contractAmount)
  /** ที่ตั้งโครงการต้องมีทั้งตำบลและอำเภอ ไม่ใช่แค่จังหวัดที่ระบบเติมให้ตอนสร้าง */
  const siteIncomplete = !siteComplete(f.siteAddress)

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

  /**
   * ค่าออกแบบ = มูลค่าโครงการ × อัตรา — แก้ช่องใดช่องหนึ่งแล้วยอดสัญญาและทุกงวดขยับตามทันที
   * งวดของสัญญาออกแบบผูกกับ % (30/40/30) จึงคิดบาทใหม่ให้ทั้งชุด ไม่ต้องไล่แก้เอง
   */
  const setFee = (projectValue: number, feePct: number) => setF((o) => {
    const amount = Math.round(projectValue * feePct / 100)
    return {
      ...o, projectValue, feePct, contractAmount: amount,
      installments: o.installments.map((it) => (it.percent == null ? it : { ...it, amount: Math.round(amount * it.percent / 100) })),
    }
  })

  /** แตกงวดที่ 2 เป็นต้นไปเป็นสองครึ่งตามฟอร์ม — งวดที่มีงวดย่อยอยู่แล้วจะถูกทับ จึงถามก่อน */
  const splitHalves = async () => {
    const hasSubs = f.installments.some((it, i) => i > 0 && it.subs.length > 0)
    if (hasSubs && !await uiConfirm('บางงวดมีงวดย่อยอยู่แล้ว — แตกใหม่เป็น 50/50 ทับของเดิมทั้งหมด?')) return
    setF((o) => ({
      ...o,
      installments: o.installments.map((it, i) => (i === 0 ? it : { ...it, subs: halfSubs(it.amount || 0, i + 1) })),
    }))
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
          <h1>ร่าง{kindMeta.title}</h1>
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
          <label>ที่ตั้งโครงการ — ตำบล / อำเภอ / จังหวัด</label>
          <input value={f.siteAddress} disabled={locked} placeholder="เช่น ตำบลคูคต อำเภอลำลูกกา จังหวัดปทุมธานี"
            onChange={(e) => set('siteAddress', e.target.value)} />
          <div className="hintline">
            ดึงจากข้อมูลลูกค้า/ใบเสนอราคา · พิมพ์ออกที่หน้าปกบรรทัดล่างสุดและในข้อ 1
            {siteIncomplete && ' · ยังไม่มีตำบล/อำเภอ — ถ้าทราบเติมได้ที่นี่ หรือใส่ที่ข้อมูลลูกค้าจะได้ใช้กับทุกสัญญาของรายนี้'}
          </div>
        </div>
        <div className="field">
          <label>ผู้ว่าจ้าง (จากใบเสนอราคา)</label>
          <input readOnly value={ctx.employer || '—'} />
          <div className="hintline">ที่อยู่/เลขภาษีดึงจากใบเสนอราคา — แก้ได้ที่ใบเสนอราคา{ctx.employerTax ? ` · เลขภาษี ${ctx.employerTax}` : ''}</div>
        </div>
        <div className="field">
          <label>ผู้ลงนามฝ่ายผู้ว่าจ้าง</label>
          <input value={f.employerSigner} disabled={locked} placeholder="เช่น นายสมชาย ใจดี (กรรมการผู้จัดการ)"
            onChange={(e) => set('employerSigner', e.target.value)} />
          <div className="hintline">ลูกค้าบุคคลระบบใส่ชื่อลูกค้าให้แล้ว · ลูกค้าบริษัทให้ใส่ชื่อกรรมการผู้มีอำนาจ — พิมพ์ในวงเล็บใต้ลายเซ็นผู้ว่าจ้าง</div>
        </div>
        <div className="field">
          <label>ผู้ลงนามฝ่ายผู้รับจ้าง (บริษัท)</label>
          <input value={f.contractorSigner} disabled={locked} placeholder="เช่น นายวิเจน แก้วมณี"
            onChange={(e) => set('contractorSigner', e.target.value)} />
          <div className="hintline">ดึงจาก &quot;ตั้งค่าบริษัท / ใบเสนอราคา&quot; → ผู้มีอำนาจลงนาม ตั้งครั้งเดียวใช้ทุกสัญญา</div>
        </div>
        <div className="field">
          <label>ขนาดอาคาร</label>
          <input value={f.buildingSize} disabled={locked} placeholder="เช่น 11.34*24.96" onChange={(e) => set('buildingSize', e.target.value)} />
        </div>
        {numField('buildingSqm', 'พื้นที่ใช้สอย', 'ตร.ม.')}

        <div className="fs"><div className="fs-t">{design ? 'ค่าออกแบบและภาษี' : 'มูลค่าและภาษี'}</div></div>
        {design ? (
          <>
            <div className="field">
              <label>มูลค่าโครงการ (ฐานคิดค่าออกแบบ)</label>
              <input type="number" value={String(f.projectValue)} disabled={locked}
                onChange={(e) => setFee(Number(e.target.value) || 0, f.feePct)} />
              <div className="hintline">ดึงยอดรวมจากใบเสนอราคา {ctx.quoteCode} — แก้ได้ถ้าตกลงกันคนละยอด</div>
            </div>
            <div className="field">
              <label>อัตราค่าออกแบบ (%) · ค่าออกแบบ</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" step="0.01" style={{ width: 90 }} value={String(f.feePct)} disabled={locked}
                  onChange={(e) => setFee(f.projectValue, Number(e.target.value) || 0)} />
                <input type="number" value={String(f.contractAmount)} disabled={locked}
                  onChange={(e) => set('contractAmount', Number(e.target.value) || 0)} />
              </div>
              <div className="hintline">แก้มูลค่าโครงการหรืออัตรา ระบบคิดค่าออกแบบและทุกงวดใหม่ให้ · ({bahtText(f.contractAmount)})</div>
            </div>
          </>
        ) : (
          <div className="field">
            <label>มูลค่าสัญญา (Lump Sum, ก่อน VAT)</label>
            <input type="number" value={String(f.contractAmount)} disabled={locked}
              onChange={(e) => set('contractAmount', Number(e.target.value) || 0)} />
            <div className="hintline">({bahtText(f.contractAmount)})</div>
          </div>
        )}
        <div className="field">
          <label>ภาษีมูลค่าเพิ่ม / หัก ณ ที่จ่าย (%)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={String(f.vatPct)} disabled={locked} onChange={(e) => set('vatPct', Number(e.target.value) || 0)} />
            <input type="number" value={String(f.whtPct)} disabled={locked} onChange={(e) => set('whtPct', Number(e.target.value) || 0)} />
          </div>
          <div className="hintline">0 = ไม่รวม VAT / ไม่หัก ณ ที่จ่าย (ตามฟอร์มสัญญาข้อ 6.2–6.3)</div>
        </div>

        <div className="fs"><div className="fs-t">ระยะเวลาและเงื่อนไข</div></div>
        {design ? (
          <>
            {numField('buildDays', 'ระยะเวลาออกแบบ', 'วัน')}
            {numField('extendDays', 'ขยายเวลาได้ไม่น้อยกว่า', 'วัน')}
            {numField('payWithinDays', 'ชำระงวดภายใน', 'วัน หลังแจ้งตั้งเบิก')}
            {numField('penaltyPerDay', 'ค่าปรับส่งแบบล่าช้า', 'บาท/วัน')}
            {numField('designRevisions', 'แก้ไขแบบร่างฟรี', 'ครั้ง')}
            <div className="field">
              <label>หักค่าออกแบบคืนถ้าจ้างก่อสร้างต่อ</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
                <input type="checkbox" checked={f.creditToBuild} disabled={locked} style={{ width: 'auto' }}
                  onChange={(e) => set('creditToBuild', e.target.checked)} />
                นำค่าออกแบบที่ชำระแล้วไปหักออกจากค่าก่อสร้างเต็มจำนวน
              </label>
              <div className="hintline">เปิดไว้จะพิมพ์เป็นข้อ 4.4 ในสัญญา — ปิดไว้ถ้าไม่ให้หักคืน</div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
        <div className="field">
          <label>วันลงนาม / {design ? 'วันกำหนดส่งมอบแบบ' : 'วันกำหนดแล้วเสร็จ'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={f.signDate} disabled={locked} onChange={(e) => set('signDate', e.target.value)} />
            <input type="date" value={f.dueDate} disabled={locked} onChange={(e) => set('dueDate', e.target.value)} />
          </div>
        </div>

        <div className="fs">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div className="fs-t">{design ? 'งวดชำระค่าออกแบบ (ข้อ 4)' : 'งวดงาน (ข้อ 6)'}</div>
            {!design && !locked && f.installments.length > 1 && (
              <button type="button" className="btn btn-sm" onClick={splitHalves}>แตกครึ่งตั้งแต่งวดที่ 2</button>
            )}
          </div>
          <div className="hintline">
            {design
              ? 'ค่าออกแบบแบ่งสามงวด: มัดจำ 30% · เสนอแบบร่าง 40% · เขียนแบบเสร็จ 30% — แก้ % ได้ ระบบคิดบาทให้'
              : 'ตามฟอร์มสัญญา งวดที่ 1 เป็นมัดจำก้อนเดียว ตั้งแต่งวดที่ 2 แตกเป็นงวดย่อย N.1 / N.2 อย่างละ 50% (เช่น งวดที่ 2.1, งวดที่ 2.2)'}
          </div>
        </div>
        <div className="field full">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {f.installments.map((it, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', fontWeight: 700 }}>{design ? '4.1' : '6.1'}.{i + 1}</span>
                  <input value={it.title} disabled={locked} placeholder="ชื่องวด เช่น งานฐานราก"
                    onChange={(e) => setInst(i, { title: e.target.value })} style={{ flex: 1 }} />
                  {/* % กับบาทผูกกัน: พิมพ์ % ระบบคิดบาทจากมูลค่าสัญญา · พิมพ์บาท ระบบคิด % กลับให้
                      งวดที่แตกงวดย่อยแล้วไม่โชว์ % ของงวดหลัก — สัญญาอ่านเป็น 50/50 ของงวดย่อยอย่างเดียว ตัวเลขซ้อนกันสองชั้นจะสับสน */}
                  {it.subs.length === 0 && (
                    <>
                      <input type="number" value={it.percent === null ? '' : String(it.percent)} disabled={locked} placeholder="%"
                        title="เปอร์เซ็นต์ของมูลค่าสัญญา" style={{ width: 76 }} step="0.01"
                        onChange={(e) => {
                          const pct = e.target.value === '' ? null : Number(e.target.value)
                          setInst(i, { percent: pct, amount: pct == null ? it.amount : Math.round(f.contractAmount * pct / 100) })
                        }} />
                      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>%</span>
                    </>
                  )}
                  <input type="number" value={String(it.amount)} disabled={locked} style={{ width: 140 }}
                    onChange={(e) => {
                      const amt = Number(e.target.value) || 0
                      setInst(i, { amount: amt, percent: f.contractAmount > 0 ? Math.round(amt / f.contractAmount * 10000) / 100 : it.percent })
                    }} />
                  {!locked && (
                    <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }}
                      onClick={() => setF((o) => ({ ...o, installments: o.installments.filter((_, n) => n !== i) }))}>ลบ</button>
                  )}
                </div>
                {it.subs.map((sb, m) => (
                  <div key={m} style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 26 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{design ? '4.1' : '6.1'}.{i + 1}.{m + 1}</span>
                    <input value={sb.title} disabled={locked} placeholder={`เช่น งวดที่ ${i + 1}.${m + 1}`} style={{ flex: 1 }}
                      onChange={(e) => setInst(i, { subs: it.subs.map((x, n) => (n === m ? { ...x, title: e.target.value } : x)) })} />
                    {/* % ของงวดหลัก — คิดจากบาทตอนแสดง ไม่เก็บแยก จะได้ไม่มีสองตัวเลขที่ขัดกัน
                        พิมพ์ % แล้วระบบคิดบาทให้ และถ้ามี 2 งวดย่อย อีกงวดจะรับส่วนที่เหลือเอง (พิมพ์ 30 → อีกงวดเป็น 70) */}
                    <input type="number" step="0.1" min={0} max={100} disabled={locked || !(it.amount > 0)}
                      title="เปอร์เซ็นต์ของยอดงวดนี้" style={{ width: 70 }}
                      value={it.amount > 0 ? String(Math.round((sb.amount || 0) / it.amount * 1000) / 10) : ''}
                      onChange={(e) => {
                        const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                        const amt = Math.round(it.amount * pct / 100)
                        setInst(i, { subs: it.subs.map((x, n) => n === m ? { ...x, amount: amt }
                          : it.subs.length === 2 ? { ...x, amount: it.amount - amt } : x) })
                      }} />
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>%</span>
                    <input type="number" value={String(sb.amount)} disabled={locked} style={{ width: 140 }}
                      onChange={(e) => setInst(i, { subs: it.subs.map((x, n) => (n === m ? { ...x, amount: Number(e.target.value) || 0 } : x)) })} />
                    {/* ตั้งแต่งวดที่ 2 ชำระ 2 งวดย่อยพอดีตามฟอร์ม — ลบได้เฉพาะเมื่อมีเกิน 2 (กรณีเผลอเพิ่มไว้) */}
                    {!locked && (i === 0 || it.subs.length > 2) && (
                      <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }}
                        onClick={() => setInst(i, { subs: it.subs.filter((_, n) => n !== m) })}>ลบ</button>
                    )}
                  </div>
                ))}
                {it.subs.length > 0 && (() => {
                  // งวดย่อยต้องรวมกันได้เท่ายอดงวดหลัก ไม่งั้นตอนพิมพ์ตัวเลขในสัญญาจะขัดกันเอง
                  const subTotal = it.subs.reduce((a, s) => a + (s.amount || 0), 0)
                  const gap = Math.round((it.amount || 0) - subTotal)
                  return gap === 0
                    ? <div className="hintline" style={{ paddingLeft: 26 }}>งวดย่อยรวม ฿{money(subTotal)} ตรงกับยอดงวด</div>
                    : (
                      <div className="err" style={{ paddingLeft: 26, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        งวดย่อยรวม ฿{money(subTotal)} {gap > 0 ? 'ขาด' : 'เกิน'}ยอดงวดอยู่ ฿{money(Math.abs(gap))}
                        {!locked && (
                          <button type="button" className="btn btn-sm"
                            title="ปรับงวดย่อยสุดท้ายให้รวมกันเท่ายอดงวดพอดี"
                            onClick={() => setInst(i, { subs: it.subs.map((x, n) => (n === it.subs.length - 1 ? { ...x, amount: Math.max(0, (x.amount || 0) + gap) } : x)) })}>
                            ปรับงวดสุดท้ายให้ลงตัว
                          </button>
                        )}
                      </div>
                    )
                })()}
                <textarea value={it.note} disabled={locked} placeholder="รายละเอียดงวด (ไม่บังคับ)" rows={2}
                  onChange={(e) => setInst(i, { note: e.target.value })} />
                {/* งวดที่ 2 ขึ้นไปมี 2 งวดย่อยพอดี — ปุ่มเพิ่มโผล่เฉพาะตอนยังไม่ครบ 2 (เช่น เคยลบออกไว้) ส่วนงวดที่ 1 เพิ่มได้ตามเดิม
                    สัญญาออกแบบไม่แตกงวดย่อย — สามงวดจ่ายก้อนเดียวทุกงวด */}
                {!design && !locked && (i === 0 || it.subs.length < 2) && (
                  <div>
                    <button type="button" className="btn btn-sm"
                      onClick={() => setInst(i, i === 0
                        ? { subs: [...it.subs, { title: '', amount: 0 }] }
                        : { subs: halfSubs(it.amount || 0, i + 1) })}>
                      {i === 0 ? '+ แตกงวดย่อย' : 'แตกเป็น 2 งวดย่อย 50/50'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!locked && (
              <button type="button" className="btn"
                onClick={() => setF((o) => ({ ...o, installments: [...o.installments, { title: '', percent: null, amount: 0, note: '', subs: [] }] }))}>+ เพิ่มงวด</button>
            )}
            <div className="hintline" style={{ fontSize: 12.5 }}>
              รวมงวดงาน ฿{money(instTotal)} ({pctTotal.toFixed(pctTotal % 1 ? 2 : 0)}%) · มูลค่าสัญญา ฿{money(f.contractAmount)}
              {diff !== 0 && <b style={{ color: '#b0281c' }}> · ต่างกัน {diff > 0 ? '+' : ''}{money(diff)} บาท</b>}
            </div>
          </div>
        </div>

        <div className="fs"><div className="fs-t">{design ? 'ขอบเขตงานออกแบบ' : 'ขอบเขตงานและการรับประกัน'}</div></div>
        <div className="field full">
          <label>{design ? 'แบบและเอกสารที่ส่งมอบ (ข้อ 1.1)' : 'งานที่รวมในงานเหมา — คุณสมบัติวัสดุ (ข้อ 1.1.3)'}</label>
          <textarea rows={8} value={f.scopeIncluded} disabled={locked} onChange={(e) => set('scopeIncluded', e.target.value)} />
        </div>
        <div className="field full">
          <label>{design ? 'งานที่ไม่รวมในสัญญาออกแบบ (ข้อ 1.2)' : 'งานที่ไม่รวมในงานเหมา (ข้อ 1.1.4)'}</label>
          <textarea rows={4} value={f.scopeExcluded} disabled={locked} onChange={(e) => set('scopeExcluded', e.target.value)} />
        </div>
        {!design && (
          <div className="field full">
            <label>เงื่อนไขการรับประกันเพิ่มเติม (ข้อ 7.1)</label>
            <textarea rows={4} value={f.warrantyText} disabled={locked} onChange={(e) => set('warrantyText', e.target.value)} />
          </div>
        )}
        <div className="field full">
          <label>หมายเหตุท้ายสัญญา</label>
          <textarea rows={3} value={f.note} disabled={locked} onChange={(e) => set('note', e.target.value)} />
        </div>

        <div className="fs"><div className="fs-t">ช่องทางการชำระเงิน (พิมพ์ท้ายสัญญา)</div></div>
        <div className="field full">
          <label>เลขที่บัญชี / ชื่อบัญชี / ธนาคาร</label>
          <textarea rows={4} value={f.payTo} disabled={locked}
            placeholder={ctx.bankDefault || 'เลขที่บัญชี : …\nชื่อบัญชี : …\nธนาคาร : …'}
            onChange={(e) => set('payTo', e.target.value)} />
          <div className="hintline">
            {ctx.bankDefault
              ? 'เว้นว่างไว้จะใช้บัญชีจาก "ตั้งค่าบริษัท" ตามที่ขึ้นเป็นตัวจาง (เลือกตาม VAT ของสัญญาฉบับนี้) — พิมพ์ทับได้ถ้าฉบับนี้ใช้บัญชีอื่น'
              : 'ยังไม่ได้ตั้งบัญชีรับเงินที่ "ตั้งค่าบริษัท" — พิมพ์ที่นี่ หรือไปตั้งครั้งเดียวให้ใช้ได้ทุกฉบับ'}
          </div>
        </div>

        <div className="fs">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div className="fs-t">เอกสารแนบท้ายสัญญา</div>
            {!locked && (files?.length ?? 0) < 20 && (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={addFile}>📎 แนบรูป / PDF</button>
            )}
          </div>
          <div className="hintline">เช่น โฉนดที่ดิน แปลนร่าง สำเนาบัตรประชาชน — รูปจะพิมพ์ออกเป็นหน้าแนบท้ายสัญญา ส่วน PDF พิมพ์เป็นรายชื่อเอกสารและกดเปิดได้จากที่นี่ (สูงสุด 20 ไฟล์ ไฟล์ละราว 1.5 MB)</div>
        </div>
        <div className="field full">
          {files == null ? (
            <div className="hintline">กำลังโหลดเอกสารแนบ…</div>
          ) : files.length === 0 ? (
            <div className="hintline">ยังไม่มีเอกสารแนบ</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {files.map((file) => (
                <div key={file.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 8, width: 160, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <a href={file.url} target="_blank" rel="noreferrer" download={file.name} style={{ display: 'block' }}>
                    {file.mime.startsWith('image/')
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={file.url} alt={file.name} style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 7, display: 'block' }} />
                      : <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-soft,#f2f2f2)', borderRadius: 7, fontSize: 30 }}>📄</div>}
                  </a>
                  <div style={{ fontSize: 11.5, lineHeight: 1.4, wordBreak: 'break-word' }}>{file.name}</div>
                  {!locked && (
                    <button type="button" className="btn btn-sm" style={{ color: '#b0281c' }} onClick={() => delFile(file)}>ลบ</button>
                  )}
                </div>
              ))}
            </div>
          )}
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
