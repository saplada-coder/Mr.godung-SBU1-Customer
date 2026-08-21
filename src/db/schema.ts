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
export const roleEnum = pgEnum('role', ['owner', 'admin', 'sales', 'viewer'])

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
  'สร้างใบเสนอราคาแล้ว',
  'รอตรวจใบเสนอราคา',
  'ส่งใบเสนอราคาแล้ว',
  'ลูกค้าขอแก้ไขราคา',
  'ยกเลิก',
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/**
 * หมวดต้นทุน — 6 หมวดแรกใช้กับงานก่อสร้าง (ประมาณการ/งบ/รายจ่ายโครงการ)
 * 5 หมวดท้ายใช้กับค่าใช้จ่ายสำนักงาน (expenses ที่ project_id เป็น null)
 */
export const costCatEnum = pgEnum('cost_cat', [
  'material', 'labor', 'subcontract', 'equipment', 'transport', 'other',
  'salary', 'rent', 'utilities', 'marketing', 'office',
])

/** สถานะเอกสารใบเสนอราคา (varchar เหตุผลเดียวกับ LEAD_STATUSES — ข้อความไทยยาวเกิน pg enum) */
export const QDOC_STATUSES = [
  'ร่าง',
  'ส่งลูกค้าแล้ว',
  'ลูกค้าตกลง',
  'ถูกแทนที่',
  'ยกเลิก',
] as const
export type QdocStatus = (typeof QDOC_STATUSES)[number]

