//api/dashboard/org-stats.js


import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // หรือใส่ Domain ของคุณ
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org_id');

  if (!orgId) {
    return new Response(JSON.stringify({ message: 'Missing org_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // ------------------------------------------------------------------
    // SQL Query เดียวที่ดึงข้อมูลสรุปแยกตามหน่วยงาน (Group By Organization)
    // ------------------------------------------------------------------
    // 1. CTE: หาหน่วยงานทั้งหมดในสายบังคับบัญชา (Hierarchy)
    // 2. LEFT JOIN: กับตาราง issue_cases เพื่อคำนวณสถิติ
    // ------------------------------------------------------------------
    const stats = await sql`
      WITH RECURSIVE org_tree AS (
          -- Anchor: เริ่มจากหน่วยงานที่ระบุ
          SELECT id, name, id as root_id 
          FROM organizations 
          WHERE id = ${orgId} -- หรือ parent_id = ${orgId} ถ้าอยากดูแค่ลูก
          
          UNION ALL
          
          -- Recursive: หาหน่วยงานลูก
          SELECT c.id, c.name, p.root_id
          FROM organizations c
          INNER JOIN org_tree p ON c.parent_id = p.id
      )
      SELECT 
          o.name,
          o.id,
          -- 1. ส่วนของ Stacked Chart (นับตามสถานะ)
          -- ** ต้องแก้ status_id ให้ตรงกับ Database จริงของคุณ **
          COUNT(*) FILTER (WHERE i.status_id = 1) as pending,      -- รอรับเรื่อง
          COUNT(*) FILTER (WHERE i.status_id = 2) as coordinating, -- กำลังประสาน
          COUNT(*) FILTER (WHERE i.status_id = 3) as in_progress,  -- กำลังดำเนินการ
          COUNT(*) FILTER (WHERE i.status_id = 4) as forwarded,    -- ส่งต่อ
          COUNT(*) FILTER (WHERE i.status_id = 5) as rejected,     -- ปฏิเสธ
          COUNT(*) FILTER (WHERE i.status_id = 6) as invited,      -- เชิญร่วม
          COUNT(*) FILTER (WHERE i.status_id = 7) as completed,    -- เสร็จสิ้น
          COUNT(i.id) as total_cases,

          -- 2. ส่วนของ Satisfaction (คะแนนรีวิว)
          -- สมมติว่ามี column 'rating' (1-5) ในตาราง issue_cases หรือตาราง reviews
          COALESCE(AVG(i.rating), 0)::float as avg_score,
          COUNT(i.rating) as total_reviews,
          
          -- Breakdown ดาว (สำหรับ Card)
          COUNT(*) FILTER (WHERE i.rating = 5) as star_5,
          COUNT(*) FILTER (WHERE i.rating = 4) as star_4,
          COUNT(*) FILTER (WHERE i.rating = 3) as star_3,
          COUNT(*) FILTER (WHERE i.rating = 2) as star_2,
          COUNT(*) FILTER (WHERE i.rating = 1) as star_1,

          -- 3. ส่วนของ Avg Time (เวลาเฉลี่ยเป็นวัน)
          -- คำนวณจาก created_at ถึง updated_at (กรณีเสร็จสิ้น)
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (i.updated_at - i.created_at))/86400) 
            FILTER (WHERE i.status_id = 7), 0
          )::float as avg_days

      FROM org_tree o
      LEFT JOIN issue_cases i ON o.id = i.organization_id
      GROUP BY o.id, o.name
      ORDER BY total_cases DESC; -- เรียงตามจำนวนเคส
    `;

    // แปลงข้อมูลให้ตรง Format ของ Frontend
    const stackedData = stats.map(item => ({
      name: item.name,
      pending: parseInt(item.pending),
      coordinating: parseInt(item.coordinating),
      inProgress: parseInt(item.in_progress),
      forwarded: parseInt(item.forwarded),
      rejected: parseInt(item.rejected),
      invited: parseInt(item.invited),
      completed: parseInt(item.completed),
      total: parseInt(item.total_cases)
    }));

    const reportData = stats.map((item, index) => ({
      id: index + 1, // ลำดับที่
      name: item.name,
      details: {
        score: item.avg_score,
        reviews: parseInt(item.total_reviews),
        // คำนวณ % Breakdown เองที่นี่เพื่อให้ Frontend ใช้ง่าย
        breakdown: [
          { stars: 5, percent: calcPercent(item.star_5, item.total_reviews) },
          { stars: 4, percent: calcPercent(item.star_4, item.total_reviews) },
          { stars: 3, percent: calcPercent(item.star_3, item.total_reviews) },
          { stars: 2, percent: calcPercent(item.star_2, item.total_reviews) },
          { stars: 1, percent: calcPercent(item.star_1, item.total_reviews) },
        ]
      }
    }));

    const avgTimeData = stats.map(item => ({
      name: item.name,
      value: parseFloat(item.avg_days.toFixed(1))
    }));

    return new Response(JSON.stringify({
      stackedData,
      reportData,
      avgTimeData
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Stats Error:", error);
    return new Response(JSON.stringify({ message: 'Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Helper คำนวณ %
function calcPercent(val, total) {
  if (!total || total === 0) return 0;
  return Math.round((parseInt(val) / parseInt(total)) * 100);
}