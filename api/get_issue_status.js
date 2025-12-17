import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // จัดการ Preflight request (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      // ดึงสถานะ (Status) ที่ไม่ซ้ำกันจากตาราง issue_cases
      // ใช้ DISTINCT เพื่อตัดตัวซ้ำ และกรองค่า NULL ออก
      const result = await sql`
        SELECT DISTINCT status 
        FROM issue_cases 
        WHERE status IS NOT NULL 
        ORDER BY status ASC
      `;

      // ผลลัพธ์จาก DB จะเป็น Array ของ Object เช่น [{ status: 'รอรับเรื่อง' }, { status: 'เสร็จสิ้น' }]
      // เราแปลงให้เป็น Array ของ String ธรรมดา เช่น ['รอรับเรื่อง', 'เสร็จสิ้น'] เพื่อให้ Frontend ใช้ง่าย
      const statuses = result.map(row => row.status);

      return new Response(JSON.stringify(statuses), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("Database Error:", error);
      return new Response(JSON.stringify({ message: 'Fetch Status Failed', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
}