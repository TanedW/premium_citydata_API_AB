// /api/crud_case_detail.js (หรือชื่อไฟล์ที่คุณใช้งานอยู่)

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // แนะนำให้ระบุ Domain จริงเมื่อขึ้น Production
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

      // --- Query 1: ข้อมูลหลักของเคส ---
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

      // --- Query 2: Timeline (ดึงชื่อ User มาด้วย) ---
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

      // --- Formatter: จัดรูปแบบ Timeline ---
      const formattedTimeline = rawLogs.map(log => {
        // 1. สร้าง Label ชื่อเจ้าหน้าที่: "เจ้าหน้าที่ 26 Taned Wongpoo"
        let changerLabel = `เจ้าหน้าที่ ${log.changed_by_user_id}`;
        if (log.first_name || log.last_name) {
             const fullName = `${log.first_name || ''} ${log.last_name || ''}`.trim();
             changerLabel = `เจ้าหน้าที่ ${log.changed_by_user_id} ${fullName}`;
        }
        
        // ถ้าเป็น System หรือไม่มี user_id
        if (!log.changed_by_user_id) {
            changerLabel = 'ระบบ';
        }

        let description = "";

        // 2. Logic การแสดงข้อความ (Detail)
        // ถ้ามี Comment (ซึ่งเราบันทึกไว้เต็มรูปแบบแล้ว) ให้ใช้ Comment เลย
        if (log.comment && log.comment.trim() !== "") {
            description = log.comment;
        } else {
            // Fallback กรณีข้อมูลเก่าที่ไม่มี Comment สมบูรณ์
            if (log.activity_type === 'TYPE_CHANGE') {
                description = `เปลี่ยนประเภทจาก "${log.old_value}" เป็น "${log.new_value}"`;
            } else if (log.activity_type === 'STATUS_CHANGE') { 
                description = `เปลี่ยนสถานะจาก "${log.old_value}" เป็น "${log.new_value}"`;
            } else if (log.old_value && log.old_value !== log.new_value) {
                description = `เปลี่ยนจาก "${log.old_value}" เป็น "${log.new_value}"`;
            } else if (!log.old_value) {
                 description = `สถานะเริ่มต้น: ${log.new_value}`;
            } else {
                description = `สถานะ: ${log.new_value}`;
            }
        }

        return {
          status: log.new_value,
          detail: description, // ข้อความที่จะโชว์
          created_at: log.created_at,
          changed_by: changerLabel // ชื่อคนทำ (เผื่อ frontend อยากเอาไปแยกแสดง)
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
    // 2️⃣ POST: อัปเดตข้อมูล (Action Based)
    // ==========================================
    if (req.method === 'POST') {
      let body;
      try { 
        body = await req.json(); 
      } catch (e) { 
        return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers: corsHeaders }); 
      }

      const { action, case_id, user_id, ...data } = body;

      // --- 1. เตรียมข้อมูลผู้ใช้งาน (Officer Label) ---
      // เพื่อนำไปแปะหน้าข้อความ Log: "เจ้าหน้าที่ 26 Taned Wongpoo"
      let officerLabel = `เจ้าหน้าที่ ${user_id}`;
      if (user_id) {
        const officerRes = await sql`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}`;
        if (officerRes.length > 0) {
            const fullName = `${officerRes[0].first_name || ''} ${officerRes[0].last_name || ''}`.trim();
            officerLabel = `เจ้าหน้าที่ ${user_id} ${fullName}`;
        }
      }

      // --- Action 1: เปลี่ยนประเภทปัญหา (update_category) ---
      if (action === 'update_category') {
        const { new_type_id, new_type_name, old_type_name } = data;
        
        // อัปเดตตารางหลัก
        await sql`UPDATE issue_cases SET issue_type_id = ${new_type_id} WHERE issue_cases_id = ${case_id}`;
        
        // สร้างข้อความ Log
        const fullComment = `${officerLabel} เปลี่ยนประเภทปัญหาเป็น "${new_type_name}"`;
        
        // บันทึก Log
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'TYPE_CHANGE', ${old_type_name}, ${new_type_name}, ${user_id || null}, ${fullComment})
        `;
        
        return new Response(JSON.stringify({ message: 'Category updated successfully' }), { 
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // --- Action 2: เปลี่ยนสถานะ (update_status) ---
      if (action === 'update_status') {
        const { new_status, old_status, comment, image_url } = data; 
        
        // อัปเดตตารางหลัก
        await sql`UPDATE issue_cases SET status = ${new_status}, updated_at = NOW() WHERE issue_cases_id = ${case_id}`;
        
        // สร้างข้อความ Log
        // รูปแบบ: "เจ้าหน้าที่ 26 Taned Wongpoo ปรับสถานะเป็น เสร็จสิ้น : รายละเอียด... [แนบรูปประกอบ]"
        let fullLogComment = `${officerLabel} ปรับสถานะเป็น "${new_status}"`;
        
        if (comment && comment.trim() !== "") {
            fullLogComment += ` : ${comment}`;
        }
        
        if (image_url) {
            fullLogComment += ` [แนบรูปประกอบ]`;
            // ถ้าต้องการบันทึกลงตาราง case_media ด้วย ให้เพิ่ม Query ตรงนี้
            // await sql`INSERT INTO case_media ...`
        }
        
        // บันทึก Log
        await sql`
          INSERT INTO case_activity_logs (case_id, activity_type, old_value, new_value, changed_by_user_id, comment)
          VALUES (${case_id}, 'STATUS_CHANGE', ${old_status}, ${new_status}, ${user_id || null}, ${fullLogComment})
        `;

        return new Response(JSON.stringify({ message: 'Status updated successfully' }), { 
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // กรณีส่ง Action มาไม่ตรง
      return new Response(JSON.stringify({ message: 'Unknown action provided' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // --- Method Not Allowed ---
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