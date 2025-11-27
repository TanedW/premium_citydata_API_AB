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

      // Query 1: ข้อมูลหลัก (ใช้ issue_cases_id ตามที่แจ้ง)
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

      // Query 2: Timeline (ดึง old_value และ new_value)
      const rawLogs = await sql`
        SELECT 
          created_at,
          changed_by,
          old_value,
          new_value
        FROM case_activity_logs 
        WHERE issue_cases_id = ${id} 
        ORDER BY created_at DESC
      `;

      // ปรับแต่งข้อมูล Timeline ให้ Frontend แสดงผลได้สวยงาม
      const formattedTimeline = rawLogs.map(log => {
        // สร้างคำอธิบาย (Detail) จากการเปลี่ยนแปลง
        let description = log.new_value;
        if (log.old_value && log.old_value !== log.new_value) {
          description = `เปลี่ยนสถานะจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (!log.old_value) {
          description = `สถานะเริ่มต้น: ${log.new_value}`;
        }

        return {
          status: log.new_value, // ใช้ค่าใหม่เป็นสถานะปัจจุบันสำหรับแสดง Badge สี
          detail: description,   // รายละเอียดที่จะโชว์ในบรรทัดล่าง
          created_at: log.created_at,
          changed_by: log.changed_by
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