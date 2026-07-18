import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!
  const sql = neon(url)
  const file = readFileSync('drizzle/0000_init.sql', 'utf8')
  const stmts = file.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
  console.log(`applying ${stmts.length} statements…`)
  for (let i = 0; i < stmts.length; i++) {
    try {
      await sql.query(stmts[i])
    } catch (e) {
      const msg = (e as Error).message
      if (/already exists/.test(msg)) { console.log(`  [${i}] skip (exists)`); continue }
      console.error(`  [${i}] FAILED:`, msg, '\n', stmts[i].slice(0, 90))
      throw e
    }
  }
  console.log('✓ schema applied')
}
main().catch((e) => { console.error(e.message); process.exit(1) })
