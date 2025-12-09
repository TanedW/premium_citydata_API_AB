//api/stats/efficiency.js

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
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');

    if (!organizationId) {
      return new Response(JSON.stringify({ message: 'Missing organization_id' }), { status: 400, headers: corsHeaders });
    }

    const result = await sql`
      WITH 
      first_action_log AS (
        SELECT 
          case_id, 
          MIN(created_at) as action_time 
        FROM case_activity_logs
        WHERE new_value IN ('รอรับเรื่อง') 
        GROUP BY case_id
      ),
      first_finish_log AS (
        SELECT 
          case_id, 
          MIN(created_at) as finish_time 
        FROM case_activity_logs
        WHERE new_value = 'เสร็จสิ้น'
        GROUP BY case_id
      )

      SELECT 
        ic.issue_cases_id as id,
        
        -- ✅ แก้ไขจุดที่ 1: ดึงชื่อประเภทปัญหาจากตาราง issue_types
        it.name as issue_type,
        
        EXTRACT(EPOCH FROM (COALESCE(fa.action_time, ff.finish_time, NOW()) - ic.created_at)) / 3600 as stage1_hours,

        CASE 
            WHEN ff.finish_time IS NOT NULL AND fa.action_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ff.finish_time - fa.action_time)) / 3600
            ELSE 0 
        END as stage3_hours,

        EXTRACT(EPOCH FROM (COALESCE(ff.finish_time, NOW()) - ic.created_at)) / 3600 as total_hours

      FROM issue_cases ic
      
      -- ✅ แก้ไขจุดที่ 2: JOIN กับตาราง issue_types เพื่อเอาชื่อมาแสดง
      -- (สมมติว่าในตาราง issue_cases ชื่อคอลัมน์คือ issue_type ถ้าไม่ใช่ให้แก้เป็นชื่อจริง เช่น issue_type_id)
      LEFT JOIN issue_types it ON ic.issue_type = it.issue_id

      JOIN case_organizations co ON ic.issue_cases_id = co.case_id
      LEFT JOIN first_action_log fa ON ic.issue_cases_id = fa.case_id
      LEFT JOIN first_finish_log ff ON ic.issue_cases_id = ff.case_id
      
      WHERE 
        co.organization_id = ${organizationId}
        AND ic.status = 'เสร็จสิ้น' 
      ORDER BY total_hours DESC 
      LIMIT 10; 
    `;

    const formattedData = result.map(row => ({
      id: String(row.id).substring(0, 8),
      type: row.issue_type || 'ไม่ระบุ', // แสดงชื่อประเภทปัญหา (เช่น ไฟฟ้า)
      stage1: parseFloat(Math.max(0, parseFloat(row.stage1_hours || 0)).toFixed(2)),
      stage3: parseFloat(Math.max(0, parseFloat(row.stage3_hours || 0)).toFixed(2)),
      total: parseFloat(Math.max(0, parseFloat(row.total_hours || 0)).toFixed(2))
    }));

    return new Response(JSON.stringify(formattedData), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Efficiency API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}