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
  // 1. Handle CORS Preflight
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

    // =====================================================================
    // SQL QUERY UPDATED (รองรับ Status ภาษาไทย และโครงสร้างตารางใหม่)
    // =====================================================================
    const stats = await sql`
      WITH RECURSIVE org_tree AS (
          -- 1. หาองค์กรแม่และลูกทั้งหมด (Hierarchy)
          SELECT organization_id, organization_name
          FROM organizations 
          WHERE organization_id = ${orgId} 
          
          UNION ALL
          
          SELECT c.organization_id, c.organization_name
          FROM organizations c
          INNER JOIN org_tree p ON c.parent_id = p.organization_id
      )
      SELECT 
          o.organization_name as name,
          o.organization_id as id,
          
          -- 2. นับสถานะ (Mapping ภาษาไทย ตาม SQL Insert)
          -- ใช้ DISTINCT i.issue_cases_id เพื่อกันการนับซ้ำจากการ Join Rating
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'รอรับเรื่อง') as pending,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'กำลังดำเนินการ') as in_progress,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'ส่งต่อ') as forwarded,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'ปฏิเสธ') as rejected,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'เชิญร่วม') as invited,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'เสร็จสิ้น') as completed,
          
          -- ยอดรวมเคสทั้งหมด (ไม่ซ้ำ)
          COUNT(DISTINCT i.issue_cases_id) as total_cases,

          -- 3. คำนวณคะแนนจากตาราง case_ratings (เชื่อมด้วย issue_case_id)
          COALESCE(AVG(r.score), 0)::float as avg_score,
          COUNT(r.score) as total_reviews,
          
          -- Breakdown ดาว
          COUNT(r.score) FILTER (WHERE r.score = 5) as star_5,
          COUNT(r.score) FILTER (WHERE r.score = 4) as star_4,
          COUNT(r.score) FILTER (WHERE r.score = 3) as star_3,
          COUNT(r.score) FILTER (WHERE r.score = 2) as star_2,
          COUNT(r.score) FILTER (WHERE r.score = 1) as star_1,

          -- 4. Avg Time (เวลาเฉลี่ย - เฉพาะสถานะ 'เสร็จสิ้น')
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (i.updated_at - i.created_at))/86400) 
            FILTER (WHERE i.status = 'เสร็จสิ้น'), 0
          )::float as avg_days

      FROM org_tree o
      -- JOIN 1: องค์กร -> ตารางกลาง (case_organizations)
      LEFT JOIN case_organizations co ON o.organization_id = co.organization_id
      -- JOIN 2: ตารางกลาง -> ตัวเคส (issue_cases)
      LEFT JOIN issue_cases i ON co.case_id = i.issue_cases_id
      -- JOIN 3: ตัวเคส -> คะแนนรีวิว (case_ratings)
      LEFT JOIN case_ratings r ON i.issue_cases_id = r.issue_case_id

      GROUP BY o.organization_id, o.organization_name
      ORDER BY total_cases DESC;
    `;

    // แปลงข้อมูลให้ตรง Format Frontend
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
      id: index + 1,
      name: item.name,
      details: {
        score: parseFloat(item.avg_score.toFixed(2)),
        reviews: parseInt(item.total_reviews),
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
    return new Response(JSON.stringify({ message: 'Server Error', error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Helper Function
function calcPercent(val, total) {
  if (!total || total === 0) return 0;
  return Math.round((parseInt(val) / parseInt(total)) * 100);
}