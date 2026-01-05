// api/stats/efficiency

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

    // --- OPTIMIZED QUERY ---
    // 1. ดึงเคสที่เกี่ยวข้องมาก่อน (Target Cases)
    // 2. ดึง Log ของเคสเหล่านั้น แล้ว Pivot เวลาทั้ง 3 ช่วงออกมาใน scan เดียว
    const result = await sql`
      WITH target_cases AS (
        SELECT 
          ic.issue_cases_id, 
          ic.title, 
          ic.created_at, 
          it.name as issue_type_name
        -- ✅ แก้ไข: เติม public. หน้า issue_cases, case_organizations, issue_types
        FROM public.issue_cases ic
        JOIN public.case_organizations co ON ic.issue_cases_id = co.case_id
        LEFT JOIN public.issue_types it ON ic.issue_type_id = it.issue_id
        WHERE 
          co.organization_id = ${organizationId}
          AND ic.status = 'เสร็จสิ้น'
      ),
      case_milestones AS (
        SELECT 
          tc.issue_cases_id,
          -- หาเวลา Action แรก (ที่ไม่ใช่ รอรับเรื่อง)
          MIN(cal.created_at) FILTER (WHERE cal.new_value NOT IN ('รอรับเรื่อง')) as action_time,
          -- หาเวลาเริ่มดำเนินการ
          MIN(cal.created_at) FILTER (WHERE cal.new_value = 'กำลังดำเนินการ') as process_time,
          -- หาเวลาเสร็จสิ้น
          MIN(cal.created_at) FILTER (WHERE cal.new_value = 'เสร็จสิ้น') as finish_time
        FROM target_cases tc
        -- ✅ แก้ไข: เติม public. หน้า case_activity_logs
        JOIN public.case_activity_logs cal ON tc.issue_cases_id = cal.case_id
        GROUP BY tc.issue_cases_id
      )
      SELECT 
        tc.title,
        tc.issue_type_name as issue_type,
        
        -- Stage 1: Response (Action Time - Created Time)
        EXTRACT(EPOCH FROM (COALESCE(cm.action_time, cm.process_time, cm.finish_time, NOW()) - tc.created_at)) / 3600 as stage1_hours,

        -- Stage 2: Coordination (Process Time - Action Time)
        CASE 
            WHEN cm.process_time IS NOT NULL AND cm.action_time IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (cm.process_time - cm.action_time)) / 3600
            WHEN cm.process_time IS NULL AND cm.finish_time IS NOT NULL AND cm.action_time IS NOT NULL
                THEN EXTRACT(EPOCH FROM (cm.finish_time - cm.action_time)) / 3600
            ELSE 0 
        END as stage2_hours,

        -- Stage 3: Execution (Finish Time - Process Time)
        CASE 
            WHEN cm.finish_time IS NOT NULL AND cm.process_time IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (cm.finish_time - cm.process_time)) / 3600
            ELSE 0 
        END as stage3_hours,

        -- Total Duration
        EXTRACT(EPOCH FROM (COALESCE(cm.finish_time, NOW()) - tc.created_at)) / 3600 as total_hours

      FROM target_cases tc
      JOIN case_milestones cm ON tc.issue_cases_id = cm.issue_cases_id
      ORDER BY total_hours DESC
      LIMIT 10;
    `;

    // Format Data (Logic เดิม แต่เอามาทำใน JS เพื่อลดภาระ DB ในการจัดการ string)
    const formattedData = result.map(row => {
      const rawTitle = row.title || 'ไม่มีหัวข้อ';
      const displayTitle = rawTitle.length > 20 ? rawTitle.substring(0, 20) + '...' : rawTitle;

      return {
        title: displayTitle,
        full_title: rawTitle,
        type: row.issue_type || 'ไม่ระบุ',
        // ใช้ Math.max(0, ...) เพื่อกันค่าติดลบกรณี timestamp ใน DB บันทึกสลับกัน
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