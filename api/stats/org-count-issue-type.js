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

    // Query ประเภทปัญหา โดยรวมจากทุกหน่วยงานภายใต้ Org ID ที่ส่งมา
    const problemTypes = await sql`
      WITH RECURSIVE org_tree AS (
          SELECT organization_id
          FROM organizations 
          WHERE organization_id = ${orgId} 
          UNION ALL
          SELECT c.organization_id
          FROM organizations c
          INNER JOIN org_tree p ON c.parent_id = p.organization_id
      )
      SELECT 
          t.issue_type_name as name,
          COUNT(DISTINCT i.issue_cases_id) as count
      FROM issue_cases i
      JOIN case_organizations co ON i.issue_cases_id = co.case_id
      JOIN org_tree o ON co.organization_id = o.organization_id
      LEFT JOIN issue_types t ON i.issue_type_id = t.issue_type_id
      WHERE t.issue_type_name IS NOT NULL
      GROUP BY t.issue_type_name
      ORDER BY count DESC
      LIMIT 10;
    `;

    // Map ผลลัพธ์
    const problem_type_stats = problemTypes.map((item, index) => ({
      id: index + 1,
      name: item.name,
      count: parseInt(item.count || 0)
      // สี (color) สามารถจัดการที่ Frontend ได้ หรือจะเพิ่ม Logic สุ่มสีที่นี่ก็ได้
    }));

    return new Response(JSON.stringify(problem_type_stats), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Problem Types Error:", error);
    return new Response(JSON.stringify({ message: 'Server Error', error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}