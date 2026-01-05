import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    const sql = neon(process.env.DATABASE_URL);

    try {
      // 2. ตรวจสอบ Inputs เบื้องต้น (Validation) ก่อนเริ่มเชื่อมต่อ DB
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

      const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
      const organizationId = searchParams.get('organization_id');

      if (!organizationId) {
        return new Response(JSON.stringify({ message: 'organization_id query parameter is required' }), { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // 3. [OPTIMIZATION] ยิง 3 Queries พร้อมกัน (Parallel Execution)
      const [userResult, aggregatesResult, breakdownResult] = await Promise.all([
        // Query 1: Check Auth (เติม public.users)
        sql`SELECT user_id FROM public.users WHERE "access_token" = ${accessToken}`,

        // Query 2: Aggregate (Total & Avg)
        // ✅ แก้ไข: เติม public. และแก้ r.issue_case_id เป็น r.case_id
        sql`
          SELECT
              COUNT(r.score) AS total_count,
              AVG(r.score) AS overall_average
          FROM 
              public.case_ratings r
          JOIN 
              public.issue_cases c ON r.case_id = c.issue_cases_id
          JOIN
              public.case_organizations co ON c.issue_cases_id = co.case_id
          WHERE 
              co.organization_id = ${organizationId}
        `,

        // Query 3: Breakdown (1-5 Stars)
        // ✅ แก้ไข: เติม public. และแก้ r.issue_case_id เป็น r.case_id
        sql`
          SELECT 
              r.score, 
              COUNT(r.score) AS count
          FROM 
              public.case_ratings r
          JOIN 
              public.issue_cases c ON r.case_id = c.issue_cases_id
          JOIN
              public.case_organizations co ON c.issue_cases_id = co.case_id
          WHERE 
              co.organization_id = ${organizationId}
          GROUP BY 
              r.score
        `
      ]);
      
      // 4. ตรวจสอบผล Auth หลังจากข้อมูลมาครบแล้ว
      if (userResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Invalid or expired token' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // 5. จัดการข้อมูล (Data Processing)
      const aggregates = aggregatesResult[0] || {};
      const total_count = parseInt(aggregates.total_count || 0, 10);
      const overall_average = parseFloat(aggregates.overall_average || 0);

      const breakdownMap = new Map();
      breakdownResult.forEach(item => {
          breakdownMap.set(parseInt(item.score, 10), parseInt(item.count, 10));
      });
      
      const fullBreakdown = [5, 4, 3, 2, 1].map(score => ({
          score: score,
          count: breakdownMap.get(score) || 0
      }));

      // 6. Return Response
      return new Response(JSON.stringify({
        overall_average: overall_average,
        total_count: total_count,
        breakdown: fullBreakdown
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (error) {
      console.error("--- STATS SATISFACTION API ERROR ---", error);
      return new Response(JSON.stringify({ message: 'An internal error occurred', error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  }

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
    status: 405, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  });
}