export const PROJECT_STATUSES = ['กำลังก่อสร้าง', 'ส่งมอบแล้ว', 'ปิดงาน'] as const
export const EXPENSE_STATUSES = ['รออนุมัติ', 'อนุมัติแล้ว', 'ตีกลับ'] as const
export const INST_WORK_STATUSES = ['รอดำเนินการ', 'กำลังทำ', 'ส่งมอบแล้ว'] as const
export const INST_PAY_STATUSES = ['ยังไม่วางบิล', 'วางบิลแล้ว', 'รับเงินแล้ว'] as const

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 190 }).notNull().unique(),
  /** Clerk user id — ผูกครั้งแรกที่ล็อกอิน ใช้ lookup เร็วโดยไม่ต้องเรียก Clerk API */
  clerkId: varchar('clerk_id', { length: 64 }).unique(),
  name: varchar('name', { length: 120 }),
  image: text('image'),
  role: roleEnum('role').notNull().default('viewer'),
  bu: buEnum('bu'),
  active: boolean('active').notNull().default(true),
  /** ลายเซ็น (data URL) — แปะอัตโนมัติในช่อง "ผู้เสนอราคา" ตอนพิมพ์ใบเสนอ */
  signatureUrl: text('signature_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** ลิงก์สั้นสำหรับลิงก์เชิญ (คัดลอกส่งไลน์/แชทได้สะดวก) — /i/[code] redirect ไป url จริง */
export const shortLinks = pgTable('short_links', {
  code: varchar('code', { length: 16 }).primaryKey(),
  url: text('url').notNull(),
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
    closedAt: date('closed_at'),
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
    /** ประวัติฝั่งใบเสนอราคา/งานก่อสร้าง ใช้ log เดียวกัน — ช่องไหนไม่เกี่ยวปล่อย null */
    quotationId: integer('quotation_id'),
    projectId: integer('project_id'),
    userId: integer('user_id').references(() => users.id),
    action: varchar('action', { length: 40 }).notNull(),
    field: varchar('field', { length: 40 }),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_customer_idx').on(t.customerId),
    index('activity_quotation_idx').on(t.quotationId),
    index('activity_project_idx').on(t.projectId),
  ],
)

/* ================= ใบเสนอราคา & Budget Control ================= */

/** ตั้งค่าบริษัท (แถวเดียว id=1) — หัวกระดาษ, บัญชีรับเงิน, ข้อความตั้งต้นของใบเสนอราคา */
export const companySettings = pgTable('company_settings', {
  id: integer('id').primaryKey().default(1),
  name: varchar('name', { length: 160 }),
  address: text('address'),
  phone: varchar('phone', { length: 160 }),
  lineId: varchar('line_id', { length: 60 }),
  website: varchar('website', { length: 160 }),
  email: varchar('email', { length: 160 }),
  taxId: varchar('tax_id', { length: 20 }),
  logoUrl: text('logo_url'),
  /** บัญชีรับเงิน 2 แบบ (ข้อความหลายบรรทัด: เลขบัญชี/ชื่อ/ธนาคาร) */
  bankPersonal: text('bank_personal'),
  bankCompany: text('bank_company'),
  warrantyText: text('warranty_text'),
  exclusionsText: text('exclusions_text'),
  permitDays: integer('permit_days'),
  buildDays: integer('build_days'),
  opFeePct: numeric('op_fee_pct', { precision: 5, scale: 2 }),
  /** รูปผลงานแนบท้ายใบเสนอราคา (JSON array ของ data URL) */
  portfolioJson: text('portfolio_json'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
})

export const quotations = pgTable(
  'quotations',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    /** เลขที่เอกสาร QT-BU1-2608001 = QT-{BU}-{ปี ค.ศ. 2 หลัก}{เดือน}{ลำดับ 3 หลักรันต่อเดือนต่อ BU} */
    code: varchar('code', { length: 30 }).notNull(),
    rev: integer('rev').notNull().default(1),
    status: varchar('status', { length: 30 }).$type<QdocStatus>().notNull().default('ร่าง'),
    issueDate: date('issue_date').notNull(),
    validUntil: date('valid_until'),
    acceptedAt: date('accepted_at'),
    refNo: varchar('ref_no', { length: 60 }),
    /** ข้อมูลลูกค้าบนหัวใบ — คัดลอกจาก CRM ตอนสร้าง แก้เฉพาะใบได้ (ที่อยู่เต็ม/เลขภาษี CRM ไม่มีเก็บ) */
    custName: varchar('cust_name', { length: 160 }),
    custAddress: text('cust_address'),
    custPhone: varchar('cust_phone', { length: 40 }),
    custTaxId: varchar('cust_tax_id', { length: 20 }),
    /** รูปผลงานแนบท้ายที่เลือกเฉพาะใบนี้ (JSON array data URL) — null = ใช้คลังจากตั้งค่าบริษัท */
    portfolioJson: text('portfolio_json'),
    opFeePct: numeric('op_fee_pct', { precision: 5, scale: 2 }),
    discountDesign: numeric('discount_design', { precision: 14, scale: 2 }),
    discountBuild: numeric('discount_build', { precision: 14, scale: 2 }),
    vatPct: numeric('vat_pct', { precision: 5, scale: 2 }),
    permitDays: integer('permit_days'),
    buildDays: integer('build_days'),
    exclusions: text('exclusions'),
    warranty: text('warranty'),
    spec: text('spec'),
    note: text('note'),
    includePortfolio: boolean('include_portfolio').notNull().default(true),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    sentAt: date('sent_at'),
    /** ใบที่ถูกแก้ไข → ชี้ไป rev ใหม่ที่แทนที่ */
    supersededById: integer('superseded_by_id'),
    projectId: integer('project_id'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quotations_customer_idx').on(t.customerId), index('quotations_status_idx').on(t.status)],
)

export const quotationItems = pgTable(
  'quotation_items',
  {
    id: serial('id').primaryKey(),
    quotationId: integer('quotation_id').notNull().references(() => quotations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    description: text('description').notNull(),
    qty: numeric('qty', { precision: 12, scale: 2 }),
    unit: varchar('unit', { length: 30 }),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    note: text('note'),
  },
  (t) => [index('qitems_quotation_idx').on(t.quotationId)],
)

/** ประมาณการต้นทุน (ภายใน ลูกค้าไม่เห็น) — กลายเป็นงบประมาณตั้งต้นของงานเมื่อเปิดงาน */
export const quotationCosts = pgTable(
  'quotation_costs',
  {
    id: serial('id').primaryKey(),
    quotationId: integer('quotation_id').notNull().references(() => quotations.id, { onDelete: 'cascade' }),
    category: costCatEnum('category').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [index('qcosts_quotation_idx').on(t.quotationId)],
)

/** งวดงาน/งวดเงินในใบเสนอราคา — คัดลอกเป็นงวดของงานจริงเมื่อเปิดงาน */
export const quotationInstallments = pgTable(
  'quotation_installments',
  {
    id: serial('id').primaryKey(),
    quotationId: integer('quotation_id').notNull().references(() => quotations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    detail: text('detail'),
    percent: numeric('percent', { precision: 6, scale: 2 }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    note: text('note'),
  },
  (t) => [index('qinst_quotation_idx').on(t.quotationId)],
)

/** งานก่อสร้าง — เปิดจากใบเสนอราคาที่ลูกค้าตกลง */
export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    quotationId: integer('quotation_id').references(() => quotations.id),
    /** PJ-BU1-2608001 รูปแบบเดียวกับเลขที่ใบเสนอราคา */
    code: varchar('code', { length: 30 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    bu: buEnum('bu').notNull(),
    contractAmount: numeric('contract_amount', { precision: 14, scale: 2 }).notNull(),
    vatPct: numeric('vat_pct', { precision: 5, scale: 2 }),
    status: varchar('status', { length: 30 }).notNull().default('กำลังก่อสร้าง'),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    closedAt: date('closed_at'),
    closedBy: integer('closed_by').references(() => users.id),
    ownerId: integer('owner_id').references(() => users.id),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('projects_customer_idx').on(t.customerId), index('projects_status_idx').on(t.status)],
)

/** งบประมาณรายหมวดของงาน (ตั้งต้นจาก quotation_costs แก้ทีหลังได้) */
export const projectBudgets = pgTable(
  'project_budgets',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    category: costCatEnum('category').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [index('pbudgets_project_idx').on(t.projectId)],
)

/**
 * ค่าใช้จ่ายจริง (แยกหมวดด้วย category) — นับเข้างบเมื่ออนุมัติแล้วเท่านั้น
 * projectId เป็น null = ค่าใช้จ่ายสำนักงาน (ไม่ผูกกับงานลูกค้า)
 */
export const expenses = pgTable(
  'expenses',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    category: costCatEnum('category').notNull(),
    description: text('description').notNull(),
    vendor: varchar('vendor', { length: 160 }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    expenseDate: date('expense_date').notNull(),
    /** รูปบิล/สลิป (data URL บีบอัดฝั่ง client) */
    receiptUrl: text('receipt_url'),
    status: varchar('status', { length: 30 }).notNull().default('รออนุมัติ'),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('expenses_project_idx').on(t.projectId), index('expenses_status_idx').on(t.status)],
)

/** งวดงาน/งวดเงินของงานจริง — ฝั่งรายรับ */
export const projectInstallments = pgTable(
  'project_installments',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    detail: text('detail'),
    percent: numeric('percent', { precision: 6, scale: 2 }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    dueDate: date('due_date'),
    workStatus: varchar('work_status', { length: 20 }).notNull().default('รอดำเนินการ'),
    payStatus: varchar('pay_status', { length: 20 }).notNull().default('ยังไม่วางบิล'),
    paidAt: date('paid_at'),
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }),
    note: text('note'),
  },
  (t) => [index('pinst_project_idx').on(t.projectId)],
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

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  customer: one(customers, { fields: [quotations.customerId], references: [customers.id] }),
  items: many(quotationItems),
  costs: many(quotationCosts),
  installments: many(quotationInstallments),
}))
export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationItems.quotationId], references: [quotations.id] }),
}))
export const quotationCostsRelations = relations(quotationCosts, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationCosts.quotationId], references: [quotations.id] }),
}))
export const quotationInstallmentsRelations = relations(quotationInstallments, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationInstallments.quotationId], references: [quotations.id] }),
}))
export const projectsRelations = relations(projects, ({ one, many }) => ({
  customer: one(customers, { fields: [projects.customerId], references: [customers.id] }),
  quotation: one(quotations, { fields: [projects.quotationId], references: [quotations.id] }),
  budgets: many(projectBudgets),
  expenses: many(expenses),
  installments: many(projectInstallments),
}))
export const projectBudgetsRelations = relations(projectBudgets, ({ one }) => ({
  project: one(projects, { fields: [projectBudgets.projectId], references: [projects.id] }),
}))
export const expensesRelations = relations(expenses, ({ one }) => ({
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
}))
export const projectInstallmentsRelations = relations(projectInstallments, ({ one }) => ({
  project: one(projects, { fields: [projectInstallments.projectId], references: [projects.id] }),
}))

