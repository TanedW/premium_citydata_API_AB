// api/stats/efficiency.js

import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // หรือใส่ Domain ของคุณ
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');

    if (!organizationId) {
      return new Response(JSON.stringify({ message: 'Missing organization_id' }), { status: 400, headers: corsHeaders });
    }

    // 3. SQL Query แบบ 3 Stages
    // T0 = created_at (เวลาแจ้ง)
    // T1 = action_time (เวลาที่มีการขยับสถานะครั้งแรก เช่น รับเรื่อง, ส่งต่อ)
    // T2 = process_time (เวลาที่เปลี่ยนสถานะเป็น 'กำลังดำเนินการ')
    // T3 = finish_time (เวลาที่เปลี่ยนสถานะเป็น 'เสร็จสิ้น')

    const result = await sql`
      WITH 
      -- T1: การตอบสนองแรก (First Action) - หา Log แรกที่ไม่ใช่สถานะตั้งต้น
      first_action_log AS (
        SELECT 
          case_id, 
          MIN(created_at) as action_time 
        FROM case_activity_logs
        WHERE new_value NOT IN ('รอรับเรื่อง') -- นับทุกอย่างที่เป็นการตอบสนอง
        GROUP BY case_id
      ),

      -- T2: เริ่มลงมือทำ (Start Execution) - สถานะ 'กำลังดำเนินการ'
      start_process_log AS (
        SELECT 
          case_id, 
          MIN(created_at) as process_time 
        FROM case_activity_logs
        WHERE new_value = 'กำลังดำเนินการ'
        GROUP BY case_id
      ),

      -- T3: เสร็จสิ้น (Finished)
      finish_log AS (
        SELECT 
          case_id, 
          MIN(created_at) as finish_time 
        FROM case_activity_logs
        WHERE new_value = 'เสร็จสิ้น'
        GROUP BY case_id
      )

      -- Main Query
      SELECT 
        ic.issue_cases_id as id,
        it.name as issue_type,
        
        -- Stage 1: Response Time (T1 - T0)
        -- เวลาตั้งแต่ แจ้ง -> จนมีคนมากดรับ/ส่งต่อ
        EXTRACT(EPOCH FROM (
            COALESCE(fa.action_time, sp.process_time, ff.finish_time, NOW()) - ic.created_at
        )) / 3600 as stage1_hours,

        -- Stage 2: Coordination Time (T2 - T1)
        -- เวลาตั้งแต่ รับเรื่อง/ส่งต่อ -> จนช่างเริ่มลงมือทำ (กำลังดำเนินการ)
        -- กรณีไม่มี T2 (เช่น ส่งต่อแล้วจบเลย) จะข้ามไปนับ T3 แทน
        CASE 
            WHEN sp.process_time IS NOT NULL AND fa.action_time IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (sp.process_time - fa.action_time)) / 3600
            WHEN sp.process_time IS NULL AND ff.finish_time IS NOT NULL AND fa.action_time IS NOT NULL
                THEN EXTRACT(EPOCH FROM (ff.finish_time - fa.action_time)) / 3600 -- ถ้าไม่มีกำลังดำเนินการ ให้นับช่วงนี้เป็น Coord หรือ Execution รวมกัน
            ELSE 0 
        END as stage2_hours,

        -- Stage 3: Execution Time (T3 - T2)
        -- เวลาตั้งแต่ เริ่มลงมือทำ -> เสร็จสิ้น
        CASE 
            WHEN ff.finish_time IS NOT NULL AND sp.process_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ff.finish_time - sp.process_time)) / 3600
            ELSE 0 
        END as stage3_hours,

        -- Total Time (T3 - T0)
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

    // 4. Format Data
    const formattedData = result.map(row => ({
      id: String(row.id).substring(0, 8), 
      type: row.issue_type || 'ไม่ระบุ',
      
      stage1: parseFloat(Math.max(0, parseFloat(row.stage1_hours || 0)).toFixed(2)), // รอรับเรื่อง
      stage2: parseFloat(Math.max(0, parseFloat(row.stage2_hours || 0)).toFixed(2)), // ประสานงาน
      stage3: parseFloat(Math.max(0, parseFloat(row.stage3_hours || 0)).toFixed(2)), // ลงมือทำ
      
      total: parseFloat(Math.max(0, parseFloat(row.total_hours || 0)).toFixed(2))
    }));

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