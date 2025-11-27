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

      // --- Query 1: ข้อมูลหลัก + ชื่อหน่วยงาน + ชื่อประเภทปัญหา (NEW) ---
      // JOIN 1: หาชื่อหน่วยงาน (organizations)
      // JOIN 2: หาชื่อประเภท (issue_types) ตามรูปที่คุณแนบ
      const caseResult = await sql`
        SELECT 
            ic.*,
            org.organization_name AS agency_name,
            it.name AS issue_category_name
        FROM issue_cases ic
        LEFT JOIN case_organizations co ON ic.issue_cases_id = co.case_id
        LEFT JOIN organizations org ON co.organization_id = org.organization_id
        LEFT JOIN issue_types it ON ic.issue_type_id = it.issue_id 
        WHERE ic.issue_cases_id = ${id} 
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
        
        if (log.comment) {
            description += ` (${log.comment})`;
        }

        return {
          status: log.new_value,
          detail: description,
          created_at: log.created_at,
          changed_by: log.changed_by_user_id
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