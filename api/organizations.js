// /api/organizations.js

// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ตั้งค่า CORS Headers สำหรับอนุญาตให้ React App ของคุณเรียกใช้ API นี้ได้
const corsHeaders = {
  // **สำคัญ:** อย่าลืมเปลี่ยนเป็น URL ของ React App ของคุณ
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', 
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // อนุญาตเฉพาะ POST และ OPTIONS
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  // ตอบกลับ request แบบ 'OPTIONS' (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Logic หลักสำหรับ HTTP POST (เมื่อมีการสร้างองค์กร) ---
  if (req.method === 'POST') {
    try {
      // [!! แก้ไข !!]
      // 1. รับข้อมูล organization_code, organization_name 
      //    และ UUIDs ใหม่ 2 ตัวจาก Frontend
      const { 
        organization_code, 
        organization_name, 
        org_type_id, 
        usage_type_id 
      } = await req.json();

      // ตรวจสอบว่าได้รับข้อมูล "หลัก" ครบถ้วนหรือไม่
      // (org_type_id และ usage_type_id อาจเป็น null ได้ ถ้า DB อนุญาต)
      if (!organization_code || !organization_name) {
        return new Response(JSON.stringify({ message: 'organization_code and organization_name are required' }), { 
            status: 400, // Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sql = neon(process.env.DATABASE_URL);

      // 2. ค้นหาในฐานข้อมูลว่ามี organization_code นี้อยู่แล้วหรือไม่
      const existingOrg = await sql`
        SELECT organization_code FROM organizations WHERE "organization_code" = ${organization_code}
      `;

      // 3. ถ้าเจอข้อมูล (array มีสมาชิกมากกว่า 0) แสดงว่ามีอยู่แล้ว
      if (existingOrg.length > 0) {
        // --- กรณีที่ 1: organization_code ซ้ำ ---
        return new Response(JSON.stringify({ message: 'organization is already' }), { 
            status: 409, // 409 Conflict เป็น status code ที่เหมาะสมสำหรับข้อมูลซ้ำ
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // --- กรณีที่ 2: ไม่ซ้ำ -> สร้างองค์กรใหม่ ---
        
        // [!! แก้ไข !!]
        // เพิ่ม org_type_id และ usage_type_id เข้าไปในคำสั่ง INSERT
        // ใช้ || null เพื่อป้องกัน error หาก frontend ส่ง "undefined" หรือ "" (ค่าว่าง) มา
        const newOrg = await sql`
          INSERT INTO organizations (
            organization_code, 
            organization_name,
            org_type_id,
            usage_type_id
          ) 
          VALUES (
            ${organization_code}, 
            ${organization_name},
            ${org_type_id || null},
            ${usage_type_id || null}
          ) 
          RETURNING *; -- RETURNING * เพื่อส่งข้อมูลที่เพิ่งสร้างกลับไป
        `;
        
        // ส่งข้อมูลองค์กรใหม่กลับไป (Status 201 Created)
        return new Response(JSON.stringify(newOrg[0]), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      // กรณีเกิดข้อผิดพลาดในการเชื่อมต่อหรือคำสั่ง SQL
      console.error("API Error:", error);
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // หากมีการเรียกด้วย Method อื่นที่ไม่ใช่ POST หรือ OPTIONS
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}