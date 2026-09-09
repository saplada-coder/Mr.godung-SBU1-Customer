import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { quotations, quotationItems, quotationInstallments, customers, users } from '@/db/schema'
import { getSettingsFor } from '@/lib/settings'
import { quoteTotals, n0 } from '@/lib/biz'
import { fmtPhone, thDateBE as thd } from '@/lib/format'

/**
 * เอกสารใบเสนอราคาแบบพิมพ์ — ใช้ร่วมกันสองทาง
 * - /quotes/[id]/print  หน้าภายใน ต้องล็อกอิน
 * - /q/[token]          ลิงก์สาธารณะที่ส่งให้ลูกค้าทางไลน์
 * ทั้งสองหน้าเรนเดอร์กระดาษชุดเดียวกัน ต่างกันแค่แถบปุ่มด้านบน
 */

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type QuoteRow = typeof quotations.$inferSelect

/** โหลดทุกอย่างที่กระดาษต้องใช้ จากแถวใบเสนอราคาที่หามาแล้ว (หาด้วย id หรือด้วย share token ก็ได้) */
export async function loadQuoteDoc(q: QuoteRow) {
  const db = getDb()
  const [[cust], items, insts] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, q.customerId)).limit(1),
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, q.id)),
    db.select().from(quotationInstallments).where(eq(quotationInstallments.quotationId, q.id)),
  ])
  // หัวกระดาษใช้ที่อยู่สำนักงานของภูมิภาคลูกค้า (ปทุมธานี / หาดใหญ่ / ภูเก็ต)
  const settings = await getSettingsFor(cust?.bu)
  const creator = q.createdBy ? (await db.select().from(users).where(eq(users.id, q.createdBy)).limit(1))[0] : null
  return { q, cust: cust ?? null, items, insts, settings, creator: creator ?? null }
}

export type QuoteDocData = Awaited<ReturnType<typeof loadQuoteDoc>>

