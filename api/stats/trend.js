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
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    const sql = neon(process.env.DATABASE_URL);

    try {
      // 2. Validate Inputs
      const authHeader = req.headers.get('authorization');
      const accessToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;

      if (!accessToken) {
        return new Response(JSON.stringify({ message: 'Authorization token required' }), { status: 401, headers: corsHeaders });
      }

      const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
      const organizationId = searchParams.get('organization_id');
      const range = searchParams.get('range') || '1w'; // Default 1 week

      if (!organizationId) {
        return new Response(JSON.stringify({ message: 'Missing organization_id' }), { status: 400, headers: corsHeaders });
      }

      // 3. Prepare Date Logic
      let intervalStr = '7 days';
      let dateFormat = 'DD/MM';

      switch (range) {
        case '1w': intervalStr = '7 days'; dateFormat = 'DD/MM'; break;
        case '2w': intervalStr = '14 days'; dateFormat = 'DD/MM'; break;
        case '1m': intervalStr = '1 month'; dateFormat = 'DD/MM'; break;
        case '3m': intervalStr = '3 months'; dateFormat = 'MM/YYYY'; break;
        case '1y': intervalStr = '1 year'; dateFormat = 'MM/YYYY'; break;
        case '5y': intervalStr = '5 years'; dateFormat = 'YYYY'; break;
        default:   intervalStr = '7 days';
      }

      // 4. [Optimization] Parallel Execution (Auth + Main Query)
      const [userResult, statsResult] = await Promise.all([
        // Query 1: Check Auth
        sql`SELECT user_id FROM users WHERE "access_token" = ${accessToken}`,

        // Query 2: Get Activity Stats
        // ใช้ sql.unsafe หรือ parameter binding ระวังเรื่อง interval
        // ตรงนี้ใช้ SQL Template String ปกติของ Neon จะปลอดภัยสุด
        sql`
          SELECT 
            TO_CHAR(ic.created_at, ${dateFormat}) AS date,
            COUNT(*) FILTER (
              WHERE ic.new_value IN ('รอรับเรื่อง', 'กำลังดำเนินการ', 'ส่งต่อ', 'เชิญร่วม', 'ปฏิเสธ', 'เสร็จสิ้น')
            ) AS total,
            COUNT(*) FILTER (WHERE ic.new_value = 'รอรับเรื่อง') AS pending,
            COUNT(*) FILTER (WHERE ic.new_value = 'กำลังดำเนินการ') AS action,
            COUNT(*) FILTER (WHERE ic.new_value = 'ส่งต่อ') AS forward,
            COUNT(*) FILTER (WHERE ic.new_value = 'เชิญร่วม') AS invite,
            COUNT(*) FILTER (WHERE ic.new_value = 'ปฏิเสธ') AS rejected,    
            COUNT(*) FILTER (WHERE ic.new_value = 'เสร็จสิ้น') AS completed
          FROM case_activity_logs ic
          JOIN case_organizations co ON ic.case_id = co.case_id
          WHERE 
            co.organization_id = ${organizationId}
            AND ic.created_at >= NOW() - ${intervalStr}::interval
          GROUP BY 1
          ORDER BY MIN(ic.created_at) ASC;
        `
      ]);

      // 5. Check Auth Result
      if (userResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Invalid or expired token' }), { status: 401, headers: corsHeaders });
      }

      // 6. Return Data
      return new Response(JSON.stringify(statsResult), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (error) {
      console.error("--- ACTIVITY STATS ERROR ---", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  return new Response(null, { status: 405, headers: corsHeaders });
}