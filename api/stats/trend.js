import { neon } from '@neondatabase/serverless';
import dayjs from 'dayjs'; // *แนะนำให้ใช้ Library นี้จัด Format วันที่ใน JS แทน DB จะเร็วกว่า

export const config = {
  runtime: 'edge',
};

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
    
    // --- Parse Inputs ---
    const authHeader = req.headers.get('authorization');
    const accessToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
    
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');
    const range = searchParams.get('range') || '1w';

    if (!accessToken) return new Response(JSON.stringify({ message: 'Token required' }), { status: 401, headers: corsHeaders });
    if (!organizationId) return new Response(JSON.stringify({ message: 'Org ID required' }), { status: 400, headers: corsHeaders });

    // --- Prepare Date Interval ---
    let intervalStr = '7 days';
    switch (range) {
      case '1w': intervalStr = '7 days'; break;
      case '2w': intervalStr = '14 days'; break;
      case '1m': intervalStr = '1 month'; break;
      case '3m': intervalStr = '3 months'; break;
      case '1y': intervalStr = '1 year'; break;
      case '5y': intervalStr = '5 years'; break;
    }

    // --- SUPER FAST QUERY (Single Round Trip) ---
    // รวม Auth + Data ไว้ในก้อนเดียว เพื่อลด HTTP Request เหลือ 1 ครั้งถ้วน
    const result = await sql`
      WITH 
        -- 1. เช็คสิทธิ์ User (ทำงานเร็วมาก)
        auth_check AS (
          SELECT user_id FROM users WHERE "access_token" = ${accessToken} LIMIT 1
        ),
        -- 2. ดึงข้อมูล (จะทำก็ต่อเมื่อ User ผ่านการตรวจสอบ)
        stats_data AS (
          SELECT 
            ic.created_at::date AS date_val, -- ใช้ date type เร็วกว่า to_char
            ic.new_value
          FROM case_activity_logs ic
          JOIN case_organizations co ON ic.case_id = co.case_id
          WHERE 
            co.organization_id = ${organizationId}
            AND ic.created_at >= NOW() - ${intervalStr}::interval
            AND EXISTS (SELECT 1 FROM auth_check) -- Security Guard
        )
      -- 3. รวมผลลัพธ์ส่งกลับ
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

    // --- Check Auth Result ---
    if (!row.user_id) {
      return new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- Format Date in JS (Faster than DB TO_CHAR) ---
    // ใช้ JS วนลูปจัด format วันที่นิดเดียว เร็วกว่าให้ DB แปลง string
    const finalData = row.data.map(item => ({
        ...item,
        date: new Date(item.date_val).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) // DD/MM
    }));

    return new Response(JSON.stringify(finalData), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}