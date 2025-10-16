// api/users.js (หรือไฟล์ API ของคุณ)

export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// --- ส่วนที่เพิ่มเข้ามาสำหรับ CORS ---
// สร้าง object เก็บ headers ไว้ใช้ซ้ำ
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <--- URL ของ React App ของคุณ
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // --- ส่วนที่เพิ่มเข้ามาสำหรับ CORS ---
  // ตอบกลับ request แบบ OPTIONS ทันที (นี่คือ preflight request ที่ browser ส่งมาถามก่อน)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- โค้ดเดิมของคุณ ---
  if (req.method === 'GET') {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const items = await sql`SELECT * FROM users;`;
      
      // เพิ่ม headers เข้าไปใน Response
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ message: 'Failed to fetch items' }), { status: 500, headers: corsHeaders });
    }
  }  
  
  if (req.method === 'POST') {
    try {
      const { email, first_name, last_name, provider, access_token } = await req.json();
      const sql = neon(process.env.DATABASE_URL);
      
      const newItem = await sql`INSERT INTO users (email, "first_name", "last_name", "provider", "access_token") VALUES (${email}, ${first_name}, ${last_name}, ${provider}, ${access_token}) RETURNING *;`;
      
      // เพิ่ม headers เข้าไปใน Response
      return new Response(JSON.stringify(newItem[0]), { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ message: 'Failed to create item' }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { status: 405, headers: corsHeaders });
}