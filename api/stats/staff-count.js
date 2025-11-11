import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <-- URL ของ React App
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- Main API Handler ---
export default async function handler(req) {
  // 1. ตอบกลับ CORS Preflight (OPTIONS request)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 2. จัดการเฉพาะ GET request
  if (req.method === 'GET') {
    const sql = neon(process.env.DATABASE_URL);

    try {
      // 3. [สำคัญ] ตรวจสอบสิทธิ์
      const authHeader = req.headers.get('authorization');
      const accessToken = (authHeader && authHeader.startsWith('Bearer ')) 
        ? authHeader.split(' ')[1] 
        : null;

      if (!accessToken) {
        return new Response(JSON.stringify({ message: 'Authorization token required' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const userResult = await sql`SELECT user_id FROM users WHERE "access_token" = ${accessToken}`;
      
      if (userResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Invalid or expired token' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      // 4. ดึง organization_id (ที่เป็น Integer) จาก Query String
      const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
      const organizationId = searchParams.get('organization_id');

      if (!organizationId) {
        return new Response(JSON.stringify({ message: 'organization_id query parameter is required' }), { 
          status: 400, // Bad Request
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // 5. [Query หลัก - แก้ไขแล้ว]
      // ใช้ Subquery เพื่อแปลง organization_id (int) -> organization_code (varchar)
      // แล้วค่อยนับในตาราง users_organizations
      const statsResult = await sql`
        SELECT 
          COUNT(user_id) AS staff_count
        FROM 
          users_organizations
        WHERE 
          organization_code = (
            SELECT organization_code 
            FROM organizations
            WHERE organization_id = ${organizationId}
            LIMIT 1
          );
      `;
      
      // 6. ส่งข้อมูลกลับ
      // ผลลัพธ์จะเป็น Array ที่มี 1 object: [ { "staff_count": "12" } ]
      return new Response(JSON.stringify(statsResult[0]), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (error) {
      console.error("--- STATS STAFF-COUNT API ERROR ---", error);
      // (เพิ่มการตรวจสอบ Error ใหม่)
      if (error.message && error.message.includes('subquery returned no rows')) {
        return new Response(JSON.stringify({ "staff_count": "0" }), { 
            status: 200, // ถือว่าหาเจอ (เจอ 0 คน)
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ message: 'An internal error occurred', error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  }

  // 3. ตอบกลับหากใช้ Method อื่น
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
    status: 405, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  });
}