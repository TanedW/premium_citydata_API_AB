import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  // 🔥 เพิ่ม Cache: เก็บผลลัพธ์ไว้ 60 วินาที (User คนถัดไปจะโหลดเสร็จใน 50ms)
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
};

export default async function handler(req) {
  // Handle CORS
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const sql = neon(process.env.DATABASE_URL);

    // 1. Check Input (Validate เร็วๆ ก่อนต่อ DB)
    const authHeader = req.headers.get('authorization');
    const accessToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
    
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');
    const range = searchParams.get('range') || '1w';

    if (!accessToken) return new Response(JSON.stringify({ message: 'Token required' }), { status: 401, headers: corsHeaders });
    if (!organizationId) return new Response(JSON.stringify({ message: 'Org ID required' }), { status: 400, headers: corsHeaders });

    // 2. Prepare Date Logic (Native JS)
    let intervalStr = '7 days';
    // Mapping ช่วงเวลาให้ตรงกับ PostgreSQL Interval
    switch (range) {
      case '1w': intervalStr = '7 days'; break;
      case '2w': intervalStr = '14 days'; break;
      case '1m': intervalStr = '1 month'; break;
      case '3m': intervalStr = '3 months'; break;
      case '1y': intervalStr = '1 year'; break;
      case '5y': intervalStr = '5 years'; break;
    }

    // 3. Parallel Execution: ยิง 2 Query พร้อมกัน (Auth + Data)
    // การแยก Query ช่วยให้ DB Planner ทำงานง่ายกว่า CTE ซับซ้อนในบางกรณี
    const [userResult, rawStats] = await Promise.all([
      // Query 1: Auth Check
      sql`SELECT user_id FROM users WHERE "access_token" = ${accessToken} LIMIT 1`,

      // Query 2: Get Stats (Return แค่ไม่กี่แถวตามจำนวนวัน)
      sql`
        SELECT 
          ic.created_at::date as date_val,
          COUNT(*) FILTER (WHERE ic.new_value IN ('รอรับเรื่อง', 'กำลังดำเนินการ', 'ส่งต่อ', 'เชิญร่วม', 'ปฏิเสธ', 'เสร็จสิ้น')) AS total,
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
        ORDER BY 1 ASC;
      `
    ]);

    // 4. Validate Auth
    if (userResult.length === 0) {
      return new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401, headers: corsHeaders });
    }

    // 5. Format Date (ทำใน JS เร็วกว่า DB)
    const formattedData = rawStats.map(item => {
      const d = new Date(item.date_val);
      // Format: DD/MM (Native JS, No library needed)
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      return {
        ...item,
        date: dateStr
      };
    });

    return new Response(JSON.stringify(formattedData), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}