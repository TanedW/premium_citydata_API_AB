import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', 
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
      -- T1: Response (ตอบสนองแรก)
      first_action_log AS (
        SELECT case_id, MIN(created_at) as action_time 
        FROM case_activity_logs
        WHERE new_value NOT IN ('รอรับเรื่อง') 
        GROUP BY case_id
      ),
      -- T2: Coordination (เริ่มดำเนินการ)
      start_process_log AS (
        SELECT case_id, MIN(created_at) as process_time 
        FROM case_activity_logs
        WHERE new_value = 'กำลังดำเนินการ'
        GROUP BY case_id
      ),
      -- T3: Execution (เสร็จสิ้น)
      finish_log AS (
        SELECT case_id, MIN(created_at) as finish_time 
        FROM case_activity_logs
        WHERE new_value = 'เสร็จสิ้น'
        GROUP BY case_id
      )

      SELECT 
        ic.title, -- <--- 🔴 เปลี่ยนจาก ID เป็น Title ตรงนี้
        it.name as issue_type,
        
        -- Stage 1: Response
        EXTRACT(EPOCH FROM (COALESCE(fa.action_time, sp.process_time, ff.finish_time, NOW()) - ic.created_at)) / 3600 as stage1_hours,

        -- Stage 2: Coordination
        CASE 
            WHEN sp.process_time IS NOT NULL AND fa.action_time IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (sp.process_time - fa.action_time)) / 3600
            WHEN sp.process_time IS NULL AND ff.finish_time IS NOT NULL AND fa.action_time IS NOT NULL
                THEN EXTRACT(EPOCH FROM (ff.finish_time - fa.action_time)) / 3600
            ELSE 0 
        END as stage2_hours,

        -- Stage 3: Execution
        CASE 
            WHEN ff.finish_time IS NOT NULL AND sp.process_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ff.finish_time - sp.process_time)) / 3600
            ELSE 0 
        END as stage3_hours,

        -- Total
        EXTRACT(EPOCH FROM (COALESCE(ff.finish_time, NOW()) - ic.created_at)) / 3600 as total_hours

      FROM issue_cases ic
      LEFT JOIN issue_types it ON ic.issue_type_id = it.issue_id
      JOIN case_organizations co ON ic.issue_cases_id = co.case_id
      
      LEFT JOIN first_action_log fa ON ic.issue_cases_id = fa.case_id
      LEFT JOIN start_process_log sp ON ic.issue_cases_id = sp.case_id
      LEFT JOIN finish_log ff ON ic.issue_cases_id = ff.case_id
      
      WHERE 
        co.organization_id = ${organizationId}
        AND ic.status = 'เสร็จสิ้น' 
      ORDER BY total_hours DESC 
      LIMIT 10; 
    `;

    // Format Data
    const formattedData = result.map(row => {
      // ตัดคำ Title ให้ไม่ยาวเกินไปสำหรับกราฟ (เช่น ไม่เกิน 20 ตัวอักษร)
      const rawTitle = row.title || 'ไม่มีหัวข้อ';
      const displayTitle = rawTitle.length > 20 ? rawTitle.substring(0, 20) + '...' : rawTitle;

      return {
        title: displayTitle,    // <--- ส่ง title กลับไปแสดงผล
        full_title: rawTitle,   // (เผื่อใช้ใน Tooltip)
        type: row.issue_type || 'ไม่ระบุ',
        
        stage1: parseFloat(Math.max(0, parseFloat(row.stage1_hours || 0)).toFixed(2)),
        stage2: parseFloat(Math.max(0, parseFloat(row.stage2_hours || 0)).toFixed(2)),
        stage3: parseFloat(Math.max(0, parseFloat(row.stage3_hours || 0)).toFixed(2)),
        total: parseFloat(Math.max(0, parseFloat(row.total_hours || 0)).toFixed(2))
      };
    });

    return new Response(JSON.stringify(formattedData), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error("Efficiency API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}