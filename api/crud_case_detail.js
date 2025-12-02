// /api/crud_case_detail.js

import { neon } from '@neondatabase/serverless';

// ✅ คงไว้ตามที่คุณต้องการ
export const config = {
  runtime: 'edge',
};

// ---------------- CORS ----------------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // แนะนำให้ใส่ domain จริงเมื่อขึ้น Production
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
    // 1️⃣ GET: ดึงข้อมูล (เหมือนเดิม)
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

      const formattedTimeline = rawLogs.map(log => {
        let changerLabel = `เจ้าหน้าที่ ${log.changed_by_user_id || 'ระบบ'}`;
        if (log.first_name || log.last_name) {
             const fullName = `${log.first_name || ''} ${log.last_name || ''}`.trim();
             changerLabel = `เจ้าหน้าที่ ${log.changed_by_user_id} ${fullName}`;
        }
        let description = log.comment || `เปลี่ยนสถานะเป็น ${log.new_value}`;

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
    // 2️⃣ POST: รับคำสั่งแก้ไข (Edge Compatible)
    // ==========================================
    if (req.method === 'POST') {
      let body;
      
      // ✅ เทคนิคแก้ปัญหา Edge: อ่านเป็น Text ก่อน ค่อย Parse
      try {
        const rawText = await req.text(); // อ่าน Body ดิบๆ
        if (!rawText) {
             throw new Error("Empty request body");
        }
        body = JSON.parse(rawText); // แปลงเป็น JSON เอง
      } catch (e) {
        console.error("JSON Parse Error:", e);
        return new Response(JSON.stringify({ 
            message: 'Invalid JSON body', 
            error: e.message 
        }), { status: 400, headers: corsHeaders }); 
      }

      const { action, case_id, user_id, ...data } = body;

      // Debug ดูค่าที่ได้รับ
      console.log("Edge Received:", { action, case_id });

      let officerLabel = `เจ้าหน้าที่ ${user_id}`;
      if (user_id) {
        const officerRes = await sql`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}`;
        if (officerRes.length > 0) {
            const fullName = `${officerRes[0].first_name || ''} ${officerRes[0].last_name || ''}`.trim();
            officerLabel = `เจ้าหน้าที่ ${user_id} ${fullName}`;
        }
      }

      // --- Action: update_status ---
      if (action === 'update_status') {
        const { new_status, comment, image_url } = data; 
        
        const currentCase = await sql`SELECT status FROM issue_cases WHERE issue_cases_id = ${case_id} LIMIT 1`;
        if (currentCase.length === 0) return new Response(JSON.stringify({ message: 'Case not found' }), { status: 404, headers: corsHeaders });
        const realOldStatus = currentCase[0].status;

        await sql`UPDATE issue_cases SET status = ${new_status}, updated_at = NOW() WHERE issue_cases_id = ${case_id}`;
        
        if (image_url && image_url.trim() !== "") {
            await sql`
              INSERT INTO case_media (case_id, media_type, url, uploader_role) 
              VALUES (${case_id}, 'image', ${image_url}, 'OFFICER')
            `;
        }

        let fullLogComment = `${officerLabel} ปรับสถานะเป็น "${new_status}"`;
        if (comment && comment.trim() !== "") fullLogComment += ` : ${comment}`;
        if (image_url) fullLogComment += ` [แนบรูปประกอบ]`;
        
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'STATUS_CHANGE', ${realOldStatus}, ${new_status}, ${user_id || null}, ${fullLogComment})
        `;

        return new Response(JSON.stringify({ message: 'Status updated successfully' }), { 
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // --- Action: update_category ---
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