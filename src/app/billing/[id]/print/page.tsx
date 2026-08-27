import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { billingDocs, billingDocItems, billingDocImages, projects, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { n0, bahtText } from '@/lib/biz'
import { fmtPhone } from '@/lib/format'
import { billKindMeta } from '@/lib/constants'
import PrintToolbar from '../../../quotes/[id]/print/toolbar'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const thd = (s: string | null | undefined) => {
  if (!s) return ''
  const p = s.split('-')
  return `${+p[2]}/${+p[1]}/${+p[0] + 543}`
}

export default async function BillingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me || !me.active) redirect('/sign-in')
  const id = Number((await params).id)
  const db = getDb()

  const [doc] = await db.select().from(billingDocs).where(eq(billingDocs.id, id)).limit(1)
  if (!doc) notFound()
  const [[p], items, images, settings] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, doc.projectId)).limit(1),
    db.select().from(billingDocItems).where(eq(billingDocItems.docId, id)),
    db.select({ id: billingDocImages.id, url: billingDocImages.url })
      .from(billingDocImages).where(eq(billingDocImages.docId, id)).orderBy(billingDocImages.id),
    getSettings(),
  ])
  const creator = doc.createdBy ? (await db.select().from(users).where(eq(users.id, doc.createdBy)).limit(1))[0] : null
  const invoiceRef = doc.invoiceRefId ? (await db.select().from(billingDocs).where(eq(billingDocs.id, doc.invoiceRefId)).limit(1))[0] : null

  const km = billKindMeta(doc.kind)
  const isInvoice = doc.kind === 'invoice'
  const isTax = doc.kind === 'taxReceipt'
  const cancelled = doc.status === 'ยกเลิก'
  const sorted = [...items].sort((a, b) => a.seq - b.seq)

  const infoL: [string, string][] = [
    ['ชื่อลูกค้า', doc.custName || ''],
    ['ที่อยู่', doc.custAddress || ''],
    ['เบอร์โทรติดต่อ', doc.custPhone ? fmtPhone(doc.custPhone) : ''],
    ['เลขประจำตัวผู้เสียภาษี', doc.custTaxId || ''],
    ['โครงการ', p ? `${p.name} (${p.code})` : ''],
  ]
  const infoR: [string, string][] = [
    ['เลขที่เอกสาร', doc.code],
    ['วันที่ออกเอกสาร', thd(doc.issueDate)],
    ...(isInvoice
      ? [['ครบกำหนดชำระ', thd(doc.dueDate)] as [string, string]]
      : [['วันที่รับเงิน', thd(doc.payDate)] as [string, string], ['ชำระโดย', doc.payMethod || ''] as [string, string]]),
    ...(invoiceRef ? [['อ้างอิงใบวางบิล', invoiceRef.code] as [string, string]] : []),
    ['ผู้ออกเอกสาร', creator?.name || ''],
  ]

  return (
    <div className="qprint">
      <style>{PRINT_CSS}</style>
      <PrintToolbar />
      <div className="page">
        {cancelled && <div className="cancel-stamp">ยกเลิก</div>}
        <div className="doc-title">{km.label}<span className="orig">(ต้นฉบับ)</span></div>
        <div className="head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {settings.logoUrl && <img className="logo" src={settings.logoUrl} alt="" />}
          <div className="co">
            <div className="co-name">{settings.name}</div>
            {settings.address && <div>{settings.address}</div>}
            <div>
              {settings.phone && <>โทร.{settings.phone}</>}
              {settings.lineId && <> , Line ID : {settings.lineId}</>}
              {settings.email && <> , Email : {settings.email}</>}
            </div>
            {settings.taxId && <div>เลขทะเบียนนิติบุคคล{isTax ? '/เลขประจำตัวผู้เสียภาษี' : ''} : {settings.taxId}</div>}
          </div>
        </div>

        <div className="info">
          <table className="info-t"><tbody>
            {infoL.map(([k, v]) => <tr key={k}><td className="k">{k}</td><td>{v}</td></tr>)}
          </tbody></table>
          <table className="info-t pink"><tbody>
            {infoR.map(([k, v]) => <tr key={k}><td className="k">{k}</td><td>{v}</td></tr>)}
          </tbody></table>
        </div>

        <table className="items">
          <thead><tr><th className="w1">ลำดับ</th><th>รายการ</th><th className="w3">จำนวนเงิน (บาท)</th></tr></thead>
          <tbody>
            {sorted.map((i) => (
              <tr key={i.id}><td className="c">{i.seq}</td><td className="pre">{i.description}</td><td className="r">{fmt(n0(i.amount))}</td></tr>
            ))}
            <tr className="sum"><td colSpan={2} className="r b">รวมเงิน</td><td className="r b">{fmt(n0(doc.subtotal))}</td></tr>
          </tbody>
        </table>

        <div className="totals-row">
          <div className="notes">
            <div className="baht-text">( {bahtText(n0(doc.total))} )</div>
            {doc.note && <div className="pre">{doc.note}</div>}
            {cancelled && doc.cancelReason && <div className="red">ยกเลิกเอกสาร: {doc.cancelReason}</div>}
            {isInvoice && (settings.bankPersonal || settings.bankCompany) && (
              <div className="banksmini">
                <div className="b">ช่องทางการชำระเงิน</div>
                {n0(doc.vatAmount) > 0
                  ? settings.bankCompany && <div className="pre">นามบริษัท: {settings.bankCompany}</div>
                  : settings.bankPersonal && <div className="pre">นามบุคคล: {settings.bankPersonal}</div>}
              </div>
            )}
          </div>
          <table className="totals"><tbody>
            <tr><td>รวมเงิน</td><td className="r">{fmt(n0(doc.subtotal))}</td><td>บาท</td></tr>
            {n0(doc.vatAmount) > 0 && <tr><td>ภาษีมูลค่าเพิ่ม {Number(doc.vatPct)}%</td><td className="r">{fmt(n0(doc.vatAmount))}</td><td>บาท</td></tr>}
            {n0(doc.whtAmount) > 0 && <tr><td>หัก ณ ที่จ่าย {Number(doc.whtPct)}%</td><td className="r red">−{fmt(n0(doc.whtAmount))}</td><td>บาท</td></tr>}
            <tr className="grand"><td>{isInvoice ? 'ยอดที่ต้องชำระ' : 'ยอดรับชำระสุทธิ'}</td><td className="r hl2">{fmt(n0(doc.total))}</td><td>บาท</td></tr>
          </tbody></table>
        </div>

        {!isInvoice && doc.payRef && <div className="payref">อ้างอิงการชำระ: {doc.payRef}</div>}

        <div className="signs">
          <div className="sign">
            <div className="sig-space" />
            <div>ลงชื่อ………………………...........………………..{isInvoice ? 'ผู้รับวางบิล' : 'ผู้จ่ายเงิน'}</div>
            <div className="dim">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
            <div className="dim">………../…………………./……………</div>
          </div>
          <div className="sign">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {creator?.signatureUrl ? <img className="sig-img" src={creator.signatureUrl} alt="" /> : <div className="sig-space" />}
            <div>ลงชื่อ………………………...........……………….................</div>
            <div>{settings.name}</div>
            <div>{isInvoice ? 'ผู้วางบิล' : 'ผู้รับเงิน'} {creator?.name || ''}</div>
          </div>
        </div>
      </div>

      {/* ---------- หน้าถัดไป: รูปแนบ (สลิปโอน / หลักฐาน) ---------- */}
      {images.length > 0 && (
        <div className="page attach">
          <div className="attach-h">เอกสารแนบ — {km.label} เลขที่ {doc.code}</div>
          <div className="attach-g">
            {images.map((img) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="att" key={img.id} src={img.url} alt="" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const PRINT_CSS = `
.qprint{background:#777;min-height:100vh;padding:20px 0;font-family:var(--font);color:#111}
.qprint table{min-width:0;width:100%;border-collapse:collapse}
.qprint thead th{position:static;cursor:default;white-space:normal}
.qprint tbody tr:hover td{background:transparent}
.qprint tbody td,.qprint thead th{border-bottom:none;padding:0}
.qprint .page{background:#fff;width:210mm;min-height:148mm;margin:0 auto 18px;padding:12mm 11mm;box-shadow:0 2px 14px rgba(0,0,0,.35);font-size:12.5px;line-height:1.5;position:relative}
.qprint .pre{white-space:pre-wrap}
.qprint .b{font-weight:700}.qprint .c{text-align:center}.qprint .r{text-align:right}
.qprint .red{color:#c00}.qprint .dim{color:#555}
.qprint .doc-title{text-align:right;font-weight:700;font-size:15px}
.qprint .doc-title .orig{display:block;font-weight:400;font-size:10.5px}
.qprint .head{display:flex;gap:14px;align-items:center;margin:4px 0 12px}
.qprint .logo{width:80px;height:80px;object-fit:contain;border-radius:10px;background:#000}
.qprint .co{font-size:11px}
.qprint .co-name{font-size:16px;font-weight:700;margin-bottom:2px}
.qprint .info{display:grid;grid-template-columns:1.5fr 1fr;gap:10px;margin-bottom:12px}
.qprint .info-t{background:#e8e8e8;font-size:11.5px}
.qprint .info-t.pink{background:#f7d9d9}
.qprint .info-t td{padding:3px 8px;vertical-align:top}
.qprint .info-t td.k{font-weight:700;width:42%;white-space:nowrap}
.qprint table.items{font-size:11.5px}
.qprint table.items th,.qprint table.items td{border:1px solid #333;padding:5px 7px;vertical-align:top}
.qprint table.items th{background:#f2c9c9;font-weight:700;text-align:center;color:#111;font-size:11px}
.qprint .w1{width:44px}.qprint .w3{width:120px}
.qprint tr.sum td{background:#fbf3d2}
.qprint .totals-row{display:grid;grid-template-columns:1.3fr 1fr;gap:14px;margin-top:10px;align-items:start}
.qprint .notes{font-size:11.5px;display:flex;flex-direction:column;gap:6px}
.qprint .baht-text{font-weight:700;background:#eee;padding:5px 9px;border-radius:4px}
.qprint .banksmini{font-size:11px}
.qprint table.totals{font-size:12px}
.qprint table.totals td{padding:2.5px 6px}
.qprint table.totals td:first-child{text-align:right}
.qprint table.totals td:last-child{width:34px}
.qprint .hl2{background:#38e838;font-weight:700;text-decoration:underline}
.qprint .grand td{font-weight:700}
.qprint .payref{margin-top:8px;font-size:11.5px}
.qprint .signs{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px;text-align:center;font-size:11.5px}
.qprint .sig-space{height:34px}
.qprint .sig-img{height:34px;object-fit:contain;display:block;margin:0 auto}
.qprint .page.attach{min-height:0}
.qprint .attach-h{font-weight:700;font-size:13px;margin-bottom:8px}
.qprint .attach-g{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.qprint .att{width:100%;max-height:120mm;object-fit:contain;display:block;border:1px solid #ccc}
.qprint .cancel-stamp{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font-size:64px;font-weight:800;color:rgba(200,16,46,.28);border:6px solid rgba(200,16,46,.28);border-radius:14px;padding:6px 30px;pointer-events:none}
.qprint .ptoolbar{position:fixed;top:12px;right:14px;display:flex;gap:8px;z-index:50}
.qprint .ptoolbar button{background:#111;color:#fff;border:none;border-radius:9px;padding:10px 16px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit}
.qprint .ptoolbar button:hover{background:#333}
@media print{
  .qprint{background:#fff;padding:0}
  .qprint .page{box-shadow:none;margin:0;width:auto;min-height:0;page-break-after:always}
  .qprint .page:last-child{page-break-after:auto}
  .qprint .att{break-inside:avoid}
  .qprint .ptoolbar{display:none}
}
@page{size:A4;margin:0}
`
