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

    // Query ข้อมูลรายหน่วยงาน (Child Orgs) โดยรวมข้อมูลทุกด้านไว้ใน Query เดียว
    const stats = await sql`
      WITH RECURSIVE org_tree AS (
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
          
          -- นับสถานะงาน (Workload)
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'รอรับเรื่อง') as pending,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'กำลังดำเนินการ') as in_progress,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'ส่งต่อ') as forwarded,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'ปฏิเสธ') as rejected,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'เชิญร่วม') as invited,
          COUNT(DISTINCT i.issue_cases_id) FILTER (WHERE i.status = 'เสร็จสิ้น') as completed,
          COUNT(DISTINCT i.issue_cases_id) as total_cases,

          -- ความพึงพอใจ (Satisfaction)
          COALESCE(AVG(r.score), 0)::float as avg_score,
          COUNT(r.score) as total_reviews,

          -- เวลาเฉลี่ย SLA (Efficiency)
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (i.updated_at - i.created_at))/86400) 
            FILTER (WHERE i.status = 'เสร็จสิ้น'), 0
          )::float as avg_days

      FROM org_tree o
      LEFT JOIN case_organizations co ON o.organization_id = co.organization_id
      LEFT JOIN issue_cases i ON co.case_id = i.issue_cases_id
      LEFT JOIN case_ratings r ON i.issue_cases_id = r.issue_case_id

      GROUP BY o.organization_id, o.organization_name
      ORDER BY total_cases DESC;
    `;

    // Map ผลลัพธ์ให้เป็น Flat Object ตรงตาม Mockup ที่ใช้ใน Frontend
    const org_stats = stats.map(item => ({
      id: item.id,
      name: item.name,
      total: parseInt(item.total_cases || 0),
      pending: parseInt(item.pending || 0),
      inProgress: parseInt(item.in_progress || 0),
      completed: parseInt(item.completed || 0),
      forwarded: parseInt(item.forwarded || 0),
      rejected: parseInt(item.rejected || 0),
      invited: parseInt(item.invited || 0),
      satisfaction: parseFloat(item.avg_score.toFixed(2)),
      reviews: parseInt(item.total_reviews || 0),
      avgTime: parseFloat(item.avg_days.toFixed(1))
    }));

    return new Response(JSON.stringify(org_stats), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Org Stats Error:", error);
    return new Response(JSON.stringify({ message: 'Server Error', error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}