// /api/cases/[id]/view.js
// (!!! Runtime: 'edge' !!!)
// (นี่คือเวอร์ชันที่ "ปลอดภัย" และรันบน Edge ได้)

export const config = {
  runtime: 'edge', 
};

import { neon } from '@neondatabase/serverless';

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};


export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'PATCH') {
    const sql = neon(process.env.DATABASE_URL);
    let body;

    try {
      // 2.1. ดึง ID ของเคส (UUID) จาก URL
      const url = new URL(req.url, `http://${req.headers.get('host')}`);
      const case_id = url.pathname.split('/')[3]; 

      // 2.2. ดึง ID ของหน่วยงาน และ ID ของเจ้าหน้าที่
      body = await req.json(); // Edge Runtime ใช้ .json()
      const { organization_id, user_id } = body;

      // 2.3. ตรวจสอบข้อมูล
      if (!case_id || !organization_id || !user_id) {
        return new Response(JSON.stringify({ message: 'Missing required fields: case_id (from URL), organization_id, and user_id are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (typeof organization_id !== 'number' || !Number.isInteger(organization_id) ||
          typeof user_id !== 'number' || !Number.isInteger(user_id)) {
         return new Response(JSON.stringify({ message: 'Invalid format: organization_id and user_id must be integers.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // (!!! นี่คือการตัดฟีเจอร์ (Trade-off) ของ Edge !!!)
      // เราไม่สามารถ SELECT 'old_status' หรือ 'user_name' ได้
      const newStatus = 'กำลังประสานงาน';
      const comment = `เจ้าหน้าที่ (ID: ${user_id}) เข้าชมเคส`;

      // 2.4. (!!! หัวใจสำคัญ !!!)
      // สร้าง "Array" ของ Queries (สำหรับ Vercel Edge)
      const queries = [];

      // Step 1: อัปเดต 'is_viewed' (นี่คือจุดบกพร่องที่ 1 ของคุณที่แก้แล้ว)
      queries.push(sql`
        UPDATE case_organizations
        SET is_viewed = true
        WHERE case_id = ${case_id} AND organization_id = ${organization_id}
      `);

      // Step 2: อัปเดต 'status' (นี่คือจุดบกพร่องที่ 2 ของคุณที่แก้แล้ว)
      queries.push(sql`
        UPDATE issue_cases
        SET status = ${newStatus}, updated_at = now()
        WHERE issue_cases_id = ${case_id} AND status = 'รอรับเรื่อง'
      `);

      // Step 3: บันทึก Log (แบบ "ไม่สมบูรณ์" แต่ปลอดภัย)
      queries.push(sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES 
          (${case_id}, ${user_id}, 'STATUS_CHANGE', NULL, ${newStatus}, ${comment})
      `);

      // 2.5. !!! รัน Transaction (แบบ Array) !!!
      // (นี่คือการแก้จุดบกพร่องที่ 1 ของคุณ)
      await sql.transaction(queries);
      
      // 2.6. Transaction สำเร็จ
      return new Response(JSON.stringify({ message: 'Case viewed and status updated successfully.' }), { 
          status: 200, // 200 OK
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 2.7. จัดการ Error
      console.error("API Error (PATCH /view - Edge):", error);
      
      // (เช็ก Error ที่พบบ่อย)
      if (error.message && error.message.includes('violates foreign key constraint')) {
         return new Response(JSON.stringify({ 
          message: 'Invalid data. For example, case_id, organization_id, or user_id does not exist.',
          error: error.message 
        }), { 
            status: 400, // 400 Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- 3. Handle any other HTTP methods ---
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}