export const commas = (n: number | null | undefined) => Math.round(n || 0).toLocaleString('en-US')
export const fmtB = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + ' พันล้าน' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' ล้าน' : commas(n)
export const Mv = (n: number) => n / 1e6

export const TH_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const TH_MONTHS_FULL = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
/** วันที่แบบเขียนเต็มในสัญญา: "วันที่ 1 เดือน กันยายน พ.ศ. 2569" — ว่างให้เป็นช่องจุดไว้กรอกมือ */
export const thDateContract = (s: string | null | undefined) => {
  if (!s) return 'วันที่ ……… เดือน ……………… พ.ศ. ………'
  const p = s.split('-')
  return `วันที่ ${+p[2]} เดือน ${TH_MONTHS_FULL[+p[1]]} พ.ศ. ${+p[0] + 543}`
}

export const DAY = 864e5
export const toMs = (s: string) => {
  const p = s.split('-')
  return Date.UTC(+p[0], +p[1] - 1, +p[2])
}
export const toStr = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const weekStart = (ms: number) => {
  const w = new Date(ms).getUTCDay()
  return ms - ((w + 6) % 7) * DAY
}
export const thDate = (s: string) => {
  const p = s.split('-')
  return +p[2] + ' ' + TH_MONTHS[+p[1]] + ' ' + p[0]
}
/** วันที่แบบไทย พ.ศ. เช่น 13/8/2569 — รูปแบบที่ใช้บนฟอร์มเอกสารจริง */
export const thDateBE = (s: string | null | undefined) => {
  if (!s) return ''
  const p = s.split('-')
  return `${+p[2]}/${+p[1]}/${+p[0] + 543}`
}
export const daysBetween = (a: number, b: number) => Math.round((b - a) / DAY)

/* ---- จำนวนเงินเป็นตัวหนังสือไทย: 3000000 → "สามล้านบาทถ้วน" (ใช้ในวงเล็บท้ายมูลค่าสัญญา) ---- */
const TH_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const TH_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
const readInt = (s: string): string => {
  // เกินเจ็ดหลักอ่านเป็น "...ล้าน..." ซ้อนกันไปเรื่อย ๆ
  if (s.length > 7) {
    const tail = s.slice(-6)
    return readInt(s.slice(0, -6)) + 'ล้าน' + (Number(tail) ? readInt(tail) : '')
  }
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = +s[i]
    if (!d) continue
    const pos = s.length - i - 1
    if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด'
    else if (pos === 1 && d === 1) out += ''
    else if (pos === 1 && d === 2) out += 'ยี่'
    else out += TH_DIGITS[d]
    out += TH_PLACES[pos]
  }
  return out
}
export const bahtText = (n: number) => {
  const v = Math.abs(Math.round(n * 100) / 100)
  const baht = Math.floor(v)
  const satang = Math.round((v - baht) * 100)
  const head = baht ? readInt(String(baht)) + 'บาท' : 'ศูนย์บาท'
  return (n < 0 ? 'ลบ' : '') + head + (satang ? readInt(String(satang)) + 'สตางค์' : 'ถ้วน')
}

export const fmtPhone = (p: string | null) => {
  const s = (p || '').replace(/\D/g, '')
  if (s.length === 10) return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6)
  if (s.length === 9) return s.slice(0, 2) + '-' + s.slice(2, 5) + '-' + s.slice(5)
  return p || ''
}
