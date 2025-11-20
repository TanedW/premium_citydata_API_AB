 //api/stats/overall-rating:

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
      // (*** นี่คือ Query ที่แก้ไขแล้ว ***)
      const aggregatesResult = await sql`
        SELECT
            COUNT(r.score) AS total_count,
            AVG(r.score) AS overall_average
        FROM 
            case_ratings r
        JOIN 
            issue_cases c ON r.issue_case_id = c.issue_cases_id
        JOIN
            case_organizations co ON c.issue_cases_id = co.case_id
        WHERE 
            co.organization_id = ${organizationId};
      `;
      
      // 5.2 Query สอง: นับคะแนนแยกตามกลุ่ม (GROUP BY)
      // (*** นี่คือ Query ที่แก้ไขแล้ว ***)
      const breakdownResult = await sql`
        SELECT 
            r.score, 
            COUNT(r.score) AS count
        FROM 
            case_ratings r
        JOIN 
            issue_cases c ON r.issue_case_id = c.issue_cases_id
        JOIN
            case_organizations co ON c.issue_cases_id = co.case_id
        WHERE 
            co.organization_id = ${organizationId}
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
      
      // (*** ปรับปรุง Error Handling ***)
      // Query ใหม่จะไม่โยน 'subquery returned no rows'
      // ถ้าไม่เจอข้อมูล มันจะคืนค่า count: 0, avg: null ซึ่ง JS ด้านบน (6.1) จัดการเรียบร้อยแล้ว
      // ดังนั้น ถ้ามาถึง catch block แสดงว่าเป็น Error ร้ายแรงจริง
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