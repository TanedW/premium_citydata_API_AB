// /api/get_case_detail.js
import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // แก้เป็น URL จริงของคุณ
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
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({
          message: 'Missing required query parameter: id'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Query 1: แก้ไข WHERE เป็น issue_case_id ตาม Database
      const caseResult = await sql`
        SELECT * FROM issue_cases 
        WHERE issue_case_id = ${id} 
        LIMIT 1
      `;

      if (caseResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Case not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const caseData = caseResult[0];

      // Query 2: ดึง Timeline (สันนิษฐานว่า Foreign Key ก็ชื่อ issue_case_id เช่นกัน)
      const logsResult = await sql`
        SELECT 
          status, 
          action_detail as detail, 
          created_at,
          changed_by 
        FROM case_activity_logs 
        WHERE issue_case_id = ${id} 
        ORDER BY created_at DESC
      `;

      const responseData = {
        info: caseData,
        timeline: logsResult
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

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
    status: 405,
    headers: corsHeaders
  });
}