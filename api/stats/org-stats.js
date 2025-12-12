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

    // SQL Query ที่ปรับชื่อคอลัมน์แล้ว
    const stats = await sql`
      WITH RECURSIVE org_tree AS (
          SELECT id, name, id as root_id 
          FROM organizations 
          WHERE organization_id = ${orgId} -- เช็คชื่อ ID ในตาราง organizations ให้ดีว่าเป็น id หรือ organization_id
          
          UNION ALL
          
          SELECT c.organization_id, c.organization_name, p.root_id
          FROM organizations c
          INNER JOIN org_tree p ON c.parent_id = p.id
      )
      SELECT 
          o.name,
          o.id,
          -- 1. Stacked Chart (ใช้คอลัมน์ 'status' แทน 'status_id')
          COUNT(*) FILTER (WHERE i.status = 1) as pending,
          COUNT(*) FILTER (WHERE i.status = 2) as coordinating,
          COUNT(*) FILTER (WHERE i.status = 3) as in_progress,
          COUNT(*) FILTER (WHERE i.status = 4) as forwarded,
          COUNT(*) FILTER (WHERE i.status = 5) as rejected,
          COUNT(*) FILTER (WHERE i.status = 6) as invited,
          COUNT(*) FILTER (WHERE i.status = 7) as completed,
          COUNT(i.issue_cases_id) as total_cases, -- แก้เป็น issue_cases_id

          -- 2. Satisfaction (เนื่องจากไม่มี column rating ผมใส่ 0 ไว้ก่อน)
          -- หากคุณเพิ่ม column 'rating' แล้ว ให้แก้เลข 0 เป็น i.rating
          0::float as avg_score,
          0 as total_reviews,
          
          0 as star_5,
          0 as star_4,
          0 as star_3,
          0 as star_2,
          0 as star_1,

          -- 3. Avg Time
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (i.updated_at - i.created_at))/86400) 
            FILTER (WHERE i.status = 7), 0
          )::float as avg_days

      FROM org_tree o
      -- *** สำคัญ: ต้องมี column organization_id ใน issue_cases เพื่อเชื่อมโยง ***
      LEFT JOIN issue_cases i ON o.id = i.organization_id 
      GROUP BY o.id, o.name
      ORDER BY total_cases DESC;
    `;

    // แปลงข้อมูล (Mapping)
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
        score: item.avg_score || 0,
        reviews: parseInt(item.total_reviews),
        breakdown: [
          { stars: 5, percent: 0 }, // ยังคำนวณไม่ได้เพราะไม่มี rating
          { stars: 4, percent: 0 },
          { stars: 3, percent: 0 },
          { stars: 2, percent: 0 },
          { stars: 1, percent: 0 },
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