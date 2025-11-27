// /api/get_case_detail.js
import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', 
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

      // --- Query 1: ข้อมูลหลัก ---
      // ใช้ issue_cases_id (ถูกต้องตามตาราง issue_cases)
      const caseResult = await sql`
        SELECT * FROM issue_cases 
        WHERE issue_cases_id = ${id} 
        LIMIT 1
      `;

      if (caseResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Case not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const caseData = caseResult[0];

      // --- Query 2: Timeline ---
      // *** แก้ไขจุดที่ Error: เปลี่ยนจาก issue_cases_id เป็น case_id ให้ตรงกับตาราง case_activity_logs ***
      const rawLogs = await sql`
        SELECT 
          created_at,
          changed_by_user_id,
          old_value,
          new_value,
          activity_type, 
          comment
        FROM case_activity_logs 
        WHERE case_id = ${id} 
        ORDER BY created_at DESC
      `;

      const formattedTimeline = rawLogs.map(log => {
        let description = log.new_value;
        if (log.old_value && log.old_value !== log.new_value) {
          description = `เปลี่ยนสถานะจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (!log.old_value) {
          description = `สถานะเริ่มต้น: ${log.new_value}`;
        }
        
        // เพิ่ม comment ถ้ามี
        if (log.comment) {
            description += ` (${log.comment})`;
        }

        return {
          status: log.new_value,
          detail: description,
          created_at: log.created_at,
          changed_by: log.changed_by_user_id // แก้ให้ตรงกับชื่อ column ที่ select มา
        };
      });

      const responseData = {
        info: caseData,
        timeline: formattedTimeline
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