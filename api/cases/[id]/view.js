// /api/cases/[id]/view.js
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
      const url = new URL(req.url, `http://${req.headers.get('host')}`);
      const case_id = url.pathname.split('/')[3];

      const body = await req.json();
      const { organization_id, user_id } = body;

      if (!case_id || !organization_id || !user_id) {
        return new Response(JSON.stringify({
          message: 'Missing required fields: case_id (from URL), organization_id, user_id required.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ✅ 1. Update flag ว่า "ดูแล้ว"
      const results = await sql`
        UPDATE case_organizations
        SET is_viewed = true
        WHERE case_id = ${case_id} AND organization_id = ${organization_id}
        RETURNING *;
        
      `;

      if (results.length === 0) {
        return new Response(JSON.stringify({ message: 'Record not found for this organization and case.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ✅ 2. ดึงข้อมูลเจ้าหน้าที่จาก users
      const [user] = await sql`
        SELECT user_id, first_name
        FROM users
        WHERE user_id = ${user_id};
      `;

      const user_uid = user?.uid || 'ไม่ทราบรหัส';
      const user_name = user?.first_name || 'ไม่ทราบชื่อ';

      // ✅ 3. เพิ่ม log ลงใน case_activity_logs
      await sql`
        INSERT INTO case_activity_logs (
          case_id,
          changed_by_user_id,
          activity_type,
          new_value,
          comment,
          created_at
        )
        VALUES (
          ${case_id},
          ${user_id},
          'COMMENT',
          'กำลังประสานงาน',
          ${'เจ้าหน้าที่เข้าชมเคส โดย ' + user_id + ' ' + user_name},
          NOW()
        );
      `;

      // ✅ 4. ส่งผลลัพธ์กลับ
      return new Response(JSON.stringify({
        message: 'Viewed and activity log created successfully.',
        updated: results[0]
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('API Error (PATCH /view):', error);
      return new Response(JSON.stringify({
        message: 'An error occurred',
        error: error.message
      }), {
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
