export const commas = (n: number | null | undefined) => Math.round(n || 0).toLocaleString('en-US')
export const fmtB = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + ' พันล้าน' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' ล้าน' : commas(n)
export const Mv = (n: number) => n / 1e6

export const TH_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

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
export const daysBetween = (a: number, b: number) => Math.round((b - a) / DAY)

export const fmtPhone = (p: string | null) => {
  const s = (p || '').replace(/\D/g, '')
  if (s.length === 10) return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6)
  if (s.length === 9) return s.slice(0, 2) + '-' + s.slice(2, 5) + '-' + s.slice(5)
  return p || ''
}
