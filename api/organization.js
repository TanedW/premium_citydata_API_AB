
// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ตั้งค่า CORS Headers สำหรับอนุญาตให้ React App ของคุณเรียกใช้ API นี้ได้
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <-- URL ของ React App ของคุณ
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

  if (req.method === 'POST') {
    try {
      // 1. รับข้อมูลผู้ใช้ที่ล็อกอินสำเร็จจาก Frontend
      const { organization_code, organization_name } = await req.json();
      const sql = neon(process.env.DATABASE_URL);

      // 2. ค้นหาในฐานข้อมูลว่ามีผู้ใช้ที่ใช้อีเมลนี้อยู่แล้วหรือไม่
      const existingOrganization = await sql`SELECT * FROM organization WHERE "organization_code" = ${organization_code}`;

      // 3. ตรวจสอบผลลัพธ์การค้นหา
      if (existingOrganization.length > 0) {
        // --- กรณีที่ 1: เจอผู้ใช้ (อีเมลซ้ำ) -> ทำการอัปเดตและรวมบัญชี ---
        const user = existingOrganization[0];

        // ส่งข้อมูลผู้ใช้ที่อัปเดตแล้วกลับไป (Status 200 OK)
        return new Response(JSON.stringify(updatedUser[0]), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else {
        // --- กรณีที่ 2: ไม่เจอผู้ใช้ -> สร้างผู้ใช้ใหม่ ---
        const newOrganization = await sql`
          INSERT INTO users ("organization_code", "organization_name") 
          VALUES (${organization_code}, ${organization_name}) 
          RETURNING *;
        `;
        
        // ส่งข้อมูลผู้ใช้ใหม่กลับไป (Status 201 Created)
        return new Response(JSON.stringify(newOrganization[0]), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      // กรณีเกิดข้อผิดพลาดในการเชื่อมต่อหรือคำสั่ง SQL
      console.error("API Error:", error);
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: corsHeaders 
      });
    }
  }

  // หากมีการเรียกด้วย Method อื่นที่ไม่ใช่ POST หรือ OPTIONS
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
