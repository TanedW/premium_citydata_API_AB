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
      // 1️⃣ ดึงค่า case_id จาก URL
      const url = new URL(req.url, `http://${req.headers.get('host')}`);
      const case_id = url.pathname.split('/')[3];

      // 2️⃣ ดึงข้อมูลจาก body
      const body = await req.json();
      const { organization_id, user_id } = body;

      if (!case_id || !organization_id || !user_id) {
        return new Response(
          JSON.stringify({
            message: 'Missing required fields: case_id (from URL), organization_id, and user_id are required.',
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      // 3️⃣ ดึงค่า old_status ก่อนอัปเดต
      const result = await sql`
        SELECT status 
        FROM issue_cases 
        WHERE issue_cases_id = ${case_id}
        LIMIT 1
      `;
      const oldStatus = result[0]?.status || null;

      const newStatus = 'กำลังประสานงาน';
      const comment = `เจ้าหน้าที่ (ID: ${user_id}) เข้าชมเคส โดยสถานะก่อนหน้า: ${oldStatus ?? 'ไม่ทราบ'}`;

      // 4️⃣ รวมทุกคำสั่งไว้ใน Transaction
      const queries = [];

      // อัปเดต is_viewed
      queries.push(sql`
        UPDATE case_organizations
        SET is_viewed = true
        WHERE case_id = ${case_id} AND organization_id = ${organization_id}
      `);

      // อัปเดตสถานะ
      queries.push(sql`
        UPDATE issue_cases
        SET status = ${newStatus}, updated_at = now()
        WHERE issue_cases_id = ${case_id} AND status = 'รอรับเรื่อง'
      `);

      // บันทึก log พร้อม old/new value
      queries.push(sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES 
          (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment})
      `);

      // 5️⃣ รันทั้งหมดใน Transaction เดียว
      await sql.transaction(queries);

      // 6️⃣ ตอบกลับ
      return new Response(
        JSON.stringify({
          message: 'Case viewed and status updated successfully.',
          old_status: oldStatus,
          new_status: newStatus,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('API Error:', error);
      return new Response(
        JSON.stringify({ message: 'An error occurred', error: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return new Response(
    JSON.stringify({ message: `Method ${req.method} Not Allowed` }),
    { status: 405, headers: corsHeaders }
  );
}
