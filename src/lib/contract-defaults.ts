/**
 * ค่าตั้งต้นของสัญญาที่เดาจากข้อมูลที่มีอยู่แล้ว (ใบเสนอราคา + ลูกค้า) เพื่อไม่ต้องกรอกซ้ำ
 * ใช้ทั้งตอนสร้างสัญญาใหม่ และตอนเปิดสัญญาเก่าที่ช่องยังว่าง — แก้ทับได้ทุกช่องในหน้าร่างสัญญา
 * ไม่ import อะไรจาก db เพื่อให้ฝั่งหน้าจอเรียกใช้ได้ด้วย
 */

/** ที่ตั้งโครงการถือว่าครบเมื่อมีทั้งตำบลและอำเภอ — จังหวัดอย่างเดียวที่ระบบเติมให้ไม่นับ */
export const siteComplete = (s: string | null | undefined) => !!s && /ตำบล|ต\./.test(s) && /อำเภอ|อ\.|เขต/.test(s)

/**
 * ที่ตั้งโครงการ: ที่กรอกไว้ที่ลูกค้าก่อน → ที่อยู่ที่พิมพ์ไว้บนใบเสนอราคา → จังหวัดนำไว้ให้อ่านเป็นที่อยู่
 * ที่อยู่บนใบเสนอราคาใช้ทั้งที่พิมพ์มา แม้ไม่มีตำบล/อำเภอ — เป็นข้อมูลที่ทีมกรอกเองแล้ว ไม่ควรให้กรอกซ้ำในสัญญา
 */
export function defaultSite(cust: { siteAddress?: string | null; province?: string | null } | null, quoteAddress: string | null | undefined) {
  if (cust?.siteAddress) return cust.siteAddress
  const qa = (quoteAddress || '').trim()
  if (qa) return qa
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

/** ชื่อที่ขึ้นต้นแบบนิติบุคคล — ผู้ลงนามต้องเป็นกรรมการ ไม่ใช่ชื่อบริษัท จึงเดาให้ไม่ได้ */
const COMPANY = /^(บริษัท|บจก|บมจ|หจก|ห\.จ\.ก|ห้างหุ้นส่วน|ร้าน)/

/**
 * ผู้ลงนามฝ่ายผู้ว่าจ้าง: ลูกค้าบุคคลธรรมดาเซ็นเอง ใช้ชื่อลูกค้าได้เลย
 * ลูกค้าที่เป็นบริษัทต้องกรอกชื่อกรรมการผู้มีอำนาจ ปล่อยว่างให้กรอก
 */
export function defaultEmployerSigner(name: string | null | undefined) {
  const s = (name || '').trim()
  return s && !COMPANY.test(s) ? s : null
}

/** วันกำหนดแล้วเสร็จ = วันลงนาม + ระยะเวลาก่อสร้างจากใบเสนอราคา (YYYY-MM-DD) */
export function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
