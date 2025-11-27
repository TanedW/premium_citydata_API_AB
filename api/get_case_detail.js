// /api/get_case_detail.js
import { neon } from '@neondatabase/serverless';

// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

// ตั้งค่า CORS Headers
const corsHeaders = {
  // **สำคัญ:** อย่าลืมเปลี่ยนเป็น URL ของ React App ของคุณ หรือใช้ '*' เพื่อทดสอบ
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, OPTIONS', // อนุญาต GET
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  // 1. ตอบกลับ request แบบ 'OPTIONS' (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  // =========================================================
  // SECTION 1: GET -> ดึงรายละเอียดเคสและ Timeline
  // =========================================================
  if (req.method === 'GET') {
    try {
      // ดึงค่า id จาก Query Parameters (เช่น /api/get_case_detail?id=RQ-001)
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');

      // Validation: ตรวจสอบว่าส่ง id มาหรือไม่
      if (!id) {
        return new Response(JSON.stringify({
          message: 'Missing required query parameter: id'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Query 1: ดึงข้อมูลรายละเอียดของเคสจากตาราง issue_cases
      // ใช้ LIMIT 1 เพื่อความมั่นใจว่าจะได้แค่แถวเดียว
      const caseResult = await sql`
        SELECT * FROM issue_cases 
        WHERE id = ${id} 
        LIMIT 1
      `;

      if (caseResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Case not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const caseData = caseResult[0];

      // Query 2: ดึงข้อมูล Timeline (Logs) ที่เกี่ยวข้องกับเคสนี้
      // เรียงจากใหม่ไปเก่า (DESC)
      const logsResult = await sql`
        SELECT 
          status, 
          action_detail as detail, 
          created_at,
          changed_by 
        FROM case_activity_logs 
        WHERE case_id = ${id} 
        ORDER BY created_at DESC
      `;

      // รวมข้อมูลทั้งสองส่วนเพื่อส่งกลับ
      const responseData = {
        info: caseData,       // ข้อมูลหลัก (หัวข้อ, รูป, พิกัด)
        timeline: logsResult  // รายการประวัติการทำงาน
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("GET Error:", error);
      return new Response(JSON.stringify({ message: 'Fetch Failed', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // หากเรียก Method อื่นที่ไม่ใช่ GET หรือ OPTIONS
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
    status: 405,
    headers: corsHeaders
  });
}