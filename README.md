# Mr.โกดัง · SBU1 - Customer

ระบบจัดการลูกค้าและใบเสนอราคา (CRM) สำหรับทีมขาย SBU1

**Live:** https://summary-flame.vercel.app

## Stack
- **Next.js 16** (App Router, TypeScript)
- **Neon Postgres** + **Drizzle ORM** — ฐานข้อมูล
- **Clerk** — ล็อกอินด้วย Google (3 สิทธิ์: admin / sales / viewer)
- **Vercel** — hosting

---

## เริ่มใช้งานใน VS Code

### 1. เปิดโฟลเดอร์
เปิด VS Code → **File → Open Folder…** → เลือกโฟลเดอร์นี้

### 2. ติดตั้ง dependencies (ทำครั้งแรกครั้งเดียว)
```bash
npm install
```

### 3. ไฟล์ลับ (`.env.local`)
ต้องมีไฟล์ `.env.local` (มีอยู่แล้วในเครื่อง / ไม่ขึ้น git) — ถ้าหาย ดึงกลับด้วย:
```bash
vercel env pull .env.local
```
คีย์ที่ต้องมีดูได้ใน `.env.example`

### 4. รันในเครื่อง (dev)
```bash
npm run dev
```
เปิด http://localhost:3000 (ถ้าพอร์ตชนจะเด้งเป็น 3001/3002 — ดูใน terminal)

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รันเว็ปในเครื่อง (แก้โค้ดแล้วเห็นผลทันที) |
| `npm run build` | ทดสอบ build ก่อน deploy |
| `npm run db:seed` | ย้าย/รีเซ็ตข้อมูลจาก `scripts/seed-data.json` เข้า DB |
| `npm run db:generate` | สร้างไฟล์ migration ใหม่หลังแก้ schema |
| `vercel --prod` | deploy ขึ้น production (https://summary-flame.vercel.app) |

---

## โครงสร้างไฟล์

```
src/
  app/
    layout.tsx           # ครอบด้วย Clerk + ฟอนต์ไทย
    page.tsx             # หน้าแรก (เช็ค login แล้วเรนเดอร์ Dashboard)
    Dashboard.tsx        # หน้าเว็ปหลักทั้งหมด (5 หน้า + ตาราง + ฟอร์ม)
    globals.css          # ธีมขาว-แดง-ดำ + สไตล์ทั้งหมด
    sign-in/             # หน้า login
    api/
      customers/         # อ่าน/เพิ่ม/แก้/ลบ ลูกค้า
      rates/             # เรตราคาต่อ BU
  db/
    schema.ts            # ตารางฐานข้อมูล (Drizzle)
    index.ts             # การเชื่อมต่อ DB
  lib/
    constants.ts         # สถานะ/สี/BU/จังหวัด (แก้ที่นี่ที่เดียว ใช้ทั้งแอป)
    auth.ts              # ดึง user + สิทธิ์จาก Clerk
    format.ts            # ฟอร์แมตวันที่/ตัวเลข/เบอร์
scripts/
  seed.ts / seed-data.json   # ข้อมูลตั้งต้น 723 รายการ
```

---

## แก้อะไรที่ไหน (สำหรับปรับต่อ)
- **เพิ่ม/แก้สถานะติดตาม หรือสี** → `src/lib/constants.ts` (`STAGES`)
- **แก้หน้าเว็ป/ตาราง/ฟอร์ม** → `src/app/Dashboard.tsx`
- **แก้ธีมสี/สไตล์** → `src/app/globals.css` (ตัวแปร `--accent` ฯลฯ)
- **เพิ่มคอลัมน์ในฐานข้อมูล** → แก้ `src/db/schema.ts` แล้ว `npm run db:generate` + `npm run db:seed`

> ⚠️ **อย่าเก็บโปรเจกต์ไว้ใน `~/Desktop`** (sync iCloud อาจลบไฟล์) — ย้ายไป `~/code/` จะปลอดภัยกว่า
