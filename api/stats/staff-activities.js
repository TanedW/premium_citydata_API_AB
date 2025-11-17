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
      // 3. [สำคัญ] ตรวจสอบสิทธิ์ (เหมือนกับ API อื่น)
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
      
      // 4. ดึง organization_id จาก Query String
      const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
      const organizationId = searchParams.get('organization_id');

      if (!organizationId) {
        return new Response(JSON.stringify({ message: 'organization_id query parameter is required' }), { 
          status: 400, // Bad Request
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // 5. (*** NEW SQL QUERY ***) 
      // Query หลัก - นับกิจกรรมการเปลี่ยนสถานะ (STATUS_CHANGE) โดย JOIN เพื่อเอาชื่อเจ้าหน้าที่
      // และกรองด้วย organization_id
      const statsResult = await sql`
        SELECT 
          u.name AS staff_name,      -- 1. เอาชื่อเจ้าหน้าที่
          l.details AS new_status,   -- 2. เอาสถานะใหม่ (เช่น "เสร็จสิ้น")
          COUNT(*)::int AS count     -- 3. นับจำนวน
        FROM 
          case_activity_logs l
        JOIN 
          users u ON l.changed_by_user_id = u.user_id -- (*** แก้ไข JOIN ที่นี่ ***)
        JOIN 
          case_organizations co ON l.case_id = co.case_id -- 5. JOIN ตาราง org เพื่อกรอง
        WHERE 
          co.organization_id = ${organizationId}  -- 6. กรองตามองค์กร
          AND l.activity_type = 'STATUS_CHANGE'   -- 7. กรองเฉพาะการเปลี่ยนสถานะ
        GROUP BY 
          u.name, l.details
        ORDER BY
          count DESC;
      `;
      
      // 6. ส่งข้อมูลกลับ
      return new Response(JSON.stringify(statsResult), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (error) {
      console.error("--- STAFF ACTIVITIES API ERROR ---", error);
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