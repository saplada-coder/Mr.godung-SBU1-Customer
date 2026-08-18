'use client'

// ของใช้ร่วมฝั่ง client สำหรับโมดูลใบเสนอราคา & งานก่อสร้าง

export type QuoteItem = { id?: number; seq?: number; description: string; qty: number | null; unit: string | null; unitPrice: number | null; amount: number; note: string | null }
export type QuoteInst = { id?: number; seq?: number; title: string; detail: string | null; percent: number | null; amount: number; note: string | null }
export type QuoteCost = { category: string; amount: number }
export type Quote = {
  id: number; customerId: number; code: string; rev: number; status: string
  issueDate: string; validUntil: string | null; acceptedAt: string | null; refNo: string | null
  opFeePct: number | null; discountDesign: number | null; discountBuild: number | null; vatPct: number | null
  permitDays: number | null; buildDays: number | null
  exclusions: string | null; warranty: string | null; spec: string | null; note: string | null
  includePortfolio: boolean; rejectReason: string | null; sentAt: string | null
  supersededById: number | null; projectId: number | null; createdBy: number | null
  customerName: string | null; customerCode: string | null; bu: string | null; creatorName: string | null
  items: QuoteItem[]; installments: QuoteInst[]
  subtotal: number; opFee: number; total: number; vatAmount: number; grand: number
  costs: QuoteCost[] | null; costTotal: number | null; profit: number | null; profitPct: number | null
}
export type ProjectRow = {
  id: number; code: string; name: string; bu: string; customerId: number; customerName: string | null
  contractAmount: number; status: string; startDate: string | null; dueDate: string | null; closedAt: string | null
  budgetTotal: number; spent: number; pendingAmount: number; pendingCount: number
  received: number; instDone: number; instTotal: number; profit: number
}
export type ExpenseRow = {
  id: number; category: string; description: string; vendor: string | null; amount: number
  expenseDate: string; receiptUrl: string | null; status: string; rejectReason: string | null
  approvedByName: string | null; approvedAt: string | null; createdBy: number | null; createdByName: string | null; createdAt: string
}
export type InstRow = {
  id: number; seq: number; title: string; detail: string | null; percent: number | null; amount: number
  dueDate: string | null; workStatus: string; payStatus: string; paidAt: string | null; paidAmount: number | null; note: string | null
}
export type HistItem = { kind: string; field: string | null; oldValue: string | null; newValue: string | null; at: string; who: string }

/** สรุปยอดใบเสนอราคาฝั่ง client (สูตรเดียวกับ server) */
export function calcTotals(items: { amount: number }[], opFeePct: number, d1: number, d2: number, vatPct: number) {
  const subtotal = items.reduce((a, i) => a + (i.amount || 0), 0)
  const opFee = Math.round(subtotal * (opFeePct || 0) / 100)
  const afterOp = subtotal + opFee
  const total = afterOp - (d1 || 0) - (d2 || 0)
  const vatAmount = Math.round(total * (vatPct || 0) / 100)
  return { subtotal, opFee, afterOp, total, vatAmount, grand: total + vatAmount }
}

/**
 * อ่านไฟล์รูป → data URL โดยย่อ/บีบอัดฝั่งเบราว์เซอร์ (เก็บลง DB ตรงๆ ไม่ต้องมี storage แยก)
 * รูป PNG เล็กๆ (โลโก้/ลายเซ็น) คงชนิดเดิมไว้เพื่อรักษาพื้นหลังโปร่งใส
 */
export async function fileToDataUrl(file: File, maxW = 1400, quality = 0.82): Promise<string> {
  const keepPng = file.type === 'image/png' && file.size <= 250_000
  if (keepPng || (file.size <= 150_000 && file.type.startsWith('image/'))) {
    return await new Promise((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error)
      fr.readAsDataURL(file)
    })
  }
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxW / bmp.width)
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) // กันพื้นโปร่งกลายเป็นดำใน jpeg
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas.toDataURL('image/jpeg', quality)
}

/** ตัวเลือกไฟล์รูป + บีบอัด แล้วส่ง data URL กลับ */
export function pickImage(onPicked: (dataUrl: string) => void, onError?: (m: string) => void) {
  const inp = document.createElement('input')
  inp.type = 'file'; inp.accept = 'image/*'
  inp.onchange = async () => {
    const f = inp.files?.[0]
    if (!f) return
    try {
      const url = await fileToDataUrl(f)
      if (url.length > 850_000) { onError?.('รูปใหญ่เกินไป ลองรูปที่เล็กลง'); return }
      onPicked(url)
    } catch { onError?.('อ่านไฟล์รูปไม่สำเร็จ') }
  }
  inp.click()
}

/* ---------- SVG chart builders (สไตล์เดียวกับกราฟเดิมใน Dashboard) ---------- */

