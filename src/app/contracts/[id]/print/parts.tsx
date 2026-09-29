/**
 * ชิ้นส่วนที่สัญญาทุกชนิดใช้ร่วมกัน — ตัวเลขจัดรูป เลขข้อ บล็อกลายเซ็น และ CSS หน้ากระดาษ
 * สัญญาก่อสร้างอยู่ที่ doc.tsx · สัญญาออกแบบอยู่ที่ design.tsx
 */

export const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const int = (n: number) => Math.round(n).toLocaleString('en-US')

export type SubRow = { title: string; amount: number }
export const subsOf = (s: string | null): SubRow[] => {
  if (!s) return []
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** ข้อสัญญาหนึ่งข้อ — เลขข้อเขียนตรง ๆ ให้ตรงฟอร์มจริง (1.1, 6.3.2, …) ไม่พึ่ง counter ของ CSS */
export const Cl = ({ n, children }: { n: string; children: React.ReactNode }) => (
  <div className="cl"><span className="cl-n">{n}</span><div className="cl-b">{children}</div></div>
)

const BLANK = '………../…………………./……………'

/** ลายเซ็นสี่ช่อง: ผู้ว่าจ้าง · ผู้รับจ้าง · พยานฝั่งผู้ว่าจ้าง (เว้นให้กรอกมือ) · พยานฝั่งบริษัท (ชื่อคงที่จากตั้งค่าบริษัท) */
export function SignBlock({ employer, employerSigner, company, signer, witness }: {
  employer: string; employerSigner: string; company: string; signer: string; witness: string
}) {
  return (
    <div className="ct-signs">
      <div>
        <div>ลงชื่อ…………………………………..ผู้ว่าจ้าง</div>
        <div className="b">{employer || '……………………………………'}</div>
        <div>( {employerSigner || '……………............………'} )</div>
        <div>{BLANK}</div>
      </div>
      <div>
        <div>ลงชื่อ…………………..…………..ผู้รับจ้าง</div>
        <div className="b">{company}</div>
        <div>( {signer || '……………………………'} )</div>
        <div>{BLANK}</div>
      </div>
      <div>
        <div>ลงชื่อ…………………………………..พยาน</div>
        <div>( ………………………………… )</div>
        <div>{BLANK}</div>
      </div>
      <div>
        <div>ลงชื่อ…………………………………..พยาน</div>
        <div>( {witness || '…………………………..'} )</div>
        <div>{BLANK}</div>
      </div>
    </div>
  )
}

export type ContractFile = { id: number; name: string; mime: string; url: string; note: string | null }

/**
 * ช่องทางการชำระเงินท้ายสัญญา — ข้อความเฉพาะฉบับถ้ากรอกไว้ ไม่งั้นใช้บัญชีจากตั้งค่าบริษัท
 * ฉบับที่มี VAT ใช้บัญชีบริษัท (ออกใบกำกับได้) ฉบับที่ไม่มีใช้บัญชีบุคคล
 */
export function PayBox({ payTo, vat, bankCompany, bankPersonal }: {
  payTo: string | null; vat: number; bankCompany: string; bankPersonal: string
}) {
  const fallback = vat ? bankCompany || bankPersonal : bankPersonal || bankCompany
  const text = (payTo || '').trim() || fallback
  if (!text) return null
  return (
    <div className="paybox">
      <div className="pay-t">ช่องทางการชำระเงิน</div>
      <div className="pre">{text}</div>
      <div className="pay-n">ผู้ว่าจ้างโอนเงินตามงวดเข้าบัญชีข้างต้น และส่งหลักฐานการโอนให้ผู้รับจ้างทุกครั้ง</div>
    </div>
  )
}

/**
 * เอกสารแนบท้ายสัญญา — รูปพิมพ์เต็มหน้าเรียงต่อกัน ส่วน PDF ลงเป็นรายชื่อ (ฝังในหน้าพิมพ์ไม่ได้ ส่งแยกเป็นไฟล์)
 * ไม่มีไฟล์แนบก็ไม่ขึ้นหน้านี้เลย
 */
export function AttachmentPages({ files }: { files: ContractFile[] }) {
  if (!files.length) return null
  const images = files.filter((f) => f.mime.startsWith('image/'))
  const docs = files.filter((f) => !f.mime.startsWith('image/'))
  return (
    <div className="page flow">
      <h3 className="doc-h">เอกสารแนบท้ายสัญญา</h3>
      <ol className="att-list">
        {files.map((f) => (
          <li key={f.id}>{f.name}{f.note ? ` — ${f.note}` : ''}{f.mime.startsWith('image/') ? '' : ' (ส่งเป็นไฟล์แยก)'}</li>
        ))}
      </ol>
      {docs.length > 0 && images.length === 0 && (
        <p className="ind">เอกสารข้างต้นถือเป็นส่วนหนึ่งของสัญญาฉบับนี้</p>
      )}
      {images.map((f) => (
        <figure className="att" key={f.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={f.name} />
          <figcaption>{f.name}{f.note ? ` — ${f.note}` : ''}</figcaption>
        </figure>
      ))}
    </div>
  )
}

export const CONTRACT_CSS = `
.ctr{background:#777;min-height:100vh;padding:20px 0;font-family:var(--font);color:#111}
.ctr table{min-width:0;width:100%;border-collapse:collapse}
.ctr tbody tr:hover td{background:transparent}
.ctr tbody td{border-bottom:none;padding:0}
.ctr .page{background:#fff;width:210mm;min-height:290mm;margin:0 auto 18px;padding:16mm 18mm;box-shadow:0 2px 14px rgba(0,0,0,.35);font-size:13px;line-height:1.75;position:relative}
.ctr .orig{position:absolute;top:8mm;right:18mm;font-weight:700;font-size:12px}
/* หน้าที่ไหลต่อเนื่อง: บนจอเป็นแผ่นยาวแผ่นเดียว ตอนพิมพ์เบราว์เซอร์ตัดเป็นหลายแผ่นเอง */
.ctr .page.flow{min-height:0}
.ctr .b{font-weight:700}.ctr .r{text-align:right}.ctr .red{color:#c00}.ctr .pre{white-space:pre-wrap}
/* หน้าปก: สัดส่วนตามฟอร์มจริง — โลโก้บน ชื่อสัญญาใหญ่ ที่อยู่บริษัทตัวหนา แล้วเว้นลงมาวางชื่อโครงการ/ผู้ว่าจ้าง/ที่ตั้ง ที่ราวสามส่วนสี่ของหน้า */
.ctr .cover{text-align:center;padding-top:22mm}
.ctr .cover .logo{width:160px;height:160px;object-fit:contain;border-radius:14px;background:#000;margin:0 auto 22px;display:block}
.ctr .cover h1{font-size:33px;font-weight:800;margin:0 0 16px;letter-spacing:.01em}
.ctr .cover h2{font-size:23px;font-weight:700;margin:0 0 22px}
.ctr .cv-line{font-size:15.5px;font-weight:700;margin-bottom:9px}
.ctr .cv-project{margin-top:42mm;display:flex;flex-direction:column;gap:16px}
.ctr .cv-project .big{font-size:23px}
.ctr .doc-h{text-align:center;font-size:19px;font-weight:800;margin:0 0 16px}
.ctr .cl-h{font-weight:700;font-size:14px;margin:16px 0 6px;break-after:avoid;page-break-after:avoid}
.ctr p.ind{margin:0 0 10px;text-indent:2em;text-align:justify}
/* ข้อสัญญาเป็นบล็อกธรรมดา เว้นซ้ายให้เลขข้อลอยอยู่ — ห้ามใช้ flex เพราะเบราว์เซอร์ตัดหน้ากลาง flex ไม่ได้
   ข้อยาว (เช่น 1.1 ที่ซ้อนสเปคทั้งกล่อง) จะถูกดันไปแผ่นใหม่ทั้งก้อน เหลือช่องว่างเกือบทั้งหน้า */
.ctr .cl{position:relative;padding-left:2.9em;margin-bottom:8px;text-align:justify}
.ctr .cl-n{position:absolute;left:0;top:0;font-weight:600}
.ctr .cl-b{display:block;min-width:0}
.ctr .cl .cl{margin-top:6px}
.ctr .box{border:1px solid #999;background:#fafafa;padding:8px 11px;margin:6px 0 2px;font-size:12.5px;line-height:1.6}
.ctr .hl-red{color:#c00;font-weight:700;margin:10px 0;text-align:center}
.ctr table.inst{margin:6px 0 4px;font-size:13px;line-height:1.9}
.ctr table.inst td{vertical-align:top;padding:3px 6px}
.ctr table.inst td.no{width:52px;white-space:nowrap}
.ctr table.inst td.amt{width:250px;text-align:right;white-space:nowrap}
.ctr table.inst tr.inst-main td{padding-top:8px}
.ctr table.inst .mark{background:#f6e83a;padding:0 4px;font-weight:700}
.ctr table.inst .pct{color:#555;font-size:11.5px}
/* งวดย่อย: เยื้องเข้าใต้ชื่องวดหลัก ตัวแดงทั้งแถวเหมือนฟอร์ม ยอดอยู่คอลัมน์ขวาเดียวกับงวดหลัก */
.ctr table.inst tr.sub td{color:#c00;padding-top:0;padding-bottom:0}
.ctr table.inst tr.sub td:nth-child(2){padding-left:44px}
.ctr table.inst .inote{color:#555;font-size:11.5px;line-height:1.5;padding-top:0;padding-bottom:6px}
.ctr table.inst tr.sum td{background:#fbf3d2;padding:6px;font-weight:700}
.ctr .star{text-align:center;font-weight:700;margin:8px 0 12px}
/* ช่องทางชำระเงินท้ายสัญญา — กรอบเข้มให้เห็นชัด ไม่ให้ถูกตัดคนละหน้ากับลายเซ็น */
.ctr .paybox{border:1.5px solid #111;padding:9px 13px;margin:14px 0 4px;font-size:12.5px;line-height:1.7;break-inside:avoid;page-break-inside:avoid}
.ctr .paybox .pay-t{font-weight:700;font-size:13.5px;margin-bottom:3px}
.ctr .paybox .pay-n{color:#555;font-size:11.5px;margin-top:5px}
/* หน้าแนบท้าย: รูปหนึ่งใบต่อหนึ่งบล็อก สูงไม่เกินราวครึ่งหน้ากระดาษเพื่อให้คำบรรยายอยู่หน้าเดียวกัน */
.ctr .att-list{margin:0 0 14px;padding-left:1.5em;line-height:1.9}
.ctr figure.att{margin:0 0 14px;text-align:center;break-inside:avoid;page-break-inside:avoid}
.ctr figure.att img{max-width:100%;max-height:150mm;object-fit:contain;border:1px solid #ccc}
.ctr figure.att figcaption{font-size:11.5px;color:#444;margin-top:5px}
/* กันบล็อกลายเซ็นถูกผ่าครึ่งคนละหน้า เผื่อกรณีที่ย่อจนสุดเพดานแล้วยังไม่พอ */
.ctr .ct-signs{display:grid;grid-template-columns:1fr 1fr;gap:26px 20px;margin-top:30px;text-align:center;font-size:12.5px;line-height:2;break-inside:avoid;page-break-inside:avoid}
/* กันช่องลายเซ็นแต่ละช่องถูกผ่าเองด้วย — เบราว์เซอร์บางตัวไม่สนใจ break-inside ที่ตัว grid แต่สนใจที่ลูก */
.ctr .ct-signs>div{break-inside:avoid;page-break-inside:avoid}
.ctr .ptoolbar{position:fixed;top:12px;right:14px;display:flex;gap:8px;align-items:flex-start;z-index:50;flex-wrap:wrap;justify-content:flex-end}
.ctr .ptoolbar button{background:#111;color:#fff;border:none;border-radius:9px;padding:10px 16px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit}
.ctr .ptoolbar button:hover{background:#333}
.ctr .ptoolbar button.line{background:#06c755}
.ctr .ptoolbar button.line:hover{background:#05a948}
.ctr .ptoolbar .pmsg{background:#fff;color:#111;border-radius:9px;padding:8px 12px;font-size:12.5px;max-width:340px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.ctr .ptoolbar .pmsg.err{background:#ffe2e0;color:#8f2018}
.ctr .ptoolbar .pshare{background:#fff;color:#111;border-radius:11px;padding:11px 12px;width:330px;font-size:12.5px;line-height:1.5;text-align:left;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 12px rgba(0,0,0,.35)}
.ctr .ptoolbar .pshare ol.psteps{margin:0;padding-left:1.3em;display:flex;flex-direction:column;gap:5px}
.ctr .ptoolbar .pshare .row{display:flex;gap:6px;flex-wrap:wrap}
.ctr .ptoolbar .pshare button{padding:7px 11px;font-size:12.5px;border-radius:7px}
@media print{
  .ctr{background:#fff;padding:0}
  .ctr .page{box-shadow:none;margin:0;width:auto;min-height:0;page-break-after:always}
  .ctr .page:last-child{page-break-after:auto}
  /* "ต้นฉบับ" ให้ขึ้นทุกแผ่นเหมือนฟอร์ม — position:fixed ตอนพิมพ์จะถูกวาดซ้ำทุกหน้า */
  .ctr .orig{position:fixed;top:8mm;right:18mm}
  .ctr table.inst tr{break-inside:avoid;page-break-inside:avoid}
  .ctr .box{break-inside:auto}
  .ctr .ptoolbar{display:none}
}
@page{size:A4;margin:0}
`
