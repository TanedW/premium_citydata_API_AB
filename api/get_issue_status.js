// api/get_issue_status.js

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
        // ✅ แก้ไข: เติม public. หน้าชื่อตารางทั้ง 2 จุด
        result = await sql`
          SELECT DISTINCT ic.status 
          FROM public.issue_cases ic
          INNER JOIN public.case_organizations co ON ic.issue_cases_id = co.case_id 
          WHERE co.organization_id = ${organization_id}
          AND ic.status IS NOT NULL
          ORDER BY ic.status ASC
        `;
      } else {
        // ✅ แก้ไข: เติม public. หน้าชื่อตาราง
        result = await sql`
          SELECT DISTINCT status 
          FROM public.issue_cases 
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