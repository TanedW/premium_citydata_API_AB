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
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      // 2. รับค่า organization_id จาก URL
      const { searchParams } = new URL(req.url);
      const organization_id = searchParams.get('organization_id');

      let result;

      if (organization_id) {
        // ✅ กรณีระบุ Org ID: ต้อง JOIN กับตาราง case_organizations (ตามรูปที่คุณส่งมา)
        // สมมติว่า PK ของ issue_cases คือ 'id' (UUID) ที่ไปตรงกับ 'case_id'
        result = await sql`
          SELECT DISTINCT ic.status 
          FROM issue_cases ic
          INNER JOIN case_organizations co ON ic.issue_cases_id = co.case_id 
          WHERE co.organization_id = ${organization_id}
          AND ic.status IS NOT NULL
          ORDER BY ic.status ASC
        `;
      } else {
        // ✅ กรณีไม่ระบุ: ดึงทั้งหมดจาก issue_cases ตรงๆ
        result = await sql`
          SELECT DISTINCT status 
          FROM issue_cases 
          WHERE status IS NOT NULL 
          ORDER BY status ASC
        `;
      }

      // แปลงผลลัพธ์เป็น Array ธรรมดา ['รอรับเรื่อง', 'เสร็จสิ้น', ...]
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