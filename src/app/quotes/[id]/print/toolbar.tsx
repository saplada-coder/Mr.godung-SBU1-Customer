'use client'

/** แถบปุ่มลอยบนหน้าพิมพ์ — สั่งพิมพ์/บันทึก PDF แล้วส่งไลน์ให้ลูกค้าได้เลย (ซ่อนอัตโนมัติตอนพิมพ์) */
export default function PrintToolbar() {
  return (
    <div className="ptoolbar">
      <button onClick={() => window.close()}>ปิด</button>
      <button onClick={() => window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
    </div>
  )
}
