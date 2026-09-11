/**
 * ค่าตั้งต้นของสัญญาที่เดาจากข้อมูลที่มีอยู่แล้ว (ใบเสนอราคา + ลูกค้า) เพื่อไม่ต้องกรอกซ้ำ
 * ใช้ทั้งตอนสร้างสัญญาใหม่ และตอนเปิดสัญญาเก่าที่ช่องยังว่าง — แก้ทับได้ทุกช่องในหน้าร่างสัญญา
 * ไม่ import อะไรจาก db เพื่อให้ฝั่งหน้าจอเรียกใช้ได้ด้วย
 */

/** ที่ตั้งโครงการถือว่าครบเมื่อมีทั้งตำบลและอำเภอ — จังหวัดอย่างเดียวที่ระบบเติมให้ไม่นับ */
export const siteComplete = (s: string | null | undefined) => !!s && /ตำบล|ต\./.test(s) && /อำเภอ|อ\.|เขต/.test(s)

/**
 * ที่ตั้งโครงการ: ที่กรอกไว้ที่ลูกค้าก่อน → ที่อยู่บนใบเสนอราคาถ้าละเอียดพอ (มีตำบล/อำเภอ) → จังหวัดนำไว้ให้อ่านเป็นที่อยู่
 */
export function defaultSite(cust: { siteAddress?: string | null; province?: string | null } | null, quoteAddress: string | null | undefined) {
  if (cust?.siteAddress) return cust.siteAddress
  if (siteComplete(quoteAddress)) return quoteAddress!.trim()
  return cust?.province ? `จังหวัด${cust.province}` : null
}

/**
 * ชื่อโครงการ: "โครงการก่อสร้าง" + ประเภทธุรกิจของลูกค้า (โกดัง / คลังสินค้า ฯลฯ) แบบเดียวกับที่หน้างานก่อสร้างตั้งชื่องาน
 * ไม่มีประเภทธุรกิจก็ใช้ชื่อลูกค้า จะได้ไม่ต้องขึ้นว่า "(ยังไม่ได้ตั้งชื่อโครงการ)" บนหน้าปก
 */
export function defaultProjectName(cust: { cat?: string | null; name?: string | null; chname?: string | null } | null, quoteCustName?: string | null) {
  if (cust?.cat) return `โครงการก่อสร้าง${cust.cat}`
  const who = quoteCustName || cust?.name || cust?.chname
  return who ? `โครงการก่อสร้าง ${who}` : null
}

/** วันกำหนดแล้วเสร็จ = วันลงนาม + ระยะเวลาก่อสร้างจากใบเสนอราคา (YYYY-MM-DD) */
export function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
