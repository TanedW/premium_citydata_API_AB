import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // ==========================================
    // GET: ดึงข้อมูล
    // ==========================================
    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');

      if (!id) return new Response(JSON.stringify({ message: 'Missing id param' }), { status: 400, headers: corsHeaders });

      // Query ข้อมูลหลัก
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

      if (caseResult.length === 0) return new Response(JSON.stringify({ message: 'Case not found' }), { status: 404, headers: corsHeaders });

      // Query Timeline
      const rawLogs = await sql`
        SELECT created_at, changed_by_user_id, old_value, new_value, activity_type, comment
        FROM case_activity_logs 
        WHERE case_id = ${id} 
        ORDER BY created_at DESC
      `;

      const formattedTimeline = rawLogs.map(log => {
        let description = log.new_value;
        
        // *** แก้ไขจุดที่ 1: เช็ค ENUM ให้ตรงกับ Database เพื่อแสดงข้อความ ***
        if (log.activity_type === 'TYPE_CHANGE') {
             description = `เปลี่ยนประเภทจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (log.activity_type === 'STATUS_CHANGE') { 
             description = `เปลี่ยนสถานะจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (log.old_value && log.old_value !== log.new_value) {
             // Fallback กรณีอื่นๆ
             description = `เปลี่ยนจาก "${log.old_value}" เป็น "${log.new_value}"`;
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
    }

    // ==========================================
    // POST: อัปเดตข้อมูล
    // ==========================================
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch (e) { return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers: corsHeaders }); }

      const { action, case_id, user_id, ...data } = body;

      // --- Action 1: เปลี่ยนประเภท (Update Category) ---
      if (action === 'update_category') {
        const { new_type_id, new_type_name, old_type_name } = data;
        
        await sql`UPDATE issue_cases SET issue_type_id = ${new_type_id} WHERE issue_cases_id = ${case_id}`;
        
        const comment = `เปลี่ยนประเภทเป็น "${new_type_name}"`;
        
        // *** แก้ไขจุดที่ 2: ใช้ ENUM 'TYPE_CHANGE' ***
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'TYPE_CHANGE', ${old_type_name}, ${new_type_name}, ${user_id || 'System'}, ${comment})
        `;

        return new Response(JSON.stringify({ message: 'Category updated' }), { status: 200, headers: corsHeaders });
      }

      // --- Action 2: เปลี่ยนสถานะ (Update Status) ---
      if (action === 'update_status') {
        const { new_status, old_status, comment, image_url } = data;

        await sql`UPDATE issue_cases SET status = ${new_status} WHERE issue_cases_id = ${case_id}`;

        const logComment = comment + (image_url ? ` [แนบรูป: ${image_url}]` : '');
        
        // *** แก้ไขจุดที่ 3: ใช้ ENUM 'STATUS_CHANGE' (เดาว่าน่าจะชื่อนี้ ถ้าไม่ใช่ให้แก้ตรงนี้ครับ) ***
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'STATUS_CHANGE', ${old_status}, ${new_status}, ${user_id || 'System'}, ${logComment})
        `;

        return new Response(JSON.stringify({ message: 'Status updated' }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ message: 'Unknown action' }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ message: 'Internal Server Error', error: error.message }), { status: 500, headers: corsHeaders });
  }
}