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
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400', // Cache preflight requests for 24 hours
};

// Function to generate a random code (e.g., ADMIN-XXXX or CODE-XXXXX)
const generateOrgCode = (prefix, length) => {
    const randomPart = Math.random().toString(36).substring(2, 2 + length).toUpperCase();
    return `${prefix}-${randomPart}`;
};

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  // ตอบกลับ request แบบ 'OPTIONS' (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Logic หลักสำหรับ HTTP POST (เมื่อมีการสร้างองค์กร) ---
  if (req.method === 'POST') {
    let organization_name;
    
    try {
      // 1. รับข้อมูล organization_name จาก Frontend
      const data = await req.json();
      organization_name = data.organization_name;

      if (!organization_name) {
        return new Response(JSON.stringify({ message: 'organization_name is required' }), { 
            status: 400, // Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sql = neon(process.env.DATABASE_URL);

      // 2. สร้าง Admin Code และ Organization Code (User Code)
      const adminCode = generateOrgCode('ADMIN', 4); // เช่น ADMIN-H8DK
      const userCode = generateOrgCode('USER', 5); // เช่น USER-8G9F2
      
      // 3. ตรวจสอบว่า adminCode ซ้ำหรือไม่ (ป้องกัน Conflict: 409)
      // Note: We check for admin_code uniqueness because it is set as UNIQUE NOT NULL in DB
      const existingAdminCode = await sql`
        SELECT admin_code FROM organizations WHERE "admin_code" = ${adminCode}
      `;
      
      if (existingAdminCode.length > 0) {
        // กรณีที่ 1: admin_code ซ้ำ (โอกาสน้อยมาก)
        return new Response(JSON.stringify({ message: 'Conflict generating organization codes. Please retry.' }), { 
            status: 409, // 409 Conflict
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // 4. สร้างองค์กรใหม่
      // *Note: org_type_id และ usage_type_id ถูกละเว้นในขั้นตอนนี้ เพราะจะถูกอัปเดตภายหลังใน SetupGuidePage
      const newOrg = await sql`
        INSERT INTO organizations (
          organization_name,
          admin_code,
          organization_code
        ) 
        VALUES (
          ${organization_name}, 
          ${adminCode},
          ${userCode}
        ) 
        RETURNING organization_id, organization_name, admin_code, organization_code; 
      `;
      
      // 5. ส่งข้อมูลองค์กรใหม่กลับไป (Status 201 Created)
      return new Response(JSON.stringify(newOrg[0]), { 
          status: 201, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // กรณีเกิดข้อผิดพลาดในการเชื่อมต่อหรือคำสั่ง SQL
      console.error("API Error:", error);
      return new Response(JSON.stringify({ 
          message: 'An internal server error occurred during organization creation.', 
          error: error.message 
      }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // หากมีการเรียกด้วย Method อื่นที่ไม่ใช่ POST หรือ OPTIONS
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  });
}