import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // แนะนำให้เปลี่ยนเป็น Domain จริงเมื่อขึ้น Production
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // ==========================================
    // 1️⃣ GET: ดึงข้อมูลรายละเอียดเคส + Timeline
    // ==========================================
    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ message: 'Missing id param' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
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
        return new Response(JSON.stringify({ message: 'Case not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Query 2: Timeline
      const rawLogs = await sql`
        SELECT 
          cal.created_at, 
          cal.changed_by_user_id, 
          cal.old_value, 
          cal.new_value, 
          cal.activity_type, 
          cal.comment,
          u.first_name,
          u.last_name
        FROM case_activity_logs cal
        LEFT JOIN users u ON cal.changed_by_user_id = u.user_id
        WHERE cal.case_id = ${id} 
        ORDER BY cal.created_at DESC
      `;

      // จัดรูปแบบ Timeline
      const formattedTimeline = rawLogs.map(log => {
        // 1. สร้างป้ายชื่อ: "เจ้าหน้าที่ 26 Taned Wongpoo"
        let changerLabel = `เจ้าหน้าที่ ${log.changed_by_user_id || 'ระบบ'}`;
        if (log.first_name || log.last_name) {
             const fullName = `${log.first_name || ''} ${log.last_name || ''}`.trim();
             changerLabel = `เจ้าหน้าที่ ${log.changed_by_user_id} ${fullName}`;
        }

        // 2. ข้อความ Detail (ใช้ Comment ที่บันทึกไว้เป็นหลัก)
        let description = log.comment;
        
        // Fallback กรณีข้อมูลเก่าที่ไม่มี Comment
        if (!description || description.trim() === "") {
             description = `เปลี่ยนสถานะเป็น ${log.new_value}`;
        }

        return {
          status: log.new_value,
          detail: description,
          created_at: log.created_at,
          changed_by: changerLabel 
        };
      });

      return new Response(JSON.stringify({
        info: caseResult[0],
        timeline: formattedTimeline
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==========================================
    // 2️⃣ POST: รับคำสั่งแก้ไข (Action Based)
    // ==========================================
    if (req.method === 'POST') {
      let body;
      try { 
        body = await req.json(); 
      } catch (e) { 
        return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers: corsHeaders }); 
      }

      const { action, case_id, user_id, ...data } = body;

      // 1. เตรียมชื่อเจ้าหน้าที่สำหรับบันทึก Log
      // ผลลัพธ์: "เจ้าหน้าที่ 26 Taned Wongpoo"
      let officerLabel = `เจ้าหน้าที่ ${user_id}`;
      if (user_id) {
        const officerRes = await sql`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}`;
        if (officerRes.length > 0) {
            const fullName = `${officerRes[0].first_name || ''} ${officerRes[0].last_name || ''}`.trim();
            officerLabel = `เจ้าหน้าที่ ${user_id} ${fullName}`;
        }
      }

      // --- Action: เปลี่ยนสถานะ (Target หลักของคุณ) ---
      if (action === 'update_status') {
        // ❌ ไม่ต้องรับ old_status จาก body แล้ว
        const { new_status, comment, image_url } = data; 
        
        // ✅ 1. ให้ Backend ดึงสถานะปัจจุบันจริงๆ จาก DB ก่อน
        const currentCase = await sql`
            SELECT status FROM issue_cases WHERE issue_cases_id = ${case_id} LIMIT 1
        `;

        if (currentCase.length === 0) {
            return new Response(JSON.stringify({ message: 'Case not found' }), { status: 404, headers: corsHeaders });
        }

        const realOldStatus = currentCase[0].status; // นี่คือสถานะเดิมที่แท้จริง

        // 2. อัปเดตตารางหลัก
        await sql`UPDATE issue_cases SET status = ${new_status}, updated_at = NOW() WHERE issue_cases_id = ${case_id}`;
        
        // 3. สร้างข้อความ Log
        let fullLogComment = `${officerLabel} ปรับสถานะเป็น "${new_status}"`;
        if (comment && comment.trim() !== "") fullLogComment += ` : ${comment}`;
        if (image_url) fullLogComment += ` [แนบรูปประกอบ]`;

        if (image_url && image_url.trim() !== "") {
            await sql`
              INSERT INTO case_media (case_id, media_type, url, uploader_role) 
              VALUES (${case_id}, 'image', ${image_url}, 'OFFICER')            
            `;
        }
        
        // 4. บันทึก Log (ใช้ realOldStatus ที่ดึงมาเอง)
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'STATUS_CHANGE', ${realOldStatus}, ${new_status}, ${user_id || null}, ${fullLogComment})
        `;

        return new Response(JSON.stringify({ message: 'Status updated successfully' }), { 
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // --- Action: เปลี่ยนประเภท (คงไว้เผื่อแก้ไข) ---
      if (action === 'update_category') {
        const { new_type_id, new_type_name, old_type_name } = data;
        
        await sql`UPDATE issue_cases SET issue_type_id = ${new_type_id} WHERE issue_cases_id = ${case_id}`;
        
        const fullComment = `${officerLabel} เปลี่ยนประเภทปัญหาเป็น "${new_type_name}"`;
        
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'TYPE_CHANGE', ${old_type_name}, ${new_type_name}, ${user_id || null}, ${fullComment})
        `;
        
        return new Response(JSON.stringify({ message: 'Category updated successfully' }), { 
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({ message: 'Unknown action' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
        status: 405, headers: corsHeaders 
    });

  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ 
        message: 'Internal Server Error', 
        error: error.message 
    }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}