/**
 * เอกสารการเงินของงานก่อสร้าง — kind: 'invoice' ใบแจ้งหนี้/ใบวางบิล · 'receipt' ใบเสร็จรับเงิน
 * · 'taxReceipt' ใบเสร็จรับเงิน/ใบกำกับภาษี — ยกเลิกได้แต่ห้ามลบ (เลขต้องรันต่อเนื่องตามหลักบัญชี)
 */
export const billingDocs = pgTable(
  'billing_docs',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 12 }).notNull(),
    /** IV-BU1-2608001 / RC-… / RT-… รันแยกประเภทต่อเดือนต่อ BU */
    code: varchar('code', { length: 30 }).notNull(),
    /** ใบเสร็จที่ออกจากใบแจ้งหนี้ → อ้างกลับ */
    invoiceRefId: integer('invoice_ref_id'),
    custName: varchar('cust_name', { length: 160 }),
    custAddress: text('cust_address'),
    custPhone: varchar('cust_phone', { length: 40 }),
    custTaxId: varchar('cust_tax_id', { length: 20 }),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date'),
    vatPct: numeric('vat_pct', { precision: 5, scale: 2 }),
    whtPct: numeric('wht_pct', { precision: 5, scale: 2 }),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric('vat_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    whtAmount: numeric('wht_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull(),
    payMethod: varchar('pay_method', { length: 20 }),
    payDate: date('pay_date'),
    payRef: varchar('pay_ref', { length: 80 }),
    note: text('note'),
    status: varchar('status', { length: 12 }).notNull().default('ปกติ'),
    cancelReason: text('cancel_reason'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('billing_project_idx').on(t.projectId), index('billing_kind_idx').on(t.kind)],
)

