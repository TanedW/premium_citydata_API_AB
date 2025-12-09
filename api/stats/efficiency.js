// api/stats/efficiency.js

import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // หรือเปลี่ยนเป็น '*' หากต้องการทดสอบ
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // 1. Handle CORS Pre-flight request
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  
  // 2. Allow only GET
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    // 3. รับ Params organization_id
    const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
    const organizationId = searchParams.get('organization_id');

    if (!organizationId) {
      return new Response(JSON.stringify({ message: 'Missing organization_id' }), { status: 400, headers: corsHeaders });
    }

    // 4. SQL Query
    const result = await sql`
      WITH 
      -- CTE 1: หาเวลาเริ่ม "รับเรื่อง/ดำเนินการ" (First Action)
      first_action_log AS (
        SELECT 
          case_id, 
          MIN(created_at) as action_time 
        FROM case_activity_logs
        WHERE new_value IN ('รอรับเรื่อง') 
        GROUP BY case_id
      ),

      -- CTE 2: หาเวลา "เสร็จสิ้น" (First Finish)
      first_finish_log AS (
        SELECT 
          case_id, 
          MIN(created_at) as finish_time 
        FROM case_activity_logs
        WHERE new_value = 'เสร็จสิ้น'
        GROUP BY case_id
      )

      -- Main Query
      SELECT 
        ic.issue_cases_id as id,   -- ID หลักของเคส
        it.name as issue_type,     -- ชื่อประเภทปัญหา (จากตาราง issue_types)
        
        -- Stage 1: เวลาตั้งแต่ "แจ้ง" -> "เริ่มรับเรื่อง" (หน่วย: ชั่วโมง)
        EXTRACT(EPOCH FROM (COALESCE(fa.action_time, ff.finish_time, NOW()) - ic.created_at)) / 3600 as stage1_hours,

        -- Stage 3: เวลาตั้งแต่ "เริ่มรับเรื่อง" -> "เสร็จสิ้น" (หน่วย: ชั่วโมง)
        CASE 
            WHEN ff.finish_time IS NOT NULL AND fa.action_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ff.finish_time - fa.action_time)) / 3600
            ELSE 0 
        END as stage3_hours,

        -- Total: เวลารวมทั้งหมด (ใช้เรียงลำดับหาคอขวด)
        EXTRACT(EPOCH FROM (COALESCE(ff.finish_time, NOW()) - ic.created_at)) / 3600 as total_hours

      FROM issue_cases ic
      
      -- JOIN ตารางประเภทปัญหา (เพื่อเอาชื่อภาษาไทย)
      LEFT JOIN issue_types it ON ic.issue_type = it.issue_id

      -- JOIN ตารางองค์กร (เพื่อกรองตาม organization_id)
      JOIN case_organizations co ON ic.issue_cases_id = co.case_id
      
      -- JOIN Log ต่างๆ
      LEFT JOIN first_action_log fa ON ic.issue_cases_id = fa.case_id
      LEFT JOIN first_finish_log ff ON ic.issue_cases_id = ff.case_id
      
      WHERE 
        co.organization_id = ${organizationId}
        AND ic.status = 'เสร็จสิ้น' -- กรองเฉพาะงานที่จบแล้ว
      ORDER BY total_hours DESC     -- เรียงจากงานที่ช้าที่สุดก่อน
      LIMIT 10;                     -- เอาแค่ Top 10
    `;

    // 5. Format Data สำหรับส่งกลับไปที่ Frontend
    const formattedData = result.map(row => ({
      id: String(row.id).substring(0, 8),     // ตัด ID ให้สั้นลง
      type: row.issue_type || 'ไม่ระบุ',        // ชื่อประเภทปัญหา (เช่น 'ไฟฟ้า')
      
      // แปลงค่าเป็นทศนิยม 2 ตำแหน่ง และป้องกันค่าติดลบ
      stage1: parseFloat(Math.max(0, parseFloat(row.stage1_hours || 0)).toFixed(2)),
      stage3: parseFloat(Math.max(0, parseFloat(row.stage3_hours || 0)).toFixed(2)),
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