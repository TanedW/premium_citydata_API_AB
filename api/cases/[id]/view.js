export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

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

    try {
      // ✅ 1. ดึง case_id จาก URL
      const url = new URL(req.url, `http://${req.headers.get('host')}`);
      const case_id = url.pathname.split('/')[3];

      // ✅ 2. ดึงข้อมูลจาก body
      const body = await req.json();
      const { organization_id, user_id } = body;

      // ตรวจสอบค่าที่จำเป็น
      if (!case_id || !organization_id || !user_id) {
        return new Response(
          JSON.stringify({
            message:
              'Missing required fields: case_id (from URL), organization_id, and user_id are required.',
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      // ✅ 3. ดึงข้อมูล user
      const [user] = await sql`
        SELECT user_id, first_name
        FROM users
        WHERE user_id = ${user_id};
      `;
      const user_name = user?.first_name || 'ไม่ทราบชื่อ';

      // ✅ 4. ดึงค่า old_status ของเคส
      const result = await sql`
        SELECT status 
        FROM issue_cases 
        WHERE issue_cases_id = ${case_id}
        LIMIT 1;
      `;
      const oldStatus = result[0]?.status || null;

      // ✅ 5. ตั้งค่าข้อมูลใหม่
      const newStatus = 'กำลังประสานงาน';
      const comment = `เจ้าหน้าที่ (ID: ${user_id} ชื่อ ${user_name}) เข้าชมเคส โดยสถานะก่อนหน้า: ${oldStatus ?? 'ไม่ทราบ'}`;

      // ✅ 6. เตรียม queries สำหรับ transaction
      const queries = [];

      // อัปเดตสถานะการเข้าชมของหน่วยงาน
      queries.push(sql`
        UPDATE case_organizations
        SET is_viewed = true
        WHERE case_id = ${case_id} AND organization_id = ${organization_id};
      `);

      // อัปเดตสถานะของเคส (เฉพาะที่ยังอยู่สถานะ 'รอรับเรื่อง')
      queries.push(sql`
        UPDATE issue_cases
        SET status = ${newStatus}, updated_at = now()
        WHERE issue_cases_id = ${case_id} AND status = 'รอรับเรื่อง';
      `);

      // บันทึก Log
      queries.push(sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES 
          (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment});
      `);

      // ✅ 7. รันทั้งหมดใน transaction เดียว
      await sql.transaction(queries);

      // ✅ 8. ตอบกลับสำเร็จ
      return new Response(
        JSON.stringify({
          message: 'Case viewed and status updated successfully.',
          old_status: oldStatus,
          new_status: newStatus,
          user_name,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('API Error (PATCH /view - Edge):', error);

      return new Response(
        JSON.stringify({ message: 'An error occurred', error: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // ❌ Method not allowed
  return new Response(
    JSON.stringify({ message: `Method ${req.method} Not Allowed` }),
    { status: 405, headers: corsHeaders }
  );
}
