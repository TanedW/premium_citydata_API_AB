// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';
DATABASE_URL='postgresql://neondb_owner:npg_F89piaVZKBjf@ep-quiet-art-adqqwbyu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

// ฟังก์ชันหลักที่จะถูกเรียกเมื่อมี request เข้ามาที่ /api/items
export default async function handler(req) {
  // --- ตรวจสอบ HTTP Method ---
  if (req.method === 'GET') {
    // === READ (ดึงข้อมูล) ===
    try {
      const sql = neon(process.env.DATABASE_URL); // เชื่อมต่อ DB จาก Environment Variable
      const items = await sql`SELECT * FROM users;`; // **<-- แก้ชื่อตารางตรงนี้**
      
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
      const { Email, First_Name, Last_Name, Provider, Access_Token } = await req.json(); // รับข้อมูลจาก body
      const sql = neon(process.env.DATABASE_URL);
      
      const newItem = await sql`INSERT INTO users (Email, First_Name, Last_Name, Provider, Access_Token) VALUES 
      (${Email}, ${First_Name}, ${Last_Name}, ${Provider}, ${Access_Token}) RETURNING *;`;
      
      return new Response(JSON.stringify(newItem[0]), { status: 201 });
    } catch (error) {
      return new Response(JSON.stringify({ message: 'Failed to create item' }), { status: 500 });
    }
  }

  // หากเป็น method อื่นที่ไม่รองรับ
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { status: 405 });
}