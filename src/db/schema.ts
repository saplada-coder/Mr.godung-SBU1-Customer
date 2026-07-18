import {
  pgTable,
  pgEnum,
  text,
  varchar,
  integer,
  numeric,
  timestamp,
  date,
  boolean,
  serial,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

/* ---- Enums (สั้น/ASCII พอที่จะเป็น pg enum ได้) ---- */
export const buEnum = pgEnum('bu', ['BU1', 'BU2', 'BU3', 'BU4', 'BU5', 'BU6', 'BU7'])
export const channelEnum = pgEnum('channel', ['FB : Mr.โกดัง', 'Line OA', 'โทร', 'MD', 'อื่นๆ'])
export const apptTypeEnum = pgEnum('appt_type', ['zoom', 'site'])
export const roleEnum = pgEnum('role', ['admin', 'sales', 'viewer'])

/**
 * สถานะติดตาม/ใบเสนอราคา เก็บเป็น varchar (ไม่ใช่ pg enum) เพราะ enum label ของ Postgres
 * จำกัด 63 ไบต์ ซึ่งข้อความไทย (3 ไบต์/ตัว) บางค่ายาวเกิน — validate ที่ชั้นแอปแทน
 */
export const LEAD_STATUSES = [
  'ลูกค้าใหม่ – รอติดต่อ',
  'กำลังติดต่อ – ขอรายละเอียด',
  'รอลูกค้าตอบกลับ',
  'นัด Zoom / ดูหน้างาน',
  'รอลูกค้าตัดสินใจ',
  'ต่อรอง / แก้ไขแบบ-ราคา',
  'คาดว่าจะได้งาน',
  'รอเซ็นสัญญา / มัดจำ',
  'ปิดงาน (ได้งาน)',
  'ไม่สนใจ / ปิดไม่ได้',
  'ติดต่อไม่ได้',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const QUOTE_STATUSES = [
  'ยังไม่ทำใบเสนอราคา',
  'ขอข้อมูลเพิ่มเติม',
  'รอทำใบเสนอราคา',
  'รอตรวจใบเสนอราคา',
  'ส่งใบเสนอราคาแล้ว',
  'ลูกค้าขอแก้ไขราคา',
  'ยกเลิก',
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 190 }).notNull().unique(),
  name: varchar('name', { length: 120 }),
  image: text('image'),
  role: roleEnum('role').notNull().default('viewer'),
  bu: buEnum('bu'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const buRates = pgTable('bu_rates', {
  bu: buEnum('bu').primaryKey(),
  ratePerSqm: integer('rate_per_sqm').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
})

export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 40 }).notNull().unique(),
    bu: buEnum('bu').notNull(),
    name: varchar('name', { length: 120 }),
    channel: channelEnum('channel'),
    chname: varchar('chname', { length: 120 }),
    phone: varchar('phone', { length: 20 }),
    province: varchar('province', { length: 60 }),
    detail: text('detail'),
    cat: varchar('cat', { length: 60 }),
    widthM: numeric('width_m', { precision: 8, scale: 2 }),
    lengthM: numeric('length_m', { precision: 8, scale: 2 }),
    heightM: numeric('height_m', { precision: 8, scale: 2 }),
    sqm: numeric('sqm', { precision: 12, scale: 2 }),
    amountEst: numeric('amount_est', { precision: 14, scale: 2 }),
    amountActual: numeric('amount_actual', { precision: 14, scale: 2 }),
    status: varchar('status', { length: 60 }).$type<LeadStatus>().notNull().default('ลูกค้าใหม่ – รอติดต่อ'),
    quoteStatus: varchar('quote_status', { length: 60 }).$type<QuoteStatus>().notNull().default('ยังไม่ทำใบเสนอราคา'),
    inquiredAt: date('inquired_at'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ownerId: integer('owner_id').references(() => users.id),
  },
  (t) => [
    index('customers_bu_idx').on(t.bu),
    index('customers_status_idx').on(t.status),
    index('customers_quote_status_idx').on(t.quoteStatus),
    index('customers_inquired_at_idx').on(t.inquiredAt),
  ],
)

export const appointments = pgTable(
  'appointments',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    type: apptTypeEnum('type').notNull(),
    apptDate: date('appt_date').notNull(),
    apptTime: varchar('appt_time', { length: 5 }),
    note: text('note'),
    done: boolean('done').notNull().default(false),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => [index('appointments_date_idx').on(t.apptDate), index('appointments_customer_idx').on(t.customerId)],
)

export const attachments = pgTable(
  'attachments',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 10 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    url: text('url').notNull(),
    mime: varchar('mime', { length: 100 }),
    sizeBytes: integer('size_bytes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => [index('attachments_customer_idx').on(t.customerId)],
)

export const notes = pgTable(
  'notes',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => [index('notes_customer_idx').on(t.customerId)],
)

export const activityLog = pgTable(
  'activity_log',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    action: varchar('action', { length: 40 }).notNull(),
    field: varchar('field', { length: 40 }),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_customer_idx').on(t.customerId)],
)

export const customersRelations = relations(customers, ({ many, one }) => ({
  appointments: many(appointments),
  attachments: many(attachments),
  notes: many(notes),
  owner: one(users, { fields: [customers.ownerId], references: [users.id] }),
}))
export const appointmentsRelations = relations(appointments, ({ one }) => ({
  customer: one(customers, { fields: [appointments.customerId], references: [customers.id] }),
}))
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  customer: one(customers, { fields: [attachments.customerId], references: [customers.id] }),
}))
export const notesRelations = relations(notes, ({ one }) => ({
  customer: one(customers, { fields: [notes.customerId], references: [customers.id] }),
}))

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Appointment = typeof appointments.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type User = typeof users.$inferSelect