export const billingDocItems = pgTable(
  'billing_doc_items',
  {
    id: serial('id').primaryKey(),
    docId: integer('doc_id').notNull().references(() => billingDocs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    /** โยงกลับงวดที่ถูกวางบิล/รับเงิน (null = บรรทัดที่พิมพ์เพิ่มเอง) */
    installmentId: integer('installment_id'),
  },
  (t) => [index('billing_items_doc_idx').on(t.docId)],
)

export const billingDocsRelations = relations(billingDocs, ({ one, many }) => ({
  project: one(projects, { fields: [billingDocs.projectId], references: [projects.id] }),
  items: many(billingDocItems),
}))
export const billingDocItemsRelations = relations(billingDocItems, ({ one }) => ({
  doc: one(billingDocs, { fields: [billingDocItems.docId], references: [billingDocs.id] }),
}))

export type BillingDoc = typeof billingDocs.$inferSelect
export type BillingDocItem = typeof billingDocItems.$inferSelect

/** ใบสั่งซื้อ (PO) — ผูกงานก่อสร้าง (หมวดงบ 6 หมวด) หรือของสำนักงาน (project_id = null) */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** PO-BU1-2608001 รันต่อเดือนต่อ BU */
    code: varchar('code', { length: 30 }).notNull(),
    vendor: varchar('vendor', { length: 200 }).notNull(),
    vendorAddress: text('vendor_address'),
    vendorPhone: varchar('vendor_phone', { length: 40 }),
    category: costCatEnum('category'),
    issueDate: date('issue_date').notNull(),
    deliveryDate: date('delivery_date'),
    vatPct: numeric('vat_pct', { precision: 5, scale: 2 }),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric('vat_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull(),
    note: text('note'),
    /** PO เป็นเอกสารเดียวที่ต้องอนุมัติ: รออนุมัติ → อนุมัติแล้ว / ตีกลับ (+ ยกเลิก) */
    status: varchar('status', { length: 12 }).notNull().default('รออนุมัติ'),
    approvedBy: integer('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    cancelReason: text('cancel_reason'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('po_project_idx').on(t.projectId)],
)

export const poItems = pgTable(
  'po_items',
  {
    id: serial('id').primaryKey(),
    poId: integer('po_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    description: text('description').notNull(),
    qty: numeric('qty', { precision: 12, scale: 2 }),
    unit: varchar('unit', { length: 30 }),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [index('po_items_po_idx').on(t.poId)],
)

export type PurchaseOrder = typeof purchaseOrders.$inferSelect
export type PoItem = typeof poItems.$inferSelect

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Appointment = typeof appointments.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type User = typeof users.$inferSelect
export type Quotation = typeof quotations.$inferSelect
export type QuotationItem = typeof quotationItems.$inferSelect
export type QuotationCost = typeof quotationCosts.$inferSelect
export type QuotationInstallment = typeof quotationInstallments.$inferSelect
export type Project = typeof projects.$inferSelect
export type ProjectBudget = typeof projectBudgets.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type ProjectInstallment = typeof projectInstallments.$inferSelect
export type CompanySettings = typeof companySettings.$inferSelect
