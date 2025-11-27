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

      if (caseResult.length === 0) return new Response(JSON.stringify({ message: 'Case not found' }), { status: 404, headers: corsHeaders });

      // Query 2: Timeline
      // ดึงชื่อ first_name, last_name มาต่อกัน
      const rawLogs = await sql`
        SELECT 
          cal.created_at, 
          cal.changed_by_user_id, 
          cal.old_value, 
          cal.new_value, 
          cal.activity_type, 
          cal.comment,
          CONCAT(u.first_name, ' ', u.last_name) AS changer_name
        FROM case_activity_logs cal
        LEFT JOIN users u ON cal.changed_by_user_id = u.user_id
        WHERE cal.case_id = ${id} 
        ORDER BY cal.created_at DESC
      `;

      const formattedTimeline = rawLogs.map(log => {
        let description = log.new_value;
        
        if (log.activity_type === 'TYPE_CHANGE') {
             description = `เปลี่ยนประเภทจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (log.activity_type === 'STATUS_CHANGE') { 
             description = `เปลี่ยนสถานะจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (log.old_value && log.old_value !== log.new_value) {
             description = `เปลี่ยนจาก "${log.old_value}" เป็น "${log.new_value}"`;
        } else if (!log.old_value) {
             description = `สถานะเริ่มต้น: ${log.new_value}`;
        }
        
        if (log.comment) description += ` (${log.comment})`;

        // *** จัดรูปแบบชื่อคนทำตามที่คุณต้องการ ***
        // รูปแบบ: เจ้าหน้าที่ {ID} {ชื่อ นามสกุล}
        const changer = log.changer_name 
            ? `เจ้าหน้าที่ ${log.changed_by_user_id} ${log.changer_name}` 
            : `เจ้าหน้าที่ ${log.changed_by_user_id}`;

        return {
          status: log.new_value,
          detail: description,
          created_at: log.created_at,
          changed_by: changer 
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

      // 1. ดึงชื่อเจ้าหน้าที่ก่อน (เหมือน view.js)
      let officerName = '';
      if (user_id) {
        const officerRes = await sql`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}`;
        if (officerRes.length > 0) {
            officerName = `${officerRes[0].first_name || ''} ${officerRes[0].last_name || ''}`.trim();
        }
      }
      const officerLabel = `เจ้าหน้าที่ ${user_id} ${officerName}`.trim();

      // --- Action 1: เปลี่ยนประเภท ---
      if (action === 'update_category') {
        const { new_type_id, new_type_name, old_type_name } = data;
        
        await sql`UPDATE issue_cases SET issue_type_id = ${new_type_id} WHERE issue_cases_id = ${case_id}`;
        
        // ใส่ชื่อคนทำลงไปใน Comment ด้วย (ถ้าต้องการให้เหมือน view.js)
        const comment = `${officerLabel} เปลี่ยนประเภทเป็น "${new_type_name}"`;
        
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'TYPE_CHANGE', ${old_type_name}, ${new_type_name}, ${user_id || 'System'}, ${comment})
        `;
        return new Response(JSON.stringify({ message: 'Category updated' }), { status: 200, headers: corsHeaders });
      }

      // --- Action 2: เปลี่ยนสถานะ ---
      if (action === 'update_status') {
        const { new_status, old_status, comment, image_url } = data;
        
        await sql`UPDATE issue_cases SET status = ${new_status} WHERE issue_cases_id = ${case_id}`;
        
        // ใส่ชื่อคนทำลงไปใน Comment ด้วย
        const logComment = `${officerLabel} ปรับสถานะ: ${comment}` + (image_url ? ` [แนบรูป: ${image_url}]` : '');
        
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