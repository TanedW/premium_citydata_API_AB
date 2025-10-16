// api/items.js

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
      // ✅ ถูกต้อง: ดึงค่ามาจาก Environment Variable ที่ตั้งค่าไว้บน Vercel
      const sql = neon(process.env.DATABASE_URL); 
      const items = await sql`SELECT * FROM users;`;
      
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ message: 'Failed to fetch items', error: error.message }), { status: 500 });
    }
  }  
  
  if (req.method === 'POST') {
    // === CREATE (สร้างข้อมูลใหม่) ===
    try {
      const { email, first_name, last_name, provider, access_token } = await req.json(); // รับข้อมูลจาก body
      
      // ✅ ถูกต้อง: ดึงค่ามาจาก Environment Variable
      const sql = neon(process.env.DATABASE_URL);
      
      const newItem = await sql`INSERT INTO users (email, "first_name", "last_name", "provider", "access_token") VALUES (${email}, ${first_name}, ${last_name}, ${provider}, ${access_token}) RETURNING *;`;
      
      return new Response(JSON.stringify(newItem[0]), { status: 201 });
    } catch (error) {
      return new Response(JSON.stringify({ message: 'Failed to create item', error: error.message }), { status: 500 });
    }
  }

  // หากเป็น method อื่นที่ไม่รองรับ
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { status: 405 });
}