//api/user_logs:


import { neon } from '@neondatabase/serverless';

// (!!! สำคัญ !!!)
// 1. กำหนดให้ API นี้ทำงานบน Edge Runtime (เหมือนเดิม)
export const config = {
  runtime: 'edge',
};

// 2. (Optional) กำหนด CORS Headers
//    (!!! เปลี่ยน !!!) เพิ่ม 'POST' ใน Allow-Methods
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // หรือ 'https://your-frontend-app.vercel.app'
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // <-- เพิ่ม POST
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 3. The main API handler function
export default async function handler(req) {
  
  // --- 3.1. ตอบกลับ OPTIONS (Preflight) request สำหรับ CORS (เหมือนเดิม) ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- 3.2. (!!! เปลี่ยน !!!) จำกัดให้รับเฉพาะ POST method ---
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // 4. เชื่อมต่อ DB (เหมือนเดิม)
    const sql = neon(process.env.DATABASE_URL); 

    // --- 5. (!!! เปลี่ยน !!!) ดึงข้อมูลจาก Body และ Headers ---

    // 5.1 ดึง IP Address ของผู้ใช้จาก Headers
    const ip_address = (req.headers.get('x-forwarded-for') || 'unknown').split(',').shift().trim();

    // 5.2 ดึงข้อมูล Log ที่ React ส่งมา (จาก req.json())
    const { user_id, action_type, provider, user_agent, status, details } = await req.json();

    // 5.3 (Optional) ตรวจสอบข้อมูลขั้นพื้นฐาน
    if (!user_id) {
        return new Response(JSON.stringify({ message: 'user_id is required' }), { 
            status: 400, // Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // --- 6. (!!! เปลี่ยน !!!) Query ข้อมูลด้วย INSERT ---
    //    (log_id และ created_at ฐานข้อมูลควรใส่ให้เองอัตโนมัติ)
    const query = sql`
      INSERT INTO user_logs (
        user_id, 
        action_type, 
        provider, 
        ip_address, 
        user_agent, 
        status, 
        details 
      ) VALUES (
        ${user_id}, 
        ${action_type}, 
        ${provider}, 
        ${ip_address}, 
        ${user_agent}, 
        ${status}, 
        ${details}
      );
    `;
    
    // 6.1 รัน query (INSERT ไม่จำเป็นต้องรับค่า rows กลับมา)
    await query;

    // --- 7. (!!! เปลี่ยน !!!) ส่ง Response ว่าสำเร็จ ---
    return new Response(JSON.stringify({ message: 'Log saved successfully' }), { 
        status: 201, // 201 Created (เหมาะสมกว่า 200)
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // 8. การจัดการ Error (เหมือนเดิม)
    console.error('API Error (user_logs):', error);
    return new Response(JSON.stringify({ message: 'Failed to save log', error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}