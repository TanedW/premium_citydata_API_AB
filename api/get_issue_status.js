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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      // 1. ดึง organization_id จาก URL Parameters
      const { searchParams } = new URL(req.url);
      const organization_id = searchParams.get('organization_id');

      let result;

      if (organization_id) {
        // กรณีระบุ Org ID: ดึงสถานะเฉพาะของหน่วยงานนั้น
        result = await sql`
          SELECT DISTINCT status 
          FROM issue_cases 
          WHERE status IS NOT NULL 
          AND organization_id = ${organization_id}
          ORDER BY status ASC
        `;
      } else {
        // กรณีไม่ระบุ (เผื่อไว้): ดึงสถานะทั้งหมดในระบบ
        result = await sql`
          SELECT DISTINCT status 
          FROM issue_cases 
          WHERE status IS NOT NULL 
          ORDER BY status ASC
        `;
      }

      const statuses = result.map(row => row.status);

      return new Response(JSON.stringify(statuses), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ message: 'Fetch Failed', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
}