/** กราฟแท่งจับกลุ่ม (งบ vs จ่ายจริง รายหมวด ฯลฯ) */
export function bizGroupedBars(cats: string[], series: { name: string; color: string; vals: number[] }[]) {
  const W = 460, H = 210, padL = 42, padR = 8, padT = 16, padB = 40
  const maxv = Math.max(1, ...series.flatMap((s) => s.vals)) * 1.12
  const iw = W - padL - padR, ih = H - padT - padB, gw = iw / cats.length, bw = Math.min(22, (gw - 12) / series.length)
  const y = (v: number) => padT + ih - (v / maxv) * ih
  const fv = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : String(Math.round(v)))
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`
  for (let g = 0; g <= 4; g++) { const gv = maxv * g / 4, yy = y(gv); s += `<line class="gridline" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/><text class="axis-v" x="${padL - 6}" y="${yy + 3}" text-anchor="end">${fv(gv)}</text>` }
  cats.forEach((c, gi) => {
    const gx = padL + gi * gw
    series.forEach((se, si) => {
      const v = se.vals[gi] || 0, bx = gx + (gw - bw * series.length - 6) / 2 + si * (bw + 3), by = y(v), bh = padT + ih - by
      s += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="2.5" fill="${se.color}"/>`
      if (v > 0) s += `<text class="bar-val" x="${(bx + bw / 2).toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="middle">${fv(v)}</text>`
    })
    // ชื่อหมวดยาว — ตัดขึ้น 2 บรรทัดถ้าเกิน
    const words = c.length > 8 ? [c.slice(0, 8), c.slice(8)] : [c]
    words.forEach((wd, wi) => { s += `<text class="axis" x="${(gx + gw / 2).toFixed(1)}" y="${H - 22 + wi * 11}" text-anchor="middle">${wd}</text>` })
  })
  return s + '</svg>'
}

/** กราฟเส้นสะสม (S-curve): เงินรับเข้า vs จ่ายออก ตามเวลา + เส้นงบ */
export function bizSCurve(
  seriesIn: { t: number; v: number }[], seriesOut: { t: number; v: number }[],
  budget: number, contract: number,
) {
  const W = 460, H = 210, padL = 46, padR = 10, padT = 14, padB = 26
  const all = [...seriesIn, ...seriesOut]
  if (!all.length) return `<svg class="chart" viewBox="0 0 ${W} ${H}"><text class="axis" x="${W / 2}" y="${H / 2}" text-anchor="middle">ยังไม่มีข้อมูลรับ/จ่าย</text></svg>`
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t), t0 + 864e5)
  const maxv = Math.max(budget, contract, ...all.map((p) => p.v), 1) * 1.08
  const iw = W - padL - padR, ih = H - padT - padB
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * iw
  const y = (v: number) => padT + ih - (v / maxv) * ih
  const fv = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : String(Math.round(v)))
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`
  for (let g = 0; g <= 4; g++) { const gv = maxv * g / 4, yy = y(gv); s += `<line class="gridline" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/><text class="axis-v" x="${padL - 6}" y="${yy + 3}" text-anchor="end">${fv(gv)}</text>` }
  const line = (pts: { t: number; v: number }[], color: string) => {
    if (!pts.length) return ''
    const sorted = [...pts].sort((a, b) => a.t - b.t)
    let d = `M ${x(sorted[0].t).toFixed(1)} ${y(0).toFixed(1)}`
    sorted.forEach((p) => { d += ` L ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}` })
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>` +
      sorted.map((p) => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="${color}"/>`).join('')
  }
  if (budget > 0) s += `<line x1="${padL}" y1="${y(budget)}" x2="${W - padR}" y2="${y(budget)}" stroke="#b58600" stroke-width="1.4" stroke-dasharray="5 4"/><text class="axis" x="${W - padR}" y="${y(budget) - 4}" text-anchor="end" fill="#b58600">งบ ${fv(budget)}</text>`
  if (contract > 0) s += `<line x1="${padL}" y1="${y(contract)}" x2="${W - padR}" y2="${y(contract)}" stroke="#3f8f3a" stroke-width="1.4" stroke-dasharray="5 4"/><text class="axis" x="${W - padR}" y="${y(contract) - 4}" text-anchor="end" fill="#3f8f3a">สัญญา ${fv(contract)}</text>`
  s += line(seriesOut, 'var(--accent)')
  s += line(seriesIn, '#2563c9')
  return s + '</svg>'
}

/** สะสมรายวันจากรายการ (date, amount) → จุดกราฟ */
export function cumulative(points: { d: string; v: number }[]): { t: number; v: number }[] {
  const sorted = [...points].filter((p) => p.d).sort((a, b) => (a.d < b.d ? -1 : 1))
  let acc = 0
  const byDay = new Map<string, number>()
  for (const p of sorted) { acc += p.v; byDay.set(p.d, acc) }
  return [...byDay.entries()].map(([d, v]) => ({ t: Date.parse(d), v }))
}
