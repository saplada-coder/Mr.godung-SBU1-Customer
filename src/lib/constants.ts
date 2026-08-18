// ค่าคงที่ที่ใช้ร่วมกันทั้งฝั่ง server และ client (workflow การขายของ Mr.โกดัง)

export const BUS = ['BU1', 'BU2', 'BU3', 'BU4', 'BU5', 'BU6', 'BU7'] as const
export type Bu = (typeof BUS)[number]

export const BU_NAMES: Record<Bu, string> = {
  BU1: 'BU1 · กลาง กรุงเทพฯ',
  BU2: 'BU2 · ใต้บน',
  BU3: 'BU3 · ใต้ล่าง',
  BU4: 'BU4 · ใต้ 3 จชต.',
  BU5: 'BU5 · นคร-สุราษฎร์',
  BU6: 'BU6 · เหนือ',
  BU7: 'BU7 · อีสาน',
}

/** เรตราคาเริ่มต้น (บาท/ตร.ม.) — วิเคราะห์จากใบเสนอราคาเดิม; แก้ได้ในตาราง bu_rates */
export const DEFAULT_RATES: Record<Bu, number> = {
  BU1: 7000, BU2: 6500, BU3: 5500, BU4: 5500, BU5: 5500, BU6: 5500, BU7: 5500,
}

/** สถานะติดตาม 11 ขั้น + สี + กลุ่ม flow */
export const STAGES = [
  { k: 'ลูกค้าใหม่ – รอติดต่อ', c: '#b58600', b: '#fbeec0', g: 'ก่อนเสนอราคา' },
  { k: 'กำลังติดต่อ – ขอรายละเอียด', c: '#c2610a', b: '#fbe6d2', g: 'ก่อนเสนอราคา' },
  { k: 'รอลูกค้าตอบกลับ', c: '#c0399a', b: '#f7dcef', g: 'ก่อนเสนอราคา' },
  { k: 'นัด Zoom / ดูหน้างาน', c: '#2563c9', b: '#d9e8fb', g: 'นัดหมาย' },
  { k: 'รอลูกค้าตัดสินใจ', c: '#4338ca', b: '#dfdefa', g: 'หลังเสนอราคา' },
  { k: 'ต่อรอง / แก้ไขแบบ-ราคา', c: '#8b2fb5', b: '#eeddf7', g: 'หลังเสนอราคา' },
  { k: 'คาดว่าจะได้งาน', c: '#3f8f3a', b: '#dcedd2', g: 'หลังเสนอราคา' },
  { k: 'รอเซ็นสัญญา / มัดจำ', c: '#20409a', b: '#dce3f5', g: 'ปิดการขาย' },
  { k: 'ปิดงาน (ได้งาน)', c: '#5f6b76', b: '#e9ebee', g: 'ปิดการขาย' },
  { k: 'ไม่สนใจ / ปิดไม่ได้', c: '#b0281c', b: '#f4dbd7', g: 'ยุติ' },
  { k: 'ติดต่อไม่ได้', c: '#7a5c4f', b: '#eee4df', g: 'ยุติ' },
] as const
export const LEAD_STATUSES: string[] = STAGES.map((s) => s.k)
export type LeadStatus = (typeof STAGES)[number]['k']

/** สถานะใบเสนอราคา 7 ขั้น + สี */
export const QUOTES = [
  { k: 'ยังไม่ทำใบเสนอราคา', c: '#5f6b76', b: '#e9ebee' },
  { k: 'ขอข้อมูลเพิ่มเติม', c: '#b58600', b: '#fbeec0' },
  { k: 'รอทำใบเสนอราคา', c: '#c2610a', b: '#fbe6d2' },
  { k: 'สร้างใบเสนอราคาแล้ว', c: '#2563c9', b: '#d9e8fb' },
  { k: 'รอตรวจใบเสนอราคา', c: '#4338ca', b: '#dfdefa' },
  { k: 'ส่งใบเสนอราคาแล้ว', c: '#3f8f3a', b: '#dcedd2' },
  { k: 'ลูกค้าขอแก้ไขราคา', c: '#8b2fb5', b: '#eeddf7' },
  { k: 'ยกเลิก', c: '#b0281c', b: '#f4dbd7' },
] as const
export const QUOTE_STATUSES: string[] = QUOTES.map((q) => q.k)
export type QuoteStatus = (typeof QUOTES)[number]['k']

