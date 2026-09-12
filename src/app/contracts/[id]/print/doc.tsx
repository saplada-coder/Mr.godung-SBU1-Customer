import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { contracts, contractInstallments, quotations, customers } from '@/db/schema'
import { getSettingsFor } from '@/lib/settings'
import { n0, num } from '@/lib/biz'
import { bahtText, thDateBE, thDateContract } from '@/lib/format'
import { halfSubs } from '@/lib/constants'
import { defaultProjectName, defaultSite, defaultEmployerSigner, addDays } from '@/lib/contract-defaults'

/**
 * สัญญาว่าจ้างรับเหมาก่อสร้าง — จัดหน้าตามฟอร์มสัญญาจริงของบริษัท
 * ตัวเลข ชื่อคู่สัญญา และงวดงานมาจากตารางสัญญา ส่วนถ้อยคำข้อสัญญาเป็นแม่แบบคงที่
 * แก้ตัวเลขหรือข้อความเฉพาะฉบับได้ที่หน้าร่างสัญญา แล้วกลับมาพิมพ์ใหม่
 */

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (n: number) => Math.round(n).toLocaleString('en-US')

export type SubRow = { title: string; amount: number }
const subsOf = (s: string | null): SubRow[] => {
  if (!s) return []
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** ข้อสัญญาหนึ่งข้อ — เลขข้อเขียนตรง ๆ ให้ตรงฟอร์มจริง (1.1, 6.3.2, …) ไม่พึ่ง counter ของ CSS */
const Cl = ({ n, children }: { n: string; children: React.ReactNode }) => (
  <div className="cl"><span className="cl-n">{n}</span><div className="cl-b">{children}</div></div>
)

/** ชื่องวดย่อยชุดเก่าที่ระบบเคยตั้งให้ — ถือว่าเป็นค่าเริ่มต้นที่ยังไม่มีใครแก้ จึงเปลี่ยนเป็นชื่อชุดใหม่ได้โดยไม่ถามซ้ำ */
const LEGACY_SUB_TITLES = ['วัสดุเข้างาน', 'ติดตั้งเสร็จ']

/**
 * จัดงวดย่อยให้ตรงฟอร์มโดยอัตโนมัติ — งวดที่ 2 ขึ้นไปต้องเป็น "งวดที่ N.1 / N.2" อย่างละ 50%
 * ทำตอนโหลดและเขียนกลับลงฐานข้อมูลเลย ทีมจะได้ไม่ต้องไล่กดปุ่มทุกสัญญาที่ร่างไว้ก่อนกติกานี้
 * แตะเฉพาะสองกรณี: ยังไม่เคยตั้งงวดย่อยเลย (null) หรือมีชุดชื่อเก่าที่ระบบตั้งให้ — งวดที่คนแก้เองไว้ไม่ถูกทับ
 * รวมถึงงวดที่คนตั้งใจลบงวดย่อยออกจนว่าง ซึ่งบันทึกไว้เป็น "[]" ไม่ใช่ null จึงแยกจากกรณีไม่เคยตั้งได้
 */
function normalizedSubs(inst: typeof contractInstallments.$inferSelect, idx: number): string | null {
  if (idx === 0) return inst.subsJson
  if (inst.subsJson == null) return JSON.stringify(halfSubs(n0(inst.amount), idx + 1))
  const cur = subsOf(inst.subsJson)
  const legacy = cur.length === 2 && cur.every((s, m) => s.title === LEGACY_SUB_TITLES[m])
  if (!legacy) return inst.subsJson
  return JSON.stringify(cur.map((s, m) => ({ ...s, title: `งวดที่ ${idx + 1}.${m + 1}` })))
}

export async function loadContract(id: number) {
  const db = getDb()
  const [c] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1)
  if (!c) return null
  const [raw, [q], [cust]] = await Promise.all([
    db.select().from(contractInstallments).where(eq(contractInstallments.contractId, id)),
    db.select().from(quotations).where(eq(quotations.id, c.quotationId)).limit(1),
    db.select().from(customers).where(eq(customers.id, c.customerId)).limit(1),
  ])
  const sorted = [...raw].sort((a, b) => a.seq - b.seq)
  const insts = await Promise.all(sorted.map(async (i, idx) => {
    const subsJson = normalizedSubs(i, idx)
    if (subsJson !== i.subsJson) await db.update(contractInstallments).set({ subsJson }).where(eq(contractInstallments.id, i.id))
    return { ...i, subsJson }
  }))
  // ช่องที่ยังว่างหรือยังไม่ครบในสัญญาเก่า (ร่างก่อนระบบเดาค่าให้) เติมจากใบเสนอราคา/ลูกค้าให้เองตอนเปิด แล้วบันทึกเลย
  // สิ่งที่คนพิมพ์เองไว้แล้วไม่ถูกทับ: ชื่อโครงการที่มีอยู่ ที่ตั้งที่มีตำบล/อำเภอ วันแล้วเสร็จที่กรอกแล้ว
  const settings = await getSettingsFor(cust?.bu)
  const fill: Partial<typeof c> = {}
  if (!c.projectName) { const v = defaultProjectName(cust ?? null, q?.custName); if (v) fill.projectName = v }
  // ที่ตั้งที่เป็นแค่ "จังหวัด…" ที่ระบบเคยเติมให้ ถือว่ายังไม่ได้กรอก — แทนด้วยของจริงจากลูกค้า/ใบเสนอราคาเมื่อมี
  if (!c.siteAddress || /^จังหวัด\S*$/.test(c.siteAddress)) { const v = defaultSite(cust ?? null, q?.custAddress); if (v && v !== c.siteAddress) fill.siteAddress = v }
  if (!c.dueDate && c.signDate && c.buildDays) fill.dueDate = addDays(c.signDate, c.buildDays)
  if (!c.employerSigner) { const v = defaultEmployerSigner(q?.custName || cust?.name || cust?.chname); if (v) fill.employerSigner = v }
  if (!c.contractorSigner && settings.signerName) fill.contractorSigner = settings.signerName
  let contract = c
  if (Object.keys(fill).length) {
    await db.update(contracts).set(fill).where(eq(contracts.id, id))
    contract = { ...c, ...fill }
  }
  return { c: contract, insts, q: q ?? null, cust: cust ?? null, settings }
}

