// api/stats/org-count-issue-type.js

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

    // Query ประเภทปัญหา โดยรวมจากทุกหน่วยงานภายใต้ Org ID (Closure Table)
    const problemTypes = await sql`
      SELECT 
          t.name as name,
          
          /* 1. ดึงค่า SLA Target (ถ้าไม่มีให้ Default 3) */
          COALESCE(t.sla_target_days, 3) as sla_target_days,

          COUNT(DISTINCT i.issue_cases_id) as count,

          /* 2. คำนวณเวลาเฉลี่ย (ชั่วโมง) เฉพาะเคสที่ 'เสร็จสิ้น' */
          COALESCE(
            AVG(
              EXTRACT(EPOCH FROM (i.updated_at - i.created_at)) / 3600
            ) FILTER (WHERE i.status = 'เสร็จสิ้น'), 
            0
          ) AS avg_resolution_time

      FROM issue_cases i
      JOIN case_organizations co ON i.issue_cases_id = co.case_id
      
      -- เชื่อมโยงกับ Closure Table เพื่อตรวจสอบว่า Case นี้อยู่ใน Org ภายใต้สังกัดหรือไม่
      JOIN organization_hierarchy h ON co.organization_id = h.descendant_id
      
      LEFT JOIN issue_types t ON i.issue_type_id = t.issue_id
      
      -- กรองเฉพาะ Case ที่เกิดในองค์กรที่มี ancestor_id ตรงกับ orgId ที่ส่งมา
      WHERE h.ancestor_id = ${orgId}
        AND t.name IS NOT NULL
        
      /* 3. ต้อง Group By ค่า SLA ด้วย */
      GROUP BY t.name, t.sla_target_days
      ORDER BY count DESC
      LIMIT 10;
    `;

    // Map ผลลัพธ์ส่งกลับไป
    const problem_type_stats = problemTypes.map((item, index) => ({
      id: index + 1,
      name: item.name,
      count: parseInt(item.count || 0),
      // ส่งค่าเพิ่มกลับไปให้ Frontend
      sla_target_days: parseFloat(item.sla_target_days),
      avg_resolution_time: parseFloat(item.avg_resolution_time)
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