export default function QuoteDoc({ data, toolbar }: { data: QuoteDocData; toolbar?: React.ReactNode }) {
  const { q, cust, items, insts, settings, creator } = data
  const t = quoteTotals(q, items, [])
  // รูปผลงานท้ายใบ: ที่เลือกไว้เฉพาะใบนี้ก่อน — ยังไม่เคยเลือกใช้คลังจากตั้งค่า
  let printImages: string[] = q.includePortfolio ? settings.portfolio : []
  if (q.portfolioJson != null) {
    try { const v = JSON.parse(q.portfolioJson); if (Array.isArray(v)) printImages = v.filter((x) => typeof x === 'string') } catch { /* ใช้ค่า fallback */ }
  }
  const sortedItems = [...items].sort((a, b) => a.seq - b.seq)
  const sortedInsts = [...insts].sort((a, b) => a.seq - b.seq)
  const vatPct = q.vatPct != null ? Number(q.vatPct) : 0

  // ใช้ข้อมูลลูกค้าที่แก้ไว้บนใบก่อน — ไม่มีค่อยถอยไปใช้ข้อมูลจาก CRM
  const cName = q.custName || cust?.name || cust?.chname || ''
  const infoL: [string, string][] = [
    ['รหัสลูกค้า', cust?.code || ''],
    ['ชื่อลูกค้า', cName],
    ['ที่อยู่', q.custAddress || cust?.province || ''],
    ['เบอร์โทรติดต่อ', q.custPhone ? fmtPhone(q.custPhone) : fmtPhone(cust?.phone ?? null)],
    ['เลขประจำตัวผู้เสียภาษี', q.custTaxId || ''],
    ['ผู้ติดต่อ', cName],
  ]
  const infoR: [string, string][] = [
    ['เลขที่เอกสาร', q.code + (q.rev > 1 ? ` (Rev.${q.rev})` : '')],
    ['วันที่ออกเอกสาร', thd(q.issueDate)],
    ['วันที่ตอบรับ', thd(q.acceptedAt)],
    ['ใช้ได้ถึงวันที่', thd(q.validUntil)],
    ['เลขที่อ้างอิง', q.refNo || ''],
    ['พนักงานขาย', creator?.name || ''],
  ]

  const signBlock = (
    <div className="signs">
      <div className="sign">
        <div className="sig-space" />
        <div>ลงชื่อ………………………...........………………..ผู้อนุมัติ</div>
        <div className="dim">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
        <div className="dim">………../…………………./……………</div>
      </div>
      <div className="sign">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {creator?.signatureUrl ? <img className="sig-img" src={creator.signatureUrl} alt="" /> : <div className="sig-space" />}
        <div>ลงชื่อ………………………...........……………….................</div>
        <div>{settings.name}</div>
        <div>ผู้เสนอราคา {creator?.name || ''}</div>
        {settings.phone && <div className="dim">เบอร์โทร {settings.phone.split(',')[0].trim()}</div>}
      </div>
    </div>
  )

  return (
    <div className="qprint">
      {/* ไฟล์นี้จัดหน้าตามฟอร์มใบเสนอราคาจริงของบริษัท — พิมพ์เป็น PDF จากเบราว์เซอร์ได้เลย */}
      <style>{PRINT_CSS}</style>
      {toolbar}

      {/* ---------- หน้า 1: ใบเสนอราคา ---------- */}
      <div className="page">
        <div className="doc-title">ใบเสนอราคา/Quotation<span className="orig">(ต้นฉบับ)</span></div>
        <div className="head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {settings.logoUrl && <img className="logo" src={settings.logoUrl} alt="" />}
          <div className="co">
            <div className="co-name">{settings.name}</div>
            {settings.address && <div>{settings.address}</div>}
            <div>
              {settings.phone && <>โทร.{settings.phone}</>}
              {settings.lineId && <> , Line ID : {settings.lineId}</>}
              {settings.website && <> , {settings.website}</>}
              {settings.email && <> , Email : {settings.email}</>}
            </div>
            {settings.taxId && <div>เลขทะเบียนนิติบุคคล : {settings.taxId}</div>}
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

        <div className="sec-t">รายการประมาณราคาก่อสร้าง</div>
        <table className="items">
          <thead>
            <tr><th className="w1">ลำดับ</th><th>รายการ</th><th className="w2">จำนวน</th><th className="w2">หน่วย</th><th className="w3">ราคาต่อหน่วย</th><th className="w3">ราคารวม</th><th className="w4">หมายเหตุ</th></tr>
          </thead>
          <tbody>
            {sortedItems.map((i) => (
              <tr key={i.id}>
                <td className="c">{i.seq}</td>
                <td className="pre">{i.description}</td>
                <td className="r">{i.qty != null ? Number(i.qty).toLocaleString() : ''}</td>
                <td className="c">{i.unit || ''}</td>
                <td className="r">{i.unitPrice != null ? fmt(Number(i.unitPrice)) : ''}</td>
                <td className="r">{fmt(n0(i.amount))}</td>
                <td className="pre">{i.note || ''}</td>
              </tr>
            ))}
            <tr className="sum"><td colSpan={5} className="r b">รวม</td><td className="r b">{fmt(t.subtotal)}</td><td /></tr>
          </tbody>
        </table>

        <div className="totals-row">
          <div className="notes">
            {q.permitDays != null && <div>ระยะเวลาขอใบอนุญาต <b>{q.permitDays}</b> วัน</div>}
            {q.buildDays != null && <div>ระยะเวลาก่อสร้าง <b>{q.buildDays}</b> วัน</div>}
            {q.exclusions && <div className="red pre">{q.exclusions}</div>}
            {q.warranty && (
              <div className="warranty">
                <div className="b">การรับประกันคุณภาพ Mr.โกดัง</div>
                <div className="pre">{q.warranty}</div>
              </div>
            )}
          </div>
          <table className="totals"><tbody>
            {t.opFee > 0 && <tr><td>ค่าดำเนินการ {Number(q.opFeePct)}%</td><td className="r">{fmt(t.opFee)}</td><td>บาท</td></tr>}
            <tr><td>รวม</td><td className="r">{fmt(t.afterOp)}</td><td>บาท</td></tr>
            {t.discountDesign > 0 && <tr><td>ส่วนลดค่าแบบ</td><td className="r red">{fmt(t.discountDesign)}</td><td>บาท</td></tr>}
            {t.discountBuild > 0 && <tr><td>ส่วนลดค่าก่อสร้าง</td><td className="r red">{fmt(t.discountBuild)}</td><td>บาท</td></tr>}
            <tr><td>รวมทั้งสิ้น</td><td className="r hl">{fmt(t.total)}</td><td>บาท</td></tr>
            <tr><td>vat {vatPct || 7}%</td><td className="r">{vatPct ? fmt(t.vatAmount) : ''}</td><td>บาท</td></tr>
            <tr className="grand"><td>งบประมาณ การก่อสร้าง</td><td className="r hl2">{fmt(t.grand)}</td><td>บาท</td></tr>
          </tbody></table>
        </div>

        {q.spec && (
          <>
            <div className="sec-t">รายการแสดงรายละเอียดสเปค</div>
            <div className="spec pre">{q.spec}</div>
          </>
        )}
        {q.note && <div className="pre note-extra">{q.note}</div>}
        {signBlock}
      </div>

      {/* ---------- หน้า 2: งวดงาน ---------- */}
      {sortedInsts.length > 0 && (
        <div className="page">
          <div className="sec-t big">รายการแสดงการงวดงาน</div>
          <table className="inst-head"><tbody>
            <tr><td className="b">OWNER</td><td className="hl3 b">ค่าก่อสร้าง</td><td className="hl3 r b">{fmt(t.total)}</td><td className="hl3 b">บาท</td></tr>
          </tbody></table>
          <table className="insts">
            <thead>
              <tr><th className="w1">งวดงาน</th><th>รายละเอียดงวดงานก่อสร้าง</th><th className="w5">เปอร์เซ็นต์</th><th className="w6">จำนวนเงิน<br /><small>ไม่รวม Vat {vatPct || 7}%</small></th><th className="w4">หมายเหตุ</th></tr>
            </thead>
            <tbody>
              {sortedInsts.map((i) => (
                <tr key={i.id}>
                  <td className="c">{i.seq}</td>
                  <td><div className="b">{i.title}</div>{i.detail && <div className="pre">{i.detail}</div>}</td>
                  <td className="c">{i.percent != null ? Number(i.percent).toFixed(2) + '%' : ''}</td>
                  <td className="r">{fmt(n0(i.amount))}</td>
                  <td className="pre red small">{i.note || ''}</td>
                </tr>
              ))}
              <tr className="sum">
                <td /><td className="r b">รวม</td>
                <td className="c b">{sortedInsts.reduce((a, i) => a + (i.percent ? Number(i.percent) : 0), 0).toFixed(0)}%</td>
                <td className="r b">{fmt(sortedInsts.reduce((a, i) => a + n0(i.amount), 0))}</td>
                <td className="b small">(ไม่รวม VAT {vatPct || 7}%)</td>
              </tr>
            </tbody>
          </table>

          {(settings.bankPersonal || settings.bankCompany) && (
            <div className="banks">
              <div className="b bank-h">ช่องทางการชำระเงิน</div>
              <div className="bank-cols">
                {settings.bankPersonal && <div><div className="bank-t">นามบุคคล (ไม่รับ vat 7%)</div><div className="pre">{settings.bankPersonal}</div></div>}
                {settings.bankCompany && <div><div className="bank-t">นามบริษัท (รับ vat 7%)</div><div className="pre">{settings.bankCompany}</div></div>}
              </div>
            </div>
          )}
          {signBlock}
        </div>
      )}

      {/* ---------- หน้า 3+: รูปผลงาน ---------- */}
      {printImages.length > 0 && (
        <div className="page">
          {printImages.map((src, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="pf" key={i} src={src} alt="" />
          ))}
        </div>
      )}
    </div>
  )
}

