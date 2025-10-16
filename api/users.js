// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ฟังก์ชันหลักที่จะถูกเรียกเมื่อมี request เข้ามาที่ /api/items
export default async function handler(req) {
  // --- ตรวจสอบ HTTP Method ---
  if (req.method === 'GET') {
    // === READ (ดึงข้อมูล) ===
    try {
      const sql = neon(process.env.DATABASE_URL); // เชื่อมต่อ DB จาก Environment Variable
      const items = await sql`SELECT * FROM your_table_name;`; // **<-- แก้ชื่อตารางตรงนี้**
      
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ message: 'Failed to fetch items' }), { status: 500 });
    }
  } 
  
  if (req.method === 'POST') {
    // === CREATE (สร้างข้อมูลใหม่) ===
    try {
      const { name, description } = await req.json(); // รับข้อมูลจาก body
      const sql = neon(process.env.DATABASE_URL);
      
      const newItem = await sql`INSERT INTO your_table_name (name, description) VALUES (${name}, ${description}) RETURNING *;`;
      
      return new Response(JSON.stringify(newItem[0]), { status: 201 });
    } catch (error) {
      return new Response(JSON.stringify({ message: 'Failed to create item' }), { status: 500 });
    }
  }

  // หากเป็น method อื่นที่ไม่รองรับ
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { status: 405 });
}