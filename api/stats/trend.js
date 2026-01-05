import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    // ------------------------------------------------------------------
    // 1. Authentication (ตรวจสอบ Token)
    // ------------------------------------------------------------------
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

    // ✅ แก้ไข: เติม public. หน้า users
    const userResult = await sql`SELECT user_id FROM public.users WHERE "access_token" = ${accessToken}`;
    
    if (userResult.length === 0) {
      return new Response(JSON.stringify({ message: 'Invalid or expired token' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ------------------------------------------------------------------
    // 2. รับ Params และกำหนดช่วงเวลา
    // ------------------------------------------------------------------
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');
    const range = searchParams.get('range') || '1m'; 

    if (!organizationId) {
      return new Response(JSON.stringify({ message: 'Missing organization_id' }), { status: 400, headers: corsHeaders });
    }

    let intervalStr = '7 days';
    let dateFormat = 'DD/MM'; 

    switch (range) {
      case '1w': intervalStr = '7 days'; dateFormat = 'DD/MM'; break;
      case '2w': intervalStr = '14 days'; dateFormat = 'DD/MM'; break;
      case '3w': intervalStr = '21 days'; dateFormat = 'DD/MM'; break;
      case '1m': intervalStr = '1 month'; dateFormat = 'DD/MM'; break;
      case '3m': intervalStr = '3 months'; dateFormat = 'MM/YYYY'; break;
      case '1y': intervalStr = '1 year'; dateFormat = 'MM/YYYY'; break;
      case '5y': intervalStr = '5 years'; dateFormat = 'YYYY'; break;
      default:   intervalStr = '7 days';
    }

    // ------------------------------------------------------------------
    // 3. Query Data
    // ------------------------------------------------------------------
    // ✅ แก้ไข: เติม public. หน้า case_activity_logs และ case_organizations
    const result = await sql`
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

      FROM public.case_activity_logs ic
      JOIN public.case_organizations co ON ic.case_id = co.case_id
      
      WHERE 
        co.organization_id = ${organizationId}
        AND ic.created_at >= NOW() - ${intervalStr}::interval
      GROUP BY 1
      ORDER BY MIN(ic.created_at) ASC;
    `;

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("API Error (Trend):", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}