export const PRINT_CSS = `
.qprint{background:#777;min-height:100vh;padding:20px 0;font-family:var(--font);color:#111}
/* ล้างสไตล์ตารางส่วนกลางของแอป (min-width 1180px, sticky header, hover ฯลฯ) ที่ทำให้ตารางทะลุขอบ A4 */
.qprint table{min-width:0;width:100%;border-collapse:collapse}
.qprint thead th{position:static;cursor:default;white-space:normal}
.qprint tbody tr:hover td{background:transparent}
.qprint tbody td,.qprint thead th{border-bottom:none;padding:0}
.qprint table.items th,.qprint table.insts th{color:#111;font-size:11px}
.qprint .page{background:#fff;width:210mm;min-height:290mm;margin:0 auto 18px;padding:12mm 11mm;box-shadow:0 2px 14px rgba(0,0,0,.35);font-size:12.5px;line-height:1.45;position:relative}
.qprint .pre{white-space:pre-wrap}
.qprint .b{font-weight:700}.qprint .c{text-align:center}.qprint .r{text-align:right}
.qprint .red{color:#c00}.qprint .dim{color:#555}.qprint .small{font-size:11px}
.qprint .doc-title{text-align:right;font-weight:700;font-size:14px}
.qprint .doc-title .orig{display:block;font-weight:400;font-size:10.5px}
.qprint .head{display:flex;gap:14px;align-items:center;margin:4px 0 12px}
.qprint .logo{width:88px;height:88px;object-fit:contain;border-radius:10px;background:#000}
.qprint .co{font-size:11px}
.qprint .co-name{font-size:16px;font-weight:700;margin-bottom:2px}
.qprint .info{display:grid;grid-template-columns:1.5fr 1fr;gap:10px;margin-bottom:12px}
.qprint .info-t{width:100%;border-collapse:collapse;background:#e8e8e8;font-size:11.5px}
.qprint .info-t.pink{background:#f7d9d9}
.qprint .info-t td{padding:3px 8px;vertical-align:top}
.qprint .info-t td.k{font-weight:700;width:40%;white-space:nowrap}
.qprint .sec-t{border:1px solid #333;text-align:center;font-weight:700;padding:4px;margin:10px 0 0}
.qprint .sec-t.big{font-size:14px}
.qprint table.items,.qprint table.insts{width:100%;border-collapse:collapse;font-size:11.5px}
.qprint table.items th,.qprint table.items td,.qprint table.insts th,.qprint table.insts td{border:1px solid #333;padding:4px 6px;vertical-align:top}
.qprint table.items th,.qprint table.insts th{background:#f2c9c9;font-weight:700;text-align:center}
.qprint .w1{width:44px}.qprint .w2{width:52px}.qprint .w3{width:88px}.qprint .w4{width:120px}.qprint .w5{width:70px}.qprint .w6{width:100px}
.qprint tr.sum td{background:#fbf3d2}
.qprint .totals-row{display:grid;grid-template-columns:1.3fr 1fr;gap:14px;margin-top:10px;align-items:start}
.qprint .notes{font-size:11.5px;display:flex;flex-direction:column;gap:4px}
.qprint .warranty{background:#cfe3f5;padding:7px 9px;margin-top:6px;font-size:11px}
.qprint table.totals{width:100%;border-collapse:collapse;font-size:12px}
.qprint table.totals td{padding:2.5px 6px}
.qprint table.totals td:first-child{text-align:right}
.qprint table.totals td:last-child{width:34px}
.qprint .hl{background:#dcdcdc;font-weight:700;text-decoration:underline}
.qprint .hl2{background:#38e838;font-weight:700;text-decoration:underline}
.qprint .hl3{background:#f6e83a}
.qprint .grand td{font-weight:700}
.qprint .spec{border:1px solid #333;border-top:none;padding:9px 12px;font-size:11.5px}
.qprint .note-extra{margin-top:8px;font-size:11.5px}
.qprint .signs{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:26px;text-align:center;font-size:11.5px}
.qprint .sig-space{height:34px}
.qprint .sig-img{height:34px;object-fit:contain;display:block;margin:0 auto}
.qprint table.inst-head{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
.qprint table.inst-head td{border:1px solid #333;padding:4px 8px}
.qprint .banks{margin-top:14px;font-size:11.5px}
.qprint .bank-h{text-align:center;margin-bottom:6px}
.qprint .bank-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.qprint .bank-t{background:#222;color:#fff;font-weight:700;text-align:center;padding:3px;margin-bottom:5px}
.qprint .pf{width:100%;margin-bottom:10mm;display:block}
.qprint .ptoolbar{position:fixed;top:12px;right:14px;display:flex;gap:8px;align-items:center;z-index:50;flex-wrap:wrap;justify-content:flex-end}
.qprint .ptoolbar button{background:#111;color:#fff;border:none;border-radius:9px;padding:10px 16px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit}
.qprint .ptoolbar button:hover{background:#333}
.qprint .ptoolbar button:disabled{opacity:.6;cursor:default}
.qprint .ptoolbar button.line{background:#06c755}
.qprint .ptoolbar button.line:hover{background:#05a948}
.qprint .ptoolbar .pmsg{background:#fff;color:#111;border-radius:9px;padding:8px 12px;font-size:12.5px;max-width:340px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.qprint .ptoolbar .pmsg.err{background:#ffe2e0;color:#8f2018}
.qprint .ptoolbar .pshare{background:#fff;color:#111;border-radius:11px;padding:11px 12px;width:330px;font-size:12.5px;line-height:1.5;text-align:left;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 12px rgba(0,0,0,.35)}
.qprint .ptoolbar .pshare textarea{width:100%;height:92px;font:inherit;font-size:12px;color:#111;background:#f7f7f7;border:1px solid #ccc;border-radius:7px;padding:7px;resize:none}
.qprint .ptoolbar .pshare ol.psteps{margin:0;padding-left:1.3em;display:flex;flex-direction:column;gap:5px}
.qprint .ptoolbar .pshare .row{display:flex;gap:6px;flex-wrap:wrap}
.qprint .ptoolbar .pshare button{padding:7px 11px;font-size:12.5px;border-radius:7px}
@media print{
  .qprint{background:#fff;padding:0}
  .qprint .page{box-shadow:none;margin:0;width:auto;min-height:0;page-break-after:always}
  .qprint .page:last-child{page-break-after:auto}
  .qprint .ptoolbar{display:none}
}
@page{size:A4;margin:0}
`
