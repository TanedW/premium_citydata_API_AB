import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' 
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');
    
    const monthsBack = parseInt(searchParams.get('months') || '6'); 

    if (!organizationId) {
      return new Response(JSON.stringify({ message: 'Missing organization_id' }), { status: 400, headers: corsHeaders });
    }

    const result = await sql`
      WITH target_candidates AS (
        -- 1. กรองเฉพาะเคส (เติม public.issue_cases และ public.case_organizations)
        SELECT 
            ic.issue_cases_id,
            ic.title,
            ic.created_at,
            ic.issue_type_id
        FROM public.issue_cases ic
        JOIN public.case_organizations co ON ic.issue_cases_id = co.case_id
        WHERE 
            co.organization_id = ${organizationId}
            AND ic.status = 'เสร็จสิ้น'
            ${monthsBack > 0 ? sql`AND ic.created_at >= NOW() - (${monthsBack} || ' months')::interval` : sql``}
      ),
      calculated_times AS (
        -- 2. คำนวณเวลา (เติม public.case_activity_logs ใน Subqueries ทั้ง 3 จุด)
        SELECT 
            tc.issue_cases_id,
            tc.title,
            tc.issue_type_id,
            tc.created_at,
            -- Subquery 1
            (SELECT created_at FROM public.case_activity_logs WHERE case_id = tc.issue_cases_id AND new_value = 'เสร็จสิ้น' LIMIT 1) as finish_time,
            -- Subquery 2
            (SELECT created_at FROM public.case_activity_logs WHERE case_id = tc.issue_cases_id AND new_value NOT IN ('รอรับเรื่อง') ORDER BY created_at ASC LIMIT 1) as action_time,
            -- Subquery 3
            (SELECT created_at FROM public.case_activity_logs WHERE case_id = tc.issue_cases_id AND new_value = 'กำลังดำเนินการ' LIMIT 1) as process_time
        FROM target_candidates tc
      )
      -- 3. Final Select (เติม public.issue_types)
      SELECT 
        ct.title,
        it.name as issue_type,
        
        EXTRACT(EPOCH FROM (COALESCE(ct.action_time, ct.process_time, ct.finish_time, NOW()) - ct.created_at)) / 3600 as stage1_hours,

        CASE 
            WHEN ct.process_time IS NOT NULL AND ct.action_time IS NOT NULL THEN EXTRACT(EPOCH FROM (ct.process_time - ct.action_time)) / 3600
            WHEN ct.process_time IS NULL AND ct.finish_time IS NOT NULL AND ct.action_time IS NOT NULL THEN EXTRACT(EPOCH FROM (ct.finish_time - ct.action_time)) / 3600
            ELSE 0 
        END as stage2_hours,

        CASE 
            WHEN ct.finish_time IS NOT NULL AND ct.process_time IS NOT NULL THEN EXTRACT(EPOCH FROM (ct.finish_time - ct.process_time)) / 3600
            ELSE 0 
        END as stage3_hours,

        EXTRACT(EPOCH FROM (COALESCE(ct.finish_time, NOW()) - ct.created_at)) / 3600 as total_hours

      FROM calculated_times ct
      LEFT JOIN public.issue_types it ON ct.issue_type_id = it.issue_id 
      ORDER BY total_hours DESC
      LIMIT 10;
    `;

    // Process Data in JS
    const formattedData = result.map(row => {
      const rawTitle = row.title || 'ไม่มีหัวข้อ';
      return {
        title: rawTitle.length > 20 ? rawTitle.substring(0, 20) + '...' : rawTitle,
        full_title: rawTitle,
        type: row.issue_type || 'ไม่ระบุ',
        stage1: parseFloat(Math.max(0, parseFloat(row.stage1_hours || 0)).toFixed(2)),
        stage2: parseFloat(Math.max(0, parseFloat(row.stage2_hours || 0)).toFixed(2)),
        stage3: parseFloat(Math.max(0, parseFloat(row.stage3_hours || 0)).toFixed(2)),
        total: parseFloat(Math.max(0, parseFloat(row.total_hours || 0)).toFixed(2))
      };
    });

    return new Response(JSON.stringify(formattedData), { status: 200, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}