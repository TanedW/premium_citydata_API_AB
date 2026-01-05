import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    // --- 1. Parse Inputs ---
    const authHeader = req.headers.get('authorization');
    const accessToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
    
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');
    const range = searchParams.get('range') || '1w';

    if (!accessToken) return new Response(JSON.stringify({ message: 'Token required' }), { status: 401, headers: corsHeaders });
    if (!organizationId) return new Response(JSON.stringify({ message: 'Org ID required' }), { status: 400, headers: corsHeaders });

    // --- 2. Date Interval Logic ---
    let intervalStr = '7 days';
    switch (range) {
      case '1w': intervalStr = '7 days'; break;
      case '2w': intervalStr = '14 days'; break;
      case '1m': intervalStr = '1 month'; break;
      case '3m': intervalStr = '3 months'; break;
      case '1y': intervalStr = '1 year'; break;
      case '5y': intervalStr = '5 years'; break;
    }

    // --- 3. Optimized Query (CTE) ---
    const result = await sql`
      WITH 
        auth_check AS (
          SELECT user_id FROM users WHERE "access_token" = ${accessToken} LIMIT 1
        ),
        stats_data AS (
          SELECT 
            ic.created_at::date AS date_val,
            ic.new_value
          FROM case_activity_logs ic
          JOIN case_organizations co ON ic.case_id = co.case_id
          WHERE 
            co.organization_id = ${organizationId}
            AND ic.created_at >= NOW() - ${intervalStr}::interval
            AND EXISTS (SELECT 1 FROM auth_check)
        )
      SELECT 
        (SELECT user_id FROM auth_check) as user_id,
        (
          SELECT COALESCE(json_agg(t), '[]'::json)
          FROM (
             SELECT 
                date_val,
                COUNT(*) FILTER (WHERE new_value IN ('รอรับเรื่อง', 'กำลังดำเนินการ', 'ส่งต่อ', 'เชิญร่วม', 'ปฏิเสธ', 'เสร็จสิ้น')) AS total,
                COUNT(*) FILTER (WHERE new_value = 'รอรับเรื่อง') AS pending,
                COUNT(*) FILTER (WHERE new_value = 'กำลังดำเนินการ') AS action,
                COUNT(*) FILTER (WHERE new_value = 'ส่งต่อ') AS forward,
                COUNT(*) FILTER (WHERE new_value = 'เชิญร่วม') AS invite,
                COUNT(*) FILTER (WHERE new_value = 'ปฏิเสธ') AS rejected,    
                COUNT(*) FILTER (WHERE new_value = 'เสร็จสิ้น') AS completed
             FROM stats_data
             GROUP BY 1
             ORDER BY 1 ASC
          ) t
        ) as data;
    `;

    const row = result[0];

    if (!row.user_id) {
      return new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 4. Format Date using Native JS (No dayjs needed) ---
    const finalData = row.data.map(item => {
        // แปลงวันที่เป็น Date Object
        const dateObj = new Date(item.date_val);
        
        // จัด Format เป็น DD/MM (เช่น 18/01) แบบไม่ใช้ Library
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Month เริ่มที่ 0
        const formattedDate = `${day}/${month}`;

        return {
            ...item,
            date: formattedDate
        };
    });

    return new Response(JSON.stringify(finalData), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}