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
      // 3. [สำคัญ] ตรวจสอบสิทธิ์ (เหมือน API อื่น)
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

      // 5. [Query หลัก] - เราต้องรัน 2 Queries
      // 5.1 Query แรก: คำนวณค่าเฉลี่ย (AVG) และจำนวนรวม (COUNT)
      const aggregatesResult = await sql`
        WITH OrgCode AS (
          SELECT organization_code 
          FROM organizations
          WHERE organization_id = ${organizationId}
          LIMIT 1
        )
        SELECT
            COUNT(r.score) AS total_count,
            AVG(r.score) AS overall_average
        FROM 
            case_ratings r
        JOIN 
            issue_cases c ON r.rating_id= c.id -- (*** MODIFIED ***)
        WHERE 
            c.organization_code = (SELECT organization_code FROM OrgCode);
      `;
      
      // 5.2 Query สอง: นับคะแนนแยกตามกลุ่ม (GROUP BY)
      const breakdownResult = await sql`
        WITH OrgCode AS (
          SELECT organization_code 
          FROM organizations
          WHERE organization_id = ${organizationId}
          LIMIT 1
        )
        SELECT 
            r.score, 
            COUNT(r.score) AS count
        FROM 
            case_ratings r
        JOIN 
            issue_cases c ON r.rating_id = c.id -- (*** MODIFIED ***)
        WHERE 
            c.organization_code = (SELECT organization_code FROM OrgCode)
        GROUP BY 
            r.score;
      `;

      // 6. จัดการข้อมูล (JavaScript)
      // 6.1 จัดการ aggregates
      const aggregates = aggregatesResult[0] || {};
      const total_count = parseInt(aggregates.total_count || 0, 10);
      
      // ถ้า total_count = 0, AVG จะเป็น null, เราต้องตั้งค่าเริ่มต้นเป็น 0
      const overall_average = parseFloat(aggregates.overall_average || 0);

      // 6.2 จัดการ breakdown
      // สร้าง Map เพื่อเก็บผลลัพธ์จาก DB (เช่น { 5: 115, 3: 5 })
      const breakdownMap = new Map();
      breakdownResult.forEach(item => {
          breakdownMap.set(
              parseInt(item.score, 10), 
              parseInt(item.count, 10)
          );
      });
      
      // 6.3 สร้าง Array breakdown ที่ครบ 5 ระดับ (1-5 ดาว)
      const fullBreakdown = [5, 4, 3, 2, 1].map(score => ({
          score: score,
          count: breakdownMap.get(score) || 0 // ถ้าไม่มี ให้เป็น 0
      }));

      // 7. สร้าง JSON ที่จะส่งกลับ
      const responseData = {
        overall_average: overall_average,
        total_count: total_count,
        breakdown: fullBreakdown
      };
      
      // 8. ส่งข้อมูลกลับ
      return new Response(JSON.stringify(responseData), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (error) {
      console.error("--- STATS SATISFACTION API ERROR ---", error);
      // ตรวจสอบ error กรณีหา organization_id ไม่เจอ (เหมือน API อื่น)
      if (error.message && error.message.includes('subquery returned no rows')) {
        // ถ้าหา org_id ไม่เจอ, ให้ส่งค่า 0 กลับไป
         return new Response(JSON.stringify({
            overall_average: 0,
            total_count: 0,
            breakdown: [
                { score: 5, count: 0 },
                { score: 4, count: 0 },
                { score: 3, count: 0 },
                { score: 2, count: 0 },
                { score: 1, count: 0 }
            ]
         }), { 
            status: 200, // ถือว่าถูกต้อง (แค่ไม่มีข้อมูล)
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