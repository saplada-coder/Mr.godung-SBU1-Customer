import { n0, num } from '@/lib/biz'
import { bahtText, thDateBE, thDateContract } from '@/lib/format'
import { fmt, int, subsOf, Cl, SignBlock, PayBox, AttachmentPages, CONTRACT_CSS } from './parts'
import type { ContractDocData } from './doc'

/**
 * สัญญาว่าจ้างออกแบบ — ทางเลือกสำหรับลูกค้าที่จ้างออกแบบก่อน ยังไม่จ้างก่อสร้าง
 * ค่าออกแบบคิดเป็นเปอร์เซ็นต์ของมูลค่าโครงการ (ปกติ 10%) แบ่งชำระสามงวดตามความคืบหน้าของแบบ
 * ตัวเลขและรายการแบบมาจากตารางสัญญา แก้ได้ที่หน้าร่างสัญญา ส่วนถ้อยคำข้อสัญญาเป็นแม่แบบคงที่
 */
export default function DesignContractDoc({ data, toolbar }: { data: ContractDocData; toolbar?: React.ReactNode }) {
  const { c, insts, files, q, cust, settings: s } = data

  const employer = q?.custName || cust?.name || cust?.chname || ''
  const employerAddr = q?.custAddress || cust?.province || ''
  const employerTax = q?.custTaxId || ''
  const signer = c.contractorSigner || ''
  const fee = n0(c.contractAmount)
  const projectValue = n0(c.projectValue)
  const feePct = num(c.feePct) ?? 0
  const vat = num(c.vatPct) ?? 0
  const wht = num(c.whtPct) ?? 0
  const designDays = c.buildDays ?? 0
  const extendDays = c.extendDays ?? 0
  const payWithin = c.payWithinDays ?? 0
  const penalty = n0(c.penaltyPerDay)
  const revisions = c.designRevisions ?? 0
  const sqm = num(c.buildingSqm)
  const instTotal = insts.reduce((a, i) => a + n0(i.amount), 0)

  return (
    <div className="ctr">
      <style>{CONTRACT_CSS}</style>
      {toolbar}

      {/* ---------- หน้าปก ---------- */}
      <div className="page cover">
        <div className="orig">ต้นฉบับ</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.logoUrl && <img className="logo" src={s.logoUrl} alt="" />}
        <h1>สัญญาว่าจ้างออกแบบ</h1>
        <h2>เลขที่ {c.code}</h2>
        {s.address && <div className="cv-line">{s.address}</div>}
        {s.phone && <div className="cv-line">โทร {s.phone}</div>}
        {(s.website || s.email) && (
          <div className="cv-line">{s.website}{s.website && s.email ? ' , ' : ''}{s.email ? `Email : ${s.email}` : ''}</div>
        )}
        <div className="cv-project">
          <div className="b big">{c.projectName || '(ยังไม่ได้ตั้งชื่อโครงการ)'}</div>
          <div className="b big">{employer || '(ยังไม่ระบุผู้ว่าจ้าง)'}</div>
          <div className="b big">{c.siteAddress || '(ยังไม่ได้ระบุที่ตั้งโครงการ)'}</div>
        </div>
      </div>

      {/* ---------- เนื้อสัญญา ---------- */}
      <div className="page flow">
        <h3 className="doc-h">{c.projectName || 'โครงการ'}</h3>

        <div className="cl-h">1. ขอบเขตของงานออกแบบ</div>
        <p className="ind">
          งานที่ <b>{employer || '……………'}</b>{c.employerSigner && c.employerSigner !== employer && <> โดย {c.employerSigner}</>} ที่อยู่ {employerAddr || '……………'}
          {employerTax && <> เลขประจำตัวผู้เสียภาษี {employerTax}</>} ซึ่งต่อไปในสัญญานี้เรียกว่า “ผู้ว่าจ้าง”
          ประสงค์ที่จะว่าจ้างให้ <b>{s.name}</b>{signer && <> โดย {signer}</>}
          {s.address && <> {s.address}</>}{s.phone && <> โทร {s.phone.split(',')[0].trim()}</>} ต่อไปในสัญญานี้เรียกว่า
          “ผู้รับจ้าง” เป็นผู้ออกแบบและเขียนแบบก่อสร้างของโครงการตามสัญญานี้ ต่อไปเรียกว่า “งานที่จ้าง”
          {(c.buildingSize || sqm) && (
            <> งานที่จ้างเป็นการออกแบบ<b>อาคาร{c.buildingSize ? ` ขนาด ${c.buildingSize}` : ''}{sqm ? ` พื้นที่ใช้สอย ${sqm} ตร.ม.` : ''}</b></>
          )}
          {c.siteAddress && <> ตั้งอยู่ {c.siteAddress}</>} รวมระยะเวลาออกแบบ <b>{designDays}</b> วัน
        </p>

        <Cl n="1.1">
          แบบและเอกสารที่ผู้รับจ้างจะส่งมอบให้ผู้ว่าจ้าง ได้แก่
          <div className="box pre">{c.scopeIncluded || '—'}</div>
        </Cl>
        <Cl n="1.2">
          งานที่ไม่รวมในสัญญาฉบับนี้ ได้แก่
          <div className="box pre">{c.scopeExcluded || '—'}</div>
        </Cl>
        <Cl n="1.3">
          การออกแบบจะเป็นไปตามความต้องการของผู้ว่าจ้างที่แจ้งไว้ ประกอบกับหลักวิชาชีพสถาปัตยกรรมและวิศวกรรม
          ตลอดจนกฎหมายควบคุมอาคารและข้อบัญญัติท้องถิ่นที่ใช้บังคับกับที่ตั้งของโครงการ
        </Cl>
        <Cl n="1.4">
          ผู้รับจ้างจะประสานงานกับผู้ว่าจ้างหรือตัวแทนที่ผู้ว่าจ้างแต่งตั้งเป็นลายลักษณ์อักษร
          การอนุมัติแบบในแต่ละขั้นตอนให้ถือตามที่ผู้ว่าจ้างลงนามรับรองไว้ในแบบนั้น
        </Cl>

        <div className="cl-h">2. ระยะเวลาการดำเนินงาน</div>
        <Cl n="2.1">
          ผู้รับจ้างจะดำเนินงานออกแบบให้แล้วเสร็จภายใน <b>{designDays}</b> วัน นับตั้งแต่วันที่ผู้รับจ้างได้รับชำระเงิน
          งวดแรกตามสัญญานี้ หากงานออกแบบไม่แล้วเสร็จตามกำหนดโดยมิใช่ความผิดของผู้รับจ้าง เช่น ผู้ว่าจ้างยังไม่อนุมัติแบบร่าง
          หรือยังไม่ส่งข้อมูลที่จำเป็น ผู้ว่าจ้างยินยอมขยายระยะเวลาให้ผู้รับจ้างอีกไม่น้อยกว่า <b>{extendDays}</b> วัน
          หรือจนกว่าเหตุดังกล่าวได้สิ้นสุดลง
        </Cl>
        <Cl n="2.2">
          ระยะเวลาการพิจารณาและอนุมัติแบบของผู้ว่าจ้างในแต่ละครั้ง ไม่นับรวมเป็นระยะเวลาดำเนินงานของผู้รับจ้าง
        </Cl>

        <div className="cl-h">3. การแก้ไขแบบ</div>
        <Cl n="3.1">
          ผู้ว่าจ้างมีสิทธิขอแก้ไขแบบร่างได้โดยไม่คิดค่าใช้จ่ายเพิ่ม จำนวน <b>{revisions}</b> ครั้ง
          โดยการแก้ไขนั้นต้องอยู่ภายในขอบเขตงานเดิมตามข้อ 1
        </Cl>
        <Cl n="3.2">
          การขอแก้ไขเกินจำนวนตามข้อ 3.1 หรือการเปลี่ยนแปลงขนาด รูปแบบ หรือประโยชน์ใช้สอยของอาคารไปจากที่ตกลงไว้เดิม
          ผู้รับจ้างจะเสนอค่าบริการเพิ่มเติมและระยะเวลาที่ต้องใช้ให้ผู้ว่าจ้างพิจารณาอนุมัติเป็นลายลักษณ์อักษรก่อนดำเนินการ
        </Cl>
        <Cl n="3.3">
          การแก้ไขแบบที่เกิดจากความผิดพลาดของผู้รับจ้างเอง หรือจากการที่แบบไม่เป็นไปตามกฎหมายควบคุมอาคาร
          ผู้รับจ้างจะแก้ไขให้โดยไม่คิดค่าใช้จ่ายและไม่ถือเป็นการแก้ไขตามข้อ 3.1
        </Cl>

        <div className="cl-h">4. ค่าจ้างออกแบบและงวดการชำระเงิน</div>
        <Cl n="4.1">
          มูลค่าโครงการที่ใช้เป็นฐานคิดค่าออกแบบ <b>{fmt(projectValue)}</b> บาท
          ค่าจ้างออกแบบคิดในอัตรา <b>{feePct}%</b> ของมูลค่าโครงการ
          รวมเป็นค่าจ้างออกแบบทั้งสิ้น <b>{fmt(fee)}</b> บาท ( {bahtText(fee)} )
        </Cl>
        <div className="hl-red">กำหนดการชำระค่าจ้างออกแบบ ตามงวดงานดังต่อไปนี้ ภายใน {payWithin} วัน นับแต่วันที่ผู้รับจ้างแจ้งตั้งเบิก</div>
        <table className="inst">
          <tbody>
            {insts.map((i, n) => {
              const subs = subsOf(i.subsJson)
              const amt = n0(i.amount)
              return [
                <tr key={i.id} className="inst-main">
                  <td className="no">4.1.{n + 1}</td>
                  <td className="b">{i.title}</td>
                  <td className="amt">
                    {num(i.percent) != null && <span className="pct">({Number(i.percent)}%) </span>}
                    เป็นเงิน <b className="mark">{int(amt)} บาท</b>
                    {n === 0 && <> เมื่อเซ็นสัญญาออกแบบ วันที่ {c.signDate ? thDateBE(c.signDate) : '-'}</>}
                  </td>
                </tr>,
                ...subs.map((sb, m) => (
                  <tr key={`${i.id}-${m}`} className="sub">
                    <td />
                    <td><span className="sno">4.1.{n + 1}.{m + 1}</span> {sb.title}</td>
                    <td className="amt">ชำระเป็น {int(sb.amount)} บาท</td>
                  </tr>
                )),
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
        <div className="star">*** ค่าจ้างออกแบบนี้{vat ? `รวมภาษีมูลค่าเพิ่ม ${vat}%` : 'ไม่รวมภาษีมูลค่าเพิ่ม 7%'} ***</div>
        <Cl n="4.2">{wht ? `หักภาษี ณ ที่จ่าย ${wht} %` : 'ไม่หัก ภาษี ณ ที่จ่าย 3 %'}</Cl>
        <Cl n="4.3">
          ผู้รับจ้างจะส่งมอบแบบของงวดใดให้ผู้ว่าจ้าง เมื่อผู้ว่าจ้างได้ชำระค่าจ้างของงวดนั้นครบถ้วนแล้ว
        </Cl>
        {c.creditToBuild && (
          <Cl n="4.4">
            <span className="red">
              หากผู้ว่าจ้างตกลงว่าจ้างผู้รับจ้างเป็นผู้ก่อสร้างโครงการตามแบบในสัญญาฉบับนี้ ผู้รับจ้างยินยอมให้นำค่าจ้างออกแบบ
              ที่ผู้ว่าจ้างได้ชำระไว้แล้วตามสัญญานี้ ไปหักออกจากค่าก่อสร้างตามสัญญาว่าจ้างรับเหมาก่อสร้างเต็มจำนวน
            </span>
          </Cl>
        )}

        <div className="cl-h">5. ลิขสิทธิ์และการนำแบบไปใช้</div>
        <Cl n="5.1">
          แบบและเอกสารทั้งหมดที่ผู้รับจ้างจัดทำขึ้นตามสัญญานี้ เป็นลิขสิทธิ์ของผู้รับจ้าง ผู้ว่าจ้างมีสิทธินำไปใช้ก่อสร้าง
          ได้เฉพาะโครงการตามสัญญานี้เพียงโครงการเดียว และเฉพาะเมื่อได้ชำระค่าจ้างครบถ้วนแล้ว
        </Cl>
        <Cl n="5.2">
          การนำแบบไปใช้ก่อสร้างโครงการอื่น ทำซ้ำ ดัดแปลง หรือส่งมอบให้บุคคลอื่นใช้ จะต้องได้รับความยินยอม
          เป็นลายลักษณ์อักษรจากผู้รับจ้างก่อน
        </Cl>
        <Cl n="5.3">
          ผู้ว่าจ้างยินยอมให้ผู้รับจ้างนำแบบ ภาพทัศนียภาพ 3 มิติ และผลงานตามสัญญานี้ ออกเผยแพร่โฆษณาทางสื่อทุกประเภทได้
          โดยถือเป็นผลงานของผู้รับจ้าง
        </Cl>

        <div className="cl-h">6. หน้าที่ของผู้ว่าจ้าง</div>
        <Cl n="6.1">
          ผู้ว่าจ้างจะส่งมอบข้อมูลที่จำเป็นต่อการออกแบบให้ผู้รับจ้าง เช่น สำเนาโฉนดที่ดิน แผนที่ที่ตั้ง ขนาดและรูปร่างที่ดิน
          ความต้องการใช้พื้นที่ และข้อจำกัดของที่ดิน ให้ครบถ้วนตั้งแต่เริ่มงาน
        </Cl>
        <Cl n="6.2">
          ผู้ว่าจ้างจะพิจารณาและแจ้งผลการอนุมัติแบบในแต่ละขั้นตอนให้ผู้รับจ้างทราบภายในเวลาอันสมควร
          และจะชำระค่าจ้างตามงวดที่กำหนดในข้อ 4
        </Cl>
        <Cl n="6.3">
          ความเสียหายที่เกิดจากข้อมูลของผู้ว่าจ้างที่ไม่ถูกต้องหรือไม่ครบถ้วน ผู้ว่าจ้างเป็นผู้รับผิดชอบ
        </Cl>

        <div className="cl-h">7. ค่าปรับและการบอกเลิกสัญญา</div>
        <Cl n="7.1">
          หากผู้รับจ้างส่งมอบงานออกแบบล่าช้ากว่ากำหนดในข้อ 2.1 โดยเป็นความผิดของผู้รับจ้างเอง
          ผู้ว่าจ้างกำหนดค่าปรับวันละ <b>{int(penalty)}</b> บาท
          <span className="red"> เว้นแต่ความล่าช้านั้นผู้รับจ้างได้บอกกล่าวกับผู้ว่าจ้างล่วงหน้าแล้ว</span>
        </Cl>
        <Cl n="7.2">
          คู่สัญญาฝ่ายใดประสงค์จะบอกเลิกสัญญา ให้แจ้งอีกฝ่ายเป็นลายลักษณ์อักษรล่วงหน้า และให้คิดค่าจ้างตามงวดงาน
          ที่ผู้รับจ้างได้ดำเนินการไปแล้วจนถึงวันบอกเลิกสัญญา โดยค่าจ้างของงวดที่ได้ส่งมอบแล้วไม่มีการคืน
        </Cl>
        <Cl n="7.3">
          ในกรณีที่บอกเลิกสัญญาก่อนชำระค่าจ้างครบถ้วน ผู้ว่าจ้างไม่มีสิทธินำแบบตามสัญญานี้ไปใช้ก่อสร้าง
        </Cl>

        {c.note && <p className="ind pre">{c.note}</p>}

        <p className="ind">
          สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความโดยตลอดแล้ว
          จึงได้ลงลายมือชื่อไว้ ณ <b>{thDateContract(c.signDate)}</b>
          {' '}และวันกำหนดส่งมอบแบบ <b>{thDateContract(c.dueDate)}</b> ต่างเก็บไว้เป็นหลักฐานฝ่ายละ 1 ฉบับ
        </p>
        <PayBox payTo={c.payTo} vat={vat} bankCompany={s.bankCompany} bankPersonal={s.bankPersonal} />
        <SignBlock employer={employer} employerSigner={c.employerSigner || ''} company={s.name}
          signer={signer} witness={s.witnessName || ''} />
      </div>

      <AttachmentPages files={files} />
    </div>
  )
}