export type ContractDocData = NonNullable<Awaited<ReturnType<typeof loadContract>>>

export default function ContractDoc({ data, toolbar }: { data: ContractDocData; toolbar?: React.ReactNode }) {
  const { c, insts, q, cust, settings: s } = data

  const employer = q?.custName || cust?.name || cust?.chname || ''
  const employerAddr = q?.custAddress || cust?.province || ''
  const employerTax = q?.custTaxId || ''
  const signer = c.contractorSigner || ''
  const employerSigner = c.employerSigner || ''
  const amount = n0(c.contractAmount)
  const vat = num(c.vatPct) ?? 0
  const wht = num(c.whtPct) ?? 0
  const buildDays = c.buildDays ?? 0
  const extendDays = c.extendDays ?? 0
  const startWithin = c.startWithinDays ?? 0
  const payWithin = c.payWithinDays ?? 0
  const penalty = n0(c.penaltyPerDay)
  const warrantyYears = c.warrantyYears ?? 1
  const sqm = num(c.buildingSqm)
  const instTotal = insts.reduce((a, i) => a + n0(i.amount), 0)
  const blank = '………../…………………./……………'

  const sign = (
    <div className="ct-signs">
      <div>
        <div>ลงชื่อ…………………………………..ผู้ว่าจ้าง</div>
        <div className="b">{employer || '……………………………………'}</div>
        <div>( {employerSigner || '……………............………'} )</div>
        <div>{blank}</div>
      </div>
      <div>
        <div>ลงชื่อ…………………..…………..ผู้รับจ้าง</div>
        <div className="b">{s.name}</div>
        <div>( {signer || '……………………………'} )</div>
        <div>{blank}</div>
      </div>
      {/* พยานซ้ายเป็นฝั่งผู้ว่าจ้าง เว้นให้กรอกมือ · พยานขวาเป็นฝั่งบริษัท ชื่อคงที่จากตั้งค่าบริษัท */}
      <div>
        <div>ลงชื่อ…………………………………..พยาน</div>
        <div>( ………………………………… )</div>
        <div>{blank}</div>
      </div>
      <div>
        <div>ลงชื่อ…………………………………..พยาน</div>
        <div>( {s.witnessName || '…………………………..'} )</div>
        <div>{blank}</div>
      </div>
    </div>
  )

  return (
    <div className="ctr">
      <style>{CONTRACT_CSS}</style>
      {toolbar}

      {/* ---------- หน้าปก ---------- */}
      <div className="page cover">
        <div className="orig">ต้นฉบับ</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.logoUrl && <img className="logo" src={s.logoUrl} alt="" />}
        <h1>สัญญาว่าจ้างรับเหมาก่อสร้าง</h1>
        <h2>เลขที่ {c.code}</h2>
        {s.address && <div className="cv-line">{s.address}</div>}
        {s.phone && <div className="cv-line">โทร {s.phone}</div>}
        {(s.website || s.email) && (
          <div className="cv-line">{s.website}{s.website && s.email ? ' , ' : ''}{s.email ? `Email : ${s.email}` : ''}</div>
        )}
        <div className="cv-project">
          <div className="b big">{c.projectName || '(ยังไม่ได้ตั้งชื่อโครงการ)'}</div>
          <div className="b big">{employer || '(ยังไม่ระบุผู้ว่าจ้าง)'}</div>
          {/* ที่ตั้งหน้างาน ตำบล/อำเภอ/จังหวัด — ขึ้นเป็นคำเตือนถ้ายังว่าง จะได้เห็นตั้งแต่ก่อนพิมพ์ */}
          <div className="b big">{c.siteAddress || '(ยังไม่ได้ระบุที่ตั้งโครงการ)'}</div>
        </div>
      </div>

      {/* ---------- ข้อ 1-3 ---------- */}
      {/* เนื้อหาสัญญาไหลต่อเนื่อง ให้เบราว์เซอร์ตัดหน้าเองตามจริง — ไม่ตรึงเป็นหน้าละข้อ เพราะข้อยาวจะถูกดันไปแผ่นใหม่ทั้งก้อนแล้วเหลือช่องว่างใหญ่ */}
      <div className="page flow">
        <h3 className="doc-h">{c.projectName || 'โครงการก่อสร้าง'}</h3>

        <div className="cl-h">1. ขอบเขตของงาน</div>
        <p className="ind">
          งานที่ <b>{employer || '……………'}</b>{employerSigner && employerSigner !== employer && <> โดย {employerSigner}</>} ที่อยู่ {employerAddr || '……………'}
          {employerTax && <> เลขประจำตัวผู้เสียภาษี {employerTax}</>} ซึ่งต่อไปในรายละเอียดสัญญานี้เรียกว่า
          “ผู้ว่าจ้าง” ประสงค์ที่จะว่าจ้างให้ <b>{s.name}</b>{signer && <> โดย {signer}</>}
          {s.address && <> {s.address}</>}{s.phone && <> โทร {s.phone.split(',')[0].trim()}</>} ต่อไปในรายละเอียดสัญญานี้
          เรียกว่า “ผู้รับจ้าง” เพื่อทำการก่อสร้างที่โครงการก่อสร้าง ตามที่ปรากฏในแบบก่อสร้าง (Drawings)
          ตามเอกสารหมายเลข 1 ของผู้ว่าจ้าง ต่อไปในรายละเอียดสาระสำคัญของขอบเขตของงานนี้เรียกว่า “งานที่จ้าง”
          มูลค่าก่อสร้างรวมเป็นจำนวนเงิน <b>{int(amount)}</b> บาท ( {bahtText(amount)} ) รวมระยะเวลาก่อสร้าง <b>{buildDays}</b> วัน
          {(c.buildingSize || sqm) && (
            <> งานที่จ้างเป็น<b>อาคาร{c.buildingSize ? ` ขนาด ${c.buildingSize}` : ''}{sqm ? ` พื้นที่ใช้สอย ${sqm} ตร.ม.` : ''}</b></>
          )}
          {c.siteAddress && <> ตั้งอยู่ {c.siteAddress}</>}
        </p>

        <Cl n="1.1">
          ผู้รับจ้างจะต้องหาวัสดุ แรงงาน และอุปกรณ์ที่จำเป็นใช้ในการก่อสร้างงานที่จ้าง ที่ระบุดังรายละเอียดต่าง ๆ
          โดยผู้รับจ้างเป็นผู้รับผิดชอบค่าใช้จ่ายส่วนนี้คือ
          <Cl n="1.1.1">วัสดุที่ใช้ในการก่อสร้างอาคารทั้งหมดที่ปรากฏอยู่ในแบบก่อสร้าง</Cl>
          <Cl n="1.1.2">เครื่องจักรที่ใช้ในการดำเนินงานทั้งหมดจนกว่างานจะก่อสร้างแล้วเสร็จ เช่น โมบายเครน, ปั๊มคอนกรีต, รถแม็คโคร เป็นต้น</Cl>
          <Cl n="1.1.3">น้ำและไฟฟ้าที่ใช้สำหรับการทำงาน ทางผู้รับจ้างเป็นผู้จัดหา</Cl>
          <Cl n="1.1.4">ชุดสำรวจเพื่อปักหมุดวางผัง (Survey Pegging) ทางผู้รับจ้างเป็นผู้จัดหา</Cl>
        </Cl>
        <Cl n="1.2">
          ในการปฏิบัติงานที่จ้าง ผู้รับจ้างหรือตัวแทนจะต้องปฏิบัติตามข้อกำหนดที่เป็นหนังสือและ/หรือโดยวาจา
          ตลอดจนคำสั่งหรือคำแนะนำของผู้ว่าจ้าง ติดต่อทุกชนิดกับผู้ว่าจ้าง ผู้รับจ้างจะติดต่อเป็นลายลักษณ์อักษร
          ผ่านเจ้าหน้าที่ของผู้ว่าจ้างที่ได้รับแต่งตั้งจากทางผู้ว่าจ้างและเป็นที่ทราบทั้งสองฝ่าย
        </Cl>
        <Cl n="1.3">
          สำหรับการปฏิบัติงานที่จำเป็นจะต้องจัดทำด้วยประการอื่นใด เพื่อให้ได้ผลของงานที่ดี หรือเพื่อให้งานที่จ้าง
          แล้วเสร็จสมบูรณ์ถูกต้อง หรือเป็นรายละเอียดการทำงานเพื่อประกอบงานตามแบบให้สำเร็จตามความประสงค์ของ
          รายการที่ระบุไว้ ผู้รับจ้างจะต้องจัดทำโดยไม่เรียกร้องราคาเพิ่มเติมหรือค่าใช้จ่ายอื่นใดจากผู้ว่าจ้าง
        </Cl>
        <Cl n="1.4">นอกจากงานก่อสร้างตามที่ได้กำหนดไว้ในข้อ 1.1 แล้ว ผู้รับจ้างยังมีหน้าที่ในการประสานงานกับผู้รับเหมาอื่นที่จัดจ้างโดยผู้ว่าจ้าง (ถ้ามี)</Cl>

        <div className="cl-h">2. ระยะเวลาการดำเนินงาน</div>
        <Cl n="2.1">
          งานโครงสร้างสำเร็จรูป และงานสถาปัตย์ของอาคารทั้งหมดตามที่ปรากฏในแบบก่อสร้าง ระยะเวลาก่อสร้างรวมทั้ง
          <b> {buildDays}</b> วัน นับตั้งแต่วันชำระเงินงวดแรกตามสัญญาก่อสร้าง หากการก่อสร้างไม่แล้วเสร็จตามสัญญา
          ซึ่งมิได้เกิดจากความผิดของผู้รับจ้าง ผู้ว่าจ้างยินยอมขยายระยะเวลาให้ผู้รับจ้างอีกไม่น้อยกว่า <b>{extendDays}</b> วัน
          หรือจนกว่าเหตุที่ทำให้การก่อสร้างไม่แล้วเสร็จได้สิ้นสุดลง
        </Cl>
        <Cl n="2.2">
          ระยะเวลาในการทำงานคือ ตั้งแต่ <b>{c.workHours || '—'}</b> จุดประสงค์เพื่อไม่ให้เกิดผลกระทบด้านการอยู่อาศัย
          และการพักผ่อนกับบ้านข้างเคียง จนอาจนำไปสู่การร้องเรียนกับเจ้าพนักงานท้องถิ่น ยกเว้นกรณีที่มีเหตุสุดวิสัย
          ที่ผู้รับจ้างมีความจำเป็นต้องดำเนินงานให้แล้วเสร็จหลังเวลาดังกล่าว พนักงานของผู้รับจ้างต้องดำเนินการ
          ประสานงานแจ้งกับตัวแทนของผู้ว่าจ้างก่อนดำเนินการในแต่ละวัน
        </Cl>

        <div className="cl-h">3. เงื่อนไขเฉพาะของงานที่จ้าง</div>
        <Cl n="3.1">
          ผู้รับจ้างจะต้องดำเนินการก่อสร้างในส่วนของงานที่กล่าวไว้ในข้อ 2.1 ให้เป็นไปตามมาตรฐานการก่อสร้างที่ระบุอยู่
          ในแบบการก่อสร้างหรือมาตรฐานงานก่อสร้างโดยทั่วไปที่เป็นที่ยอมรับในหลักสากล ทั้งนี้หากในระหว่างการก่อสร้าง
          ทางผู้รับจ้างไม่สามารถดำเนินการให้เป็นไปตามแบบได้ ผู้ว่าจ้างจะยินยอมให้ผู้รับจ้างแก้ไขแบบได้ตามสภาพของงาน
          ที่ก่อสร้าง เพื่อให้ได้มาตรฐานที่ใกล้เคียงกันตามหลักวิศวกรรม โดยมีผู้รับผิดชอบเซ็นรับรองมาตรฐาน
          ทั้งนี้ผู้รับจ้างจะต้องทำการชี้แจงกับทางผู้ว่าจ้างก่อนการดำเนินการตลอดเป็นระยะ
        </Cl>
        <Cl n="3.2">ผู้รับจ้างจะต้องมีหน้าที่คอยประสานงานและควบคุมงานก่อสร้างประจำอยู่ที่สถานที่ก่อสร้างเวลางานที่จ้าง</Cl>

      {/* ---------- ข้อ 4-5 ---------- */}
        <div className="cl-h">4. เขตก่อสร้างและการสำรวจสภาพพื้นที่ข้างเคียง</div>
        <Cl n="4.1">
          ผู้รับจ้างมีหน้าที่ดูแลรักษารั้วเดิมของผู้ว่าจ้าง ยกเว้นได้รับการอนุมัติจากผู้ว่าจ้างในการกำหนดช่องเปิดสำหรับ
          เส้นทางลำเลียง ทั้งนี้ผู้รับจ้างจะต้องจัดทำแผนผังแสดงผ่านตัวแทนของผู้ว่าจ้างเพื่อพิจารณาอนุมัติก่อนการดำเนินการ
        </Cl>
        <Cl n="4.2">ผู้รับจ้างมีหน้าที่ดำเนินการให้มีไฟฟ้าแสงสว่างและน้ำประปาตามที่ผู้รับจ้างเห็นว่าจำเป็น โดยค่าใช้จ่ายเป็นของผู้ว่าจ้างตามที่ระบุไว้ในข้อ 1.2.3</Cl>
        <Cl n="4.3">ผู้รับจ้างมีหน้าที่ห้ามบุคคลใด ๆ พักอาศัยและ/หรือประกอบอาหารภายในสถานที่ก่อสร้าง</Cl>
        <Cl n="4.4">ผู้รับจ้างมีหน้าที่ปฏิบัติตามประกาศกระทรวงมหาดไทย เรื่องความปลอดภัยในการทำงานก่อสร้าง</Cl>

        <div className="cl-h">5. การป้องกันอุบัติเหตุและการจัดการความปลอดภัยในการทำงานก่อสร้าง</div>
        <Cl n="5.1">
          ผู้รับจ้างมีหน้าที่ปฏิบัติตามประกาศ คำสั่งของทางราชการและกฎหมายต่าง ๆ ที่เกี่ยวข้องกับความปลอดภัยในการ
          ทำงานก่อสร้างทุกฉบับ รวมถึงกฎข้อบังคับในหน่วยงานที่ผู้ว่าจ้างเป็นผู้กำหนดตามความเหมาะสมในการทำงาน
        </Cl>
        <Cl n="5.2">
          ผู้รับจ้างมีหน้าที่ป้องกันความเสียหายและมลภาวะต่าง ๆ ที่จะเกิดขึ้นจากงานที่จ้างต่อลูกจ้างและ/หรือทรัพย์สิน
          ของผู้ว่าจ้าง รวมทั้งผู้อยู่อาศัยข้างเคียง เช่น ฝุ่น เสียง การสั่นสะเทือน น้ำเสีย วัสดุตกหล่น เป็นต้น โดยวัสดุที่ใช้
          ในการป้องกันความเสียหายและมลภาวะต่าง ๆ ดังกล่าวที่สามารถมองเห็นจากภายนอก จะต้องมีสภาพดีสมบูรณ์และสามารถใช้งานได้
        </Cl>
        <Cl n="5.3">
          ผู้รับจ้างจะต้องจัดให้มีพนักงานเพื่อดูแลเครื่องจักร อุปกรณ์ และทรัพย์สินอื่น ๆ ของผู้รับจ้างที่อยู่ในสถานที่ก่อสร้าง
          โดยผู้รับจ้างเป็นผู้รับผิดชอบค่าใช้จ่ายเอง
        </Cl>
        <Cl n="5.4">หากผู้รับจ้างมีการใช้แรงงานที่เป็นบุคคลต่างด้าว ทางผู้รับจ้างจะต้องเป็นผู้ดำเนินการขออนุญาตขึ้นทะเบียนต่อกรมแรงงาน</Cl>

      {/* ---------- ข้อ 6 มูลค่าสัญญาและงวดงาน ---------- */}
        <div className="cl-h">6. มูลค่าสัญญา, งวดงานและการเบิกจ่ายงวดงาน</div>
        <Cl n="6.1">มูลค่าค่าก่อสร้างทั้งหมด (Lump Sum Cost) <b>{fmt(amount)}</b> บาท</Cl>
        <div className="hl-red">
          กำหนดการชำระ เมื่องานแล้วเสร็จ ตามงวดงานดังต่อไปนี้ ภายใน {payWithin} วัน นับแต่วันเซ็นอนุมัติส่งสอบงาน
        </div>
        {/* จัดตามฟอร์มจริง: งวดหลักหนึ่งแถว งวดย่อยเป็นแถวของตัวเองเยื้องเข้าและเป็นตัวแดง
            ยอดเงินทุกแถวอยู่คอลัมน์ขวาเดียวกัน จะได้ไล่สายตาลงมาเป็นเส้นตรง · งวดที่ 1 ใส่ "เมื่อเซ็นสัญญา วันที่" ต่อท้ายเหมือนฟอร์ม */}
        <table className="inst">
          <tbody>
            {insts.map((i, n) => {
              const subs = subsOf(i.subsJson)
              const amt = n0(i.amount)
              return [
                // ห้ามใช้ class "main" — ชนกับ .main ของโครงหน้าแอปที่สั่ง flex-direction:column แล้วช่องในแถวจะซ้อนกัน
                <tr key={i.id} className="inst-main">
                  <td className="no">6.1.{n + 1}</td>
                  <td className="b">{i.title}</td>
                  <td className="amt">
                    {/* งวดที่แตกงวดย่อยโชว์ % ที่งวดย่อย (50/50) เท่านั้น ไม่ซ้อน % ของงวดหลักอีกชั้น */}
                    {subs.length === 0 && num(i.percent) != null && <span className="pct">({Number(i.percent)}%) </span>}
                    เป็นเงิน <b className="mark">{int(amt)} บาท</b>
                    {subs.length > 1 && <> ชำระ {subs.length} งวด</>}
                    {n === 0 && subs.length === 0 && <> เมื่อเซ็นสัญญาก่อสร้าง วันที่ {c.signDate ? thDateBE(c.signDate) : '-'}</>}
                  </td>
                </tr>,
                ...subs.map((sb, m) => {
                  const pct = amt > 0 ? Math.round(sb.amount / amt * 1000) / 10 : null
                  return (
                    <tr key={`${i.id}-${m}`} className="sub">
                      <td />
                      <td><span className="sno">6.1.{n + 1}.{m + 1}</span> {sb.title}{pct != null && <span className="pct"> ({pct}%)</span>}</td>
                      <td className="amt">ชำระเป็น {int(sb.amount)} บาท</td>
                    </tr>
                  )
                }),
                ...(i.note ? [
                  <tr key={`${i.id}-note`} className="note">
                    <td />
                    <td colSpan={2} className="inote pre">{i.note}</td>
                  </tr>,
                ] : []),
              ]
            })}
            <tr className="sum">
              <td />
              <td className="b r">รวมทั้งสิ้น</td>
              <td className="amt b">{fmt(instTotal)} บาท</td>
            </tr>
          </tbody>
        </table>
        <div className="star">*** ราคานี้{vat ? `รวมภาษีมูลค่าเพิ่ม ${vat}%` : 'ไม่รวมภาษีมูลค่าเพิ่ม 7%'} ***</div>
        <Cl n="6.2">{wht ? `หักภาษี ณ ที่จ่าย ${wht} %` : 'ไม่หัก ภาษี ณ ที่จ่าย 3 %'}</Cl>
        <Cl n="6.3">
          {vat ? `รวมภาษีมูลค่าเพิ่ม ${vat} %` : 'ไม่รวมภาษีมูลค่าเพิ่ม 7 %'}
          <Cl n="6.3.1">การตั้งเบิกงวดงาน กำหนดให้ตั้งเบิกตามงวดงานที่ระบุไว้ในสัญญาว่าจ้าง</Cl>
          <Cl n="6.3.2">ผู้ว่าจ้างจะชำระค่าจ้างแก่ผู้รับจ้างภายใน {payWithin} วัน นับตั้งแต่วันที่ผู้รับจ้างส่งเอกสารตั้งเบิกงวดงาน</Cl>
          <Cl n="6.3.3">
            ในกรณีที่ผู้รับจ้างมีการตั้งเบิกเงินล่วงหน้ากับทางผู้ว่าจ้าง ไม่ว่าจะเป็นค่าของหรือค่าแรง ผู้ว่าจ้างขอสงวนสิทธิ์
            ในการหักเงินดังกล่าวคืนในการตั้งเบิกงวดงานของทางผู้รับจ้างในงวดถัดจากที่มีการเบิกเงินล่วงหน้า เต็มจำนวน
            เท่ากับที่ทางผู้รับจ้างได้ทำการเบิกจากผู้ว่าจ้าง
          </Cl>
        </Cl>
        <p className="ind">
          หากผู้รับจ้างละเลยการปฏิบัติในข้อ 5, 6 จนก่อให้เกิดความเสียหายใด ๆ ขึ้น ไม่ว่าต่อผู้ว่าจ้าง หรือตัวแทนผู้ว่าจ้าง
          หรือผู้รับจ้างอื่นที่ผู้ว่าจ้างจ้างมา หรือบุคลากรของผู้รับจ้างเอง หรือบุคคลภายนอก หรือหน่วยงานราชการ
          ผู้รับจ้างจะต้องเป็นผู้รับผิดชอบทั้งสิ้น โดยจะเรียกร้องใด ๆ จากผู้ว่าจ้างไม่ได้
          <span className="red"> เว้นแต่เหตุที่ได้รับความเสียหายนั้นเกิดขึ้นโดยความประมาทของบุคคลนั้น ๆ เอง</span>
        </p>

      {/* ---------- ข้อ 7-11 + ลงนาม ---------- */}
        <div className="cl-h">7. อัตราค่าปรับ</div>
        <p className="ind">
          หากผู้รับจ้างทำงานทั้งหมดไม่แล้วเสร็จตามข้อ 2.1 เหตุเกิดจากความผิดของผู้รับจ้างเอง ผู้ว่าจ้างกำหนดค่าปรับ
          สำหรับการทำงานที่จ้างล่าช้าวันละ <b>{int(penalty)}</b> บาท
          <span className="red"> เว้นแต่ความล่าช้านั้นผู้รับจ้างได้บอกกล่าวกับผู้ว่าจ้างล่วงหน้าแล้ว</span>
        </p>

        <div className="cl-h">8. การเปลี่ยนแปลงแบบก่อสร้าง, งานเพิ่ม-ลด และการขยายเวลา</div>
        <p className="ind">
          หากมีการแจ้งเปลี่ยนแปลงหรือแก้ไขรายละเอียดไปจากแบบก่อสร้างเดิมเป็นลายลักษณ์อักษรจากผู้ว่าจ้าง ผู้รับจ้าง
          สามารถแจ้งรายละเอียดข้อมูลค่างานที่เพิ่ม-ลดให้กับทางผู้ว่าจ้างเพื่อพิจารณาอนุมัติ โดยที่มูลค่าจะต้องเป็นที่ยอมรับ
          ทั้งสองฝ่าย และหากงานดังกล่าวมีผลต่อระยะเวลาการก่อสร้าง ผู้รับจ้างสามารถชี้แจงรายละเอียดต่อผู้ว่าจ้างเพื่อ
          พิจารณาขยายเวลาก่อสร้าง ตามที่คู่สัญญาทั้งสองฝ่ายตกลงร่วมกัน โดยคำนึงถึงแบบก่อสร้างที่มีการแก้ไขเพิ่มเติม
        </p>
        <p className="ind">
          ทั้งนี้หากมีการแก้ไขงานก่อสร้างโดยที่งานดังกล่าวมิได้เกิดจากการแจ้งเป็นลายลักษณ์อักษรจากผู้ว่าจ้าง แต่เกิดจาก
          ความผิดพลาดของผู้รับจ้างเอง มูลค่าที่เกิดขึ้นจากการแก้ไข ผู้รับจ้างจะต้องเป็นผู้รับผิดชอบ
        </p>

        <div className="cl-h">9. การรักษาความสะอาด</div>
        <Cl n="9.1">
          ผู้รับจ้างจะต้องทำความสะอาดสถานที่ก่อสร้างเป็นประจำโดยสม่ำเสมอ และขจัดขยะมูลฝอยออกจากสถานที่ก่อสร้างทุกวัน
          และจะต้องระมัดระวังบริเวณโดยรอบสถานที่ก่อสร้าง มิให้ได้รับผลกระทบจากงานที่จ้าง โดยเฉพาะในเรื่องที่เกี่ยวกับ
          ความสะอาดและการระบายน้ำ
        </Cl>
        <Cl n="9.2">
          ขยะที่เกิดจากการก่อสร้างของตนเอง ผู้รับจ้างต้องคัดแยกออกจากขยะอื่น รวบรวมเป็นกองไว้ต่างหาก และนำออกจาก
          สถานที่ก่อสร้างโดยค่าใช้จ่ายของผู้รับจ้างเอง
        </Cl>

        <div className="cl-h">
          10. ผู้ว่าจ้างยินยอมให้ผู้รับจ้าง นำแบบก่อสร้างโครงการตามสัญญาที่ออกแบบโดยผู้รับจ้าง รวมถึงภาพ 3D
          ของโครงการตามสัญญา ออกเผยแพร่ โฆษณา ทางหนังสือพิมพ์ โซเชียลมีเดีย ทุกประเภทได้
        </div>
        <div className="cl-h">11. วัสดุก่อสร้าง ผู้รับจ้างเป็นผู้ชำระทั้งหมด และหักค่าวัสดุตรงตามงวดงานนั้น ๆ</div>

        {c.note && <p className="ind pre">{c.note}</p>}

        <p className="ind">
          เอกสารชุดนี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความโดยตลอดแล้ว
          จึงได้ลงลายมือชื่อไว้ ณ <b>{thDateContract(c.signDate)}</b>
          {' '}และวันกำหนดแล้วเสร็จ <b>{thDateContract(c.dueDate)}</b> ต่างเก็บไว้เป็นหลักฐานฝ่ายละ 1 ฉบับ
        </p>
        <p className="ind">
          สุดท้ายนี้ผู้ว่าจ้าง หวังเป็นอย่างยิ่งว่าผู้รับจ้างจะสามารถดำเนินการได้อย่างมีประสิทธิภาพและสำเร็จตามวัตถุประสงค์ของโครงการต่อไป
        </p>
        {sign}
      </div>

      {/* ---------- เงื่อนไขของสัญญา ข้อ 1-3 ---------- */}
      <div className="page flow">
        <h3 className="doc-h">เงื่อนไขของสัญญา</h3>

        <div className="cl-h">1. ข้อความทั่วไป</div>
        <Cl n="1.1">
          ขอบเขตของงาน
          <Cl n="1.1.1">
            งานที่ผู้รับจ้างจะต้องปฏิบัติตามสัญญาฉบับนี้ ประกอบด้วยงานจัดหาเครื่องจักร รถแบคโฮเล็ก, ไม้แบบ, ตะปู,
            ลวดผูกเหล็ก และงานจ้างแรงงานเพื่อทำงานก่อสร้าง (ต่อไปในสัญญาฉบับนี้รวมเรียก “งาน”) ให้เป็นไปตาม
            รายละเอียดที่กำหนด แบบสถาปัตยกรรม และแบบทัศนียภาพที่ระบุไว้ในเอกสารแนบท้ายสัญญานี้
          </Cl>
          <Cl n="1.1.2">
            ผู้ว่าจ้างอาจประสงค์ให้ผู้รับจ้างปฏิบัติงานเพิ่มเติม เปลี่ยนแปลงหรือแก้ไขการปฏิบัติงาน ซึ่งอาจแตกต่างหรือ
            นอกเหนือไปจากรายละเอียดงานที่ระบุไว้ในเอกสารแนบท้ายสัญญา (รวมเรียกว่า “งานแก้ไข/เพิ่มเติม”) โดยผู้รับจ้าง
            จะปฏิบัติงานดังกล่าวตามคำขอร้องของผู้ว่าจ้าง ภายใต้เงื่อนไขและข้อตกลง รวมถึงค่าจ้างที่เกี่ยวข้องที่ตกลงร่วมกัน
            เพื่อการนั้น โดยข้อตกลงเช่นว่านั้นจะต้องทำขึ้นตามแบบที่กำหนดในเรื่องแบบคำขอเปลี่ยนแปลงงานแนบท้ายสัญญานี้
          </Cl>
          <Cl n="1.1.3">
            งานที่รวมในงานเหมานี้ คุณสมบัติวัสดุ ได้แก่
            <div className="box pre">{c.scopeIncluded || '—'}</div>
          </Cl>
          <Cl n="1.1.4">
            งานที่ไม่รวมในงานเหมานี้ ได้แก่
            <div className="box pre">{c.scopeExcluded || '—'}</div>
          </Cl>
        </Cl>
        <Cl n="1.2">
          กฎหมายที่จะต้องปฏิบัติตาม
          <Cl n="1.2.1">ในการปฏิบัติงานตามสัญญาฉบับนี้ ผู้รับจ้างจะต้องเคารพและปฏิบัติตามกฎหมาย ระเบียบ และข้อบังคับต่าง ๆ ของทางราชการ</Cl>
          <Cl n="1.2.2">ผู้ว่าจ้างยินยอมให้ผู้รับจ้างสามารถนำผลงาน รูปภาพ การก่อสร้างโครงการ ลงสื่อโฆษณา สื่อต่าง ๆ ได้ในเชิงธุรกิจ ถือเป็นผลงานของผู้รับจ้าง</Cl>
          <Cl n="1.2.3">ระยะเวลาการก่อสร้าง นับจากวันรับชำระเงินงวดแรก</Cl>
        </Cl>

        <div className="cl-h">2. การเริ่ม การสิ้นสุด การเปลี่ยนแปลงแก้ไข และการบอกเลิกสัญญางานก่อสร้าง</div>
        <Cl n="2.1">การเริ่มมีผลบังคับของสัญญา สัญญานี้เริ่มมีผลใช้บังคับทันทีเมื่อคู่สัญญาได้ลงนาม</Cl>
        <Cl n="2.2">วันเริ่มปฏิบัติงาน ผู้รับจ้างจะต้องเริ่มปฏิบัติงานภายใน <b>{startWithin}</b> วัน หลังจากได้ลงนามในสัญญา</Cl>
        <Cl n="2.3">วันสิ้นสุดของสัญญา ผู้รับจ้างจะต้องปฏิบัติงานให้แล้วเสร็จสมบูรณ์ภายใน <b>{buildDays}</b> วัน นับจากวันที่รับเงิน</Cl>
        <Cl n="2.4">
          การขยายเวลาปฏิบัติงานตามสัญญา ในกรณีที่มีเหตุสุดวิสัย หรือเหตุใด ๆ อันเนื่องมาจากความผิดหรือความบกพร่อง
          ของฝ่ายผู้ว่าจ้าง หรือจากสภาพดินฟ้าอากาศ หรือจากเหตุการณ์อันหนึ่งอันใดซึ่งผู้รับจ้างไม่สามารถทำงานให้เสร็จ
          ตามเงื่อนไขและกำหนดเวลาแห่งสัญญานี้ได้ ผู้รับจ้างจะแจ้งเหตุหรือพฤติการณ์ดังกล่าวพร้อมหลักฐานให้ผู้ว่าจ้างทราบ
          ภายใน 7 วัน นับจากวันที่เกิดเหตุ เพื่อขยายเวลาการทำงานออกไปได้ตามความจริง
        </Cl>

        <div className="cl-h">3. หน้าที่และความรับผิดชอบของผู้รับจ้าง</div>
        <Cl n="3.1">
          ผู้รับจ้างจะต้องใช้ความชำนาญ ความระมัดระวังรอบคอบในการปฏิบัติงานตามสัญญาอย่างมีประสิทธิภาพ และจะต้อง
          ปฏิบัติหน้าที่ตามความรับผิดชอบให้สำเร็จลุล่วงเป็นไปตามมาตรฐานของวิชาชีพที่ยอมรับนับถือกันโดยทั่วไป
        </Cl>
        <Cl n="3.2">
          ผู้รับจ้างจะต้องรับผิดชอบในบรรดาสิทธิเรียกร้องค่าเสียหาย ค่าใช้จ่าย ตลอดถึงการเรียกร้องอื่นโดยบุคคลที่สาม
          อันเกิดจากความผิดพลาด การละเมิด หรือการละเว้นไม่กระทำการอันควรของผู้รับจ้าง หรือของลูกจ้าง/พนักงาน/ผู้รับเหมาช่วงของผู้รับจ้าง
        </Cl>

      {/* ---------- เงื่อนไขของสัญญา ข้อ 4-7 + ลงนาม ---------- */}
        <div className="cl-h">4. ความรับผิดชอบของผู้ว่าจ้าง</div>
        <Cl n="4.1">ผู้ว่าจ้างจะส่งมอบพื้นที่เพื่อผู้รับจ้างสามารถเริ่มปฏิบัติงานได้ตามเงื่อนไขแห่งสัญญานี้ภายใน <b>{startWithin}</b> วัน</Cl>
        <Cl n="4.2">ในกรณีที่ผู้รับจ้างร้องขอ ผู้ว่าจ้างจะให้ความช่วยเหลืออำนวยความสะดวกตามสมควรเพื่อให้การปฏิบัติงานของผู้รับจ้างตามสัญญานี้ลุล่วงไปด้วยดี</Cl>

        <div className="cl-h">5. ตารางการเรียกเก็บค่าจ้างเหมา</div>
        <Cl n="5.1">อ้างอิงตามตารางงวดงานก่อสร้าง</Cl>

        <div className="cl-h">6. การส่งงาน</div>
        <p className="ind">
          ข้อกำหนดในการชำระเงินตามข้อ (5) ค่าจ้างปฏิบัติงานของผู้รับจ้างที่เรียกเก็บในแต่ละงวดข้างต้น ให้มีกำหนดชำระ
          ภายใน <b>{payWithin}</b> วัน นับจากวันตรวจรับงาน
        </p>

        <div className="cl-h">7. การประกันผลงาน</div>
        <Cl n="7.1">
          ผู้รับจ้างจะทำการรับประกันผลงาน งานก่อสร้างทั้งหมด ซึ่งเกิดจากความผิดพลาดของการก่อสร้างเป็นระยะเวลา
          <b> {warrantyYears}</b> ปี นับตั้งแต่วันที่ได้มีการส่งมอบและตรวจรับงานเรียบร้อยแล้ว โดยผู้รับจ้างต้องรับผิดชอบ
          ค่าใช้จ่ายทั้งหมด หากความเสียหายเกิดจากการประกอบติดตั้งที่ไม่มีคุณภาพ
          {c.warrantyText && <div className="box pre">{c.warrantyText}</div>}
        </Cl>
        <Cl n="7.2">
          ส่วนรายละเอียดอื่น ๆ ที่เกี่ยวข้องกับงานก่อสร้างอื่น ๆ ที่เป็นความเสียหายที่เกิดจากการใช้งานที่ผิดวิธี สภาพภูมิอากาศ
          ที่มีการเปลี่ยนแปลง รวมถึงการติดตั้งอุปกรณ์อื่น ๆ ทางผู้รับจ้างจะเข้ามาช่วยดูแลประสานงานและทำการแก้ไขให้
          ตามที่ได้รับการร้องขอตลอดระยะเวลา {warrantyYears} ปี และผู้ว่าจ้างต้องเป็นผู้รับผิดชอบค่าใช้จ่ายทั้งหมด
        </Cl>

        <p className="ind b">
          สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยละเอียดโดยตลอดแล้ว
          จึงได้ลงลายมือชื่อพร้อมประทับตราไว้เป็นสำคัญต่อหน้าพยาน และคู่สัญญาต่างยึดถือไว้ฝ่ายละฉบับ
        </p>
        {sign}
      </div>
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
