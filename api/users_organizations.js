// /api/user_organizations.js

// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ตั้งค่า CORS Headers (อัปเดต: เพิ่ม 'GET' ใน Allow-Methods)
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // <-- เพิ่ม GET
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  
  // ตอบกลับ request แบบ 'OPTIONS' (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Logic ใหม่สำหรับ HTTP GET (เมื่อต้องการดึงข้อมูล) ---
  if (req.method === 'GET') {
    try {
      const sql = neon(process.env.DATABASE_URL);
      
      // Vercel Edge Functions ต้องใช้ new URL เพื่อแยก query params
      // เราสร้าง URL จำลองเพื่อให้ .searchParams ทำงานได้ถูกต้อง
      const requestUrl = new URL(req.url, `http://${req.headers.get('host')}`);
      const user_id = requestUrl.searchParams.get('user_id');
      const organization_code = requestUrl.searchParams.get('organization_code');

      let queryResult;

      if (user_id) {
        // --- Case 1: ค้นหาทุก organization ที่ user คนนี้อยู่ ---
        queryResult = await sql`
          SELECT * FROM view_user_org_details WHERE "user_id" = ${user_id};
        `;
      } else if (organization_code) {
        // --- Case 2: ค้นหาทุก user ที่อยู่ใน organization นี้ ---
        queryResult = await sql`
          SELECT * FROM view_user_org_details WHERE "organization_code" = ${organization_code};
        `;
      } else {
        // --- Case 3: ไม่ได้ระบุ parameter ที่ถูกต้อง ---
        return new Response(JSON.stringify({ message: 'A query parameter (user_id or organization_code) is required' }), { 
            status: 400, // Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // --- ส่งข้อมูลที่ค้นหาเจอ (Status 200 OK) ---
      // queryResult จะเป็น array เสมอ (อาจจะว่าง ถ้าไม่เจอ)
      return new Response(JSON.stringify(queryResult), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("API Error (GET):", error);
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- Logic เดิมสำหรับ HTTP POST (เมื่อต้องการเชื่อม User กับ Organization) ---
  if (req.method === 'POST') {
    try {
      // 1. รับข้อมูล user_id และ organization_code จาก Frontend
      const { user_id, organization_code } = await req.json();

      // ตรวจสอบว่าได้รับข้อมูลครบถ้วนหรือไม่
      if (!user_id || !organization_code) {
        return new Response(JSON.stringify({ message: 'user_id and organization_code are required' }), { 
            status: 400, // Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sql = neon(process.env.DATABASE_URL);

      // 2. ตรวจสอบก่อนว่า User คนนี้เคยผูกกับ Organization นี้แล้วหรือยัง
      const existingLink = await sql`
        SELECT * FROM users_organizations 
        WHERE "user_id" = ${user_id} AND "organization_code" = ${organization_code}
      `;

      // 3. ถ้าเจอข้อมูล (array มีสมาชิกมากกว่า 0) แสดงว่าเคยเชื่อมกันแล้ว
      if (existingLink.length > 0) {
        // --- กรณีที่ 1: ข้อมูลซ้ำ ---
        return new Response(JSON.stringify({ message: 'User is already in this organization' }), { 
            status: 409, // Conflict - ข้อมูลนี้มีอยู่แล้ว
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // --- กรณีที่ 2: ยังไม่เคยเชื่อม -> สร้างความสัมพันธ์ใหม่ ---
        const newUserOrgLink = await sql`
          INSERT INTO users_organizations (user_id, organization_code) 
          VALUES (${user_id}, ${organization_code}) 
          RETURNING *; -- ส่งข้อมูลที่เพิ่งสร้างกลับไป
        `;
        
        // ส่งข้อมูลใหม่กลับไป (Status 201 Created)
        return new Response(JSON.stringify(newUserOrgLink[0]), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      // กรณีเกิดข้อผิดพลาด, อาจจะเกิดจาก user_id หรือ organization_code ไม่มีอยู่จริง (Foreign Key constraint)
      console.error("API Error (POST):", error);
      
      // ตรวจสอบ error code เฉพาะของ PostgreSQL สำหรับ Foreign Key Violation
      if (error.code === '23503') { // 23503 คือรหัส lỗi ของ foreign_key_violation
        return new Response(JSON.stringify({ message: 'Invalid user_id or organization_code' }), { 
            status: 404, // Not Found - เพราะหา user หรือ org ไม่เจอ
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // สำหรับ error อื่นๆ
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // หากมีการเรียกด้วย Method อื่น (เช่น PUT, DELETE)
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}