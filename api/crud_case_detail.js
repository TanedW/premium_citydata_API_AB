import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // เพิ่ม POST เข้าไป
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  // ==========================================
  // ส่วนที่ 1: GET (ดึงข้อมูล)
  // ==========================================
  if (req.method === 'GET') {
    try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ message: 'Missing id' }), { status: 400, headers: corsHeaders });
      }

      // Query 1: ข้อมูลหลัก
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
        return new Response(JSON.stringify({ message: 'Case not found' }), { status: 404, headers: corsHeaders });
      }

      // Query 2: Timeline
      const rawLogs = await sql`
        SELECT created_at, changed_by_user_id, old_value, new_value, activity_type, comment
        FROM case_activity_logs 
        WHERE case_id = ${id} 
        ORDER BY created_at DESC
      `;

      // Format Timeline
      const formattedTimeline = rawLogs.map(log => {
        let description = log.new_value;
        if (log.old_value && log.old_value !== log.new_value) {
          description = `เปลี่ยนสถานะจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (!log.old_value) {
          description = `สถานะเริ่มต้น: ${log.new_value}`;
        }
        if (log.comment) description += ` (${log.comment})`;

        return {
          status: log.new_value,
          detail: description,
          created_at: log.created_at,
          changed_by: log.changed_by_user_id
        };
      });

      return new Response(JSON.stringify({
        info: caseResult[0],
        timeline: formattedTimeline
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error) {
      return new Response(JSON.stringify({ message: 'Fetch Failed', error: error.message }), { status: 500, headers: corsHeaders });
    }
  }

  // ==========================================
  // ส่วนที่ 2: POST (อัปเดตข้อมูล - ย้ายมาจาก update_issue_type)
  // ==========================================
  if (req.method === 'POST') {
    try {
      // รับค่าจาก Body
      const { action, case_id, new_type_id, new_type_name, user_id, old_type_name } = await req.json();

      // เช็คว่าเป็น Action อะไร (เผื่ออนาคตมี update status ด้วย)
      if (action === 'update_category') {
        
        if (!case_id || !new_type_id) {
          return new Response(JSON.stringify({ message: 'Missing fields' }), { status: 400, headers: corsHeaders });
        }

        // 1. Update ตารางหลัก
        await sql`
          UPDATE issue_cases 
          SET issue_type_id = ${new_type_id}
          WHERE issue_cases_id = ${case_id}
        `;

        // 2. Insert Timeline
        const comment = `เปลี่ยนประเภทเป็น "${new_type_name}"`;
        await sql`
          INSERT INTO case_activity_logs 
          (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES 
          (${case_id}, 'change_category', ${old_type_name}, ${new_type_name}, ${user_id || 'System'}, ${comment})
        `;

        return new Response(JSON.stringify({ message: 'Update success' }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ message: 'Unknown action' }), { status: 400, headers: corsHeaders });

    } catch (error) {
      return new Response(JSON.stringify({ message: 'Update Failed', error: error.message }), { status: 500, headers: corsHeaders });
    }
  }

  // Method Not Allowed
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
    status: 405,
    headers: corsHeaders
  });
}