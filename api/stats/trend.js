//api/stats/trend.js

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
    
    // ... (Authentication Code ส่วนตรวจสอบ Token เหมือนไฟล์เดิม) ...
    // เพื่อความกระชับ ผมขอข้าม code auth ตรงนี้ไป (ให้ copy จากไฟล์ count-by-type.js มาใส่)

    // รับ Params
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');
    const range = searchParams.get('range') || '1m'; // ค่า default คือ 1 สัปดาห์

    if (!organizationId) {
      return new Response(JSON.stringify({ message: 'Missing organization_id' }), { status: 400, headers: corsHeaders });
    }

    // กำหนดช่วงเวลา (Interval) และรูปแบบวันที่ (DateFormat) สำหรับ PostgreSQL
    let intervalStr = '7 days';
    let dateFormat = 'DD/MM'; // แสดงเป็น วัน/เดือน (เช่น 18/11)

    switch (range) {
      case '1w': intervalStr = '7 days'; dateFormat = 'DD/MM'; break;
      case '2w': intervalStr = '14 days'; dateFormat = 'DD/MM'; break;
      case '3w': intervalStr = '21 days'; dateFormat = 'DD/MM'; break;
      case '1m': intervalStr = '1 month'; dateFormat = 'DD/MM'; break;
      case '3m': intervalStr = '3 months'; dateFormat = 'MM/YYYY'; break; // เริ่มดูเป็นรายเดือน
      case '1y': intervalStr = '1 year'; dateFormat = 'MM/YYYY'; break;
      case '5y': intervalStr = '5 years'; dateFormat = 'YYYY'; break;     // ดูเป็นรายปี
      default:   intervalStr = '7 days';
    }

    // // SQL Query: ดึงข้อมูลตามช่วงเวลา และ Group ตามวันที่
    // const result = await sql`
    //   SELECT 
    //     TO_CHAR(ic.updated_at, ${dateFormat}) AS date,
    //     COUNT(*) AS total,
    //     COUNT(*) FILTER (WHERE ic.status = 'รอรับเรื่อง') AS pending,
    //     COUNT(*) FILTER (WHERE ic.status = 'กำลังดำเนินการ') AS action,
    //     COUNT(*) FILTER (WHERE ic.status = 'ส่งต่อ') AS forward,
    //     COUNT(*) FILTER (WHERE ic.status = 'เชิญร่วม') AS invite,
    //     COUNT(*) FILTER (WHERE ic.status = 'ปฏิเสธ') AS rejecte,    
    //     COUNT(*) FILTER (WHERE ic.status = 'เสร็จสิ้น') AS completed
    //   FROM issue_cases ic
    //   JOIN case_organizations co ON ic.issue_cases_id = co.case_id
    //   WHERE 
    //     co.organization_id = ${organizationId}
    //     AND ic.updated_at >= NOW() - ${intervalStr}::interval
    //   GROUP BY 1
    //   ORDER BY MIN(ic.updated_at) ASC;
    // `;

        // SQL Query: ดึงข้อมูลตามช่วงเวลา และ Group ตามวันที่
    const result = await sql`
      SELECT 
        TO_CHAR(ic.create_at, ${dateFormat}) AS date,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ic.new_value = 'รอรับเรื่อง') AS pending,
        COUNT(*) FILTER (WHERE ic.new_value = 'กำลังดำเนินการ') AS action,
        COUNT(*) FILTER (WHERE ic.new_value = 'ส่งต่อ') AS forward,
        COUNT(*) FILTER (WHERE ic.new_value = 'เชิญร่วม') AS invite,
        COUNT(*) FILTER (WHERE ic.new_value = 'ปฏิเสธ') AS rejecte,    
        COUNT(*) FILTER (WHERE ic.new_value = 'เสร็จสิ้น') AS completed
      FROM case_activity_logs ic
      JOIN case_organizations co ON ic.log_id = co.case_id
      WHERE 
        co.organization_id = ${organizationId}
        AND ic.create_at >= NOW() - ${intervalStr}::interval
      GROUP BY 1
      ORDER BY MIN(ic.create_at) ASC;
    `;

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}