export const CHANNELS = ['FB : Mr.โกดัง', 'Line OA', 'โทร', 'MD', 'อื่นๆ'] as const

export const ST_APPT = 'นัด Zoom / ดูหน้างาน'
export const ST_WON = 'ปิดงาน (ได้งาน)'
export const ST_SIGN = 'รอเซ็นสัญญา / มัดจำ'
export const ST_NEW = 'ลูกค้าใหม่ – รอติดต่อ'
export const isFinal = (s: string) => s === ST_WON || s === ST_SIGN

export const stMeta = (s: string) =>
  STAGES.find((x) => x.k === s) ?? { k: s, c: '#5f6b76', b: '#e9ebee', g: 'อื่นๆ' }
export const qMeta = (q: string) => QUOTES.find((x) => x.k === q) ?? QUOTES[0]

export const ROLES = ['owner', 'admin', 'sales', 'viewer'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแลระบบ',
  sales: 'ประสานงานขาย',
  viewer: 'ผู้บริหาร (ดูอย่างเดียว)',
}
export const canEdit = (role: Role) => role === 'owner' || role === 'admin' || role === 'sales'
/** สิทธิ์ระดับแอดมินขึ้นไป (ตั้งค่าระบบ, ลบข้อมูล) */
export const isAdminUp = (role: Role) => role === 'owner' || role === 'admin'
/** สิทธิ์จัดการผู้ใช้: เชิญ, เปลี่ยนบทบาท, ตั้งรหัสผ่านใหม่ */
export const canManageUsers = isAdminUp

export const PROVINCES = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท',
  'ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช',
  'นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี',
  'พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต','มหาสารคาม',
  'มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ',
  'สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี',
  'สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี',
] as const

export const CATS = [
  'โกดัง / คลังสินค้า','โรงงาน / การผลิต','อู่ซ่อมรถ / ยานยนต์','สนามกีฬา / ฟิตเนส',
  'ฟาร์ม / เกษตร','ลานจอดรถ / ที่จอด','ให้เช่า / พาณิชย์','อื่นๆ',
] as const

/* ================= ใบเสนอราคา & Budget Control ================= */

/** หมวดต้นทุน 6 หมวด — ใช้ทั้งประมาณการในใบเสนอ งบประมาณ และค่าใช้จ่ายจริง */
export const COST_CATS = [
  { k: 'material', label: 'ค่าวัสดุ', c: '#2563c9' },
  { k: 'labor', label: 'ค่าแรง', c: '#c2610a' },
  { k: 'subcontract', label: 'ผู้รับเหมาช่วง', c: '#8b2fb5' },
  { k: 'equipment', label: 'เครื่องจักร/อุปกรณ์', c: '#3f8f3a' },
  { k: 'transport', label: 'ขนส่ง', c: '#b58600' },
  { k: 'other', label: 'อื่นๆ', c: '#5f6b76' },
] as const
export type CostCat = (typeof COST_CATS)[number]['k']
export const COST_CAT_KEYS: string[] = COST_CATS.map((c) => c.k)

/** หมวดค่าใช้จ่ายสำนักงาน (expenses ที่ไม่ผูกกับงานลูกค้า) */
export const OFFICE_CATS = [
  { k: 'salary', label: 'เงินเดือน / ค่าจ้าง', c: '#2563c9' },
  { k: 'rent', label: 'ค่าเช่า', c: '#8b2fb5' },
  { k: 'utilities', label: 'น้ำ / ไฟ / เน็ต / โทรศัพท์', c: '#c2610a' },
  { k: 'marketing', label: 'การตลาด / โฆษณา', c: '#c0399a' },
  { k: 'office', label: 'อุปกรณ์ / ของใช้สำนักงาน', c: '#3f8f3a' },
  { k: 'other', label: 'อื่นๆ', c: '#5f6b76' },
] as const
export const OFFICE_CAT_KEYS: string[] = OFFICE_CATS.map((c) => c.k)
/** หมวดที่ใช้ได้ในตาราง expenses ทั้งหมด (โครงการ + สำนักงาน) */
export const ALL_EXPENSE_CAT_KEYS: string[] = [...new Set([...COST_CAT_KEYS, ...OFFICE_CAT_KEYS])]
/** หา meta ของหมวด — ค้นทั้งฝั่งโครงการและสำนักงาน */
export const costCatMeta = (k: string) =>
  COST_CATS.find((c) => c.k === k) ?? OFFICE_CATS.find((c) => c.k === k) ?? COST_CATS[5]

/** สถานะเอกสารใบเสนอราคา + สี */
export const QDOCS = [
  { k: 'ร่าง', c: '#5f6b76', b: '#e9ebee' },
  { k: 'รออนุมัติ', c: '#b58600', b: '#fbeec0' },
  { k: 'อนุมัติแล้ว', c: '#2563c9', b: '#d9e8fb' },
  { k: 'ส่งลูกค้าแล้ว', c: '#4338ca', b: '#dfdefa' },
  { k: 'ลูกค้าตกลง', c: '#3f8f3a', b: '#dcedd2' },
  { k: 'ถูกแทนที่', c: '#7a5c4f', b: '#eee4df' },
  { k: 'ยกเลิก', c: '#b0281c', b: '#f4dbd7' },
] as const
export const QDOC_STATUSES: string[] = QDOCS.map((q) => q.k)
export const qdocMeta = (s: string) => QDOCS.find((x) => x.k === s) ?? QDOCS[0]

/** สถานะงานก่อสร้าง + สี */
export const PROJECT_STAGES = [
  { k: 'กำลังก่อสร้าง', c: '#2563c9', b: '#d9e8fb' },
  { k: 'ส่งมอบแล้ว', c: '#8b2fb5', b: '#eeddf7' },
  { k: 'ปิดงาน', c: '#3f8f3a', b: '#dcedd2' },
] as const
export const PROJECT_STATUSES: string[] = PROJECT_STAGES.map((s) => s.k)
export const projMeta = (s: string) => PROJECT_STAGES.find((x) => x.k === s) ?? PROJECT_STAGES[0]

export const EXP_STAGES = [
  { k: 'รออนุมัติ', c: '#b58600', b: '#fbeec0' },
  { k: 'อนุมัติแล้ว', c: '#3f8f3a', b: '#dcedd2' },
  { k: 'ตีกลับ', c: '#b0281c', b: '#f4dbd7' },
] as const
export const expMeta = (s: string) => EXP_STAGES.find((x) => x.k === s) ?? EXP_STAGES[0]

export const INST_WORK = [
  { k: 'รอดำเนินการ', c: '#5f6b76', b: '#e9ebee' },
  { k: 'กำลังทำ', c: '#2563c9', b: '#d9e8fb' },
  { k: 'ส่งมอบแล้ว', c: '#3f8f3a', b: '#dcedd2' },
] as const
export const INST_PAY = [
  { k: 'ยังไม่วางบิล', c: '#5f6b76', b: '#e9ebee' },
  { k: 'วางบิลแล้ว', c: '#b58600', b: '#fbeec0' },
  { k: 'รับเงินแล้ว', c: '#3f8f3a', b: '#dcedd2' },
] as const
export const instWorkMeta = (s: string) => INST_WORK.find((x) => x.k === s) ?? INST_WORK[0]
export const instPayMeta = (s: string) => INST_PAY.find((x) => x.k === s) ?? INST_PAY[0]

/** แม่แบบงวดงานมาตรฐาน 9 งวด (30/10/10/10/10/10/10/5/5) — ตามฟอร์มใบเสนอราคาจริงของบริษัท */
export const DEFAULT_INSTALLMENTS: { title: string; percent: number; detail: string; note: string }[] = [
  { title: 'งวดที่ 1', percent: 30, detail: '- ลงนามในสัญญาออกแบบพร้อมก่อสร้าง\n- มัดจำ เริ่มงานออกแบบ และเตรียมเอกสารแบบแปลน ยื่นขอใบอนุญาตก่อสร้าง\n** ระยะเวลายื่นขออนุญาต 45 วัน ทั้งนี้สามารถเริ่มก่อสร้างได้เลย โดยไม่ต้องรอใบอนุญาต **', note: 'ระยะเวลาขอใบอนุญาต 45 วัน' },
  { title: 'งวดที่ 2', percent: 10, detail: '- มัดจำ เริ่มงานก่อสร้าง\n- เตรียมการเคลียร์พื้นที่ ปรับพื้น ติดตั้งมิเตอร์น้ำไฟชั่วคราว\n- งานวางผัง', note: 'ระยะเวลาก่อสร้าง ตามสัญญา *นับตั้งแต่โอนมัดจำ เริ่มงานก่อสร้าง' },
  { title: 'งวดที่ 3', percent: 10, detail: '- งานโครงสร้างเสาเข็ม และรากฐาน ตอม่อ คาน แล้วเสร็จ', note: '' },
  { title: 'งวดที่ 4', percent: 10, detail: '- งานโครงสร้างพื้นคอนกรีตแล้วเสร็จ', note: '' },
  { title: 'งวดที่ 5', percent: 10, detail: '- งานโครงสร้างเหล็กสำเร็จรูปแล้วเสร็จ', note: '' },
  { title: 'งวดที่ 6', percent: 10, detail: '- งานติดตั้งเมทัลชีทหลังคา แล้วเสร็จ\n- งานติดตั้งเมทัลชีทผนัง แล้วเสร็จ', note: '' },
  { title: 'งวดที่ 7', percent: 10, detail: '- งานติดตั้งประตู หน้าต่าง แล้วเสร็จ\n- งานติดตั้งฝ้าและผนัง แล้วเสร็จ', note: '' },
  { title: 'งวดที่ 8', percent: 5, detail: '- งานห้องสำนักงาน แล้วเสร็จ\n- งานห้องน้ำ , ระบบสุขาภิบาล แล้วเสร็จ', note: '' },
  { title: 'งวดที่ 9', percent: 5, detail: '- งานไฟฟ้า แล้วเสร็จ\n- งานเก็บรายละเอียดทั้งหมด ส่วนอื่นๆที่เหลือทั้งหมด ให้ถูกต้อง ครบถ้วนตามแบบ รายการก่อสร้างและสัญญาทุกประการ , ส่งมอบงาน', note: '' },
]

export const DEFAULT_WARRANTY = '1. รับประกันโครงสร้างอาคาร 2 ปี\n2. รับประกันส่วนงานตกแต่งอื่นๆ 1 ปี\n3. รับประกันเมทัลชีท ผุเป็นรู จากบลูสโคป 10 ปี\n* เงื่อนไขเป็นตามที่บริษัทกำหนด'
export const DEFAULT_EXCLUSIONS = 'ราคาไม่รวมดินถม , มิเตอร์น้ำ มิเตอร์ไฟฟ้าชั่วคราว'
export const DEFAULT_OP_FEE_PCT = 15
export const DEFAULT_PERMIT_DAYS = 45
export const DEFAULT_BUILD_DAYS = 90

/** สิทธิ์อนุมัติ (ใบเสนอราคา/ค่าใช้จ่าย) + ตั้งงบ + ปิดงาน */
export const canApprove = isAdminUp
