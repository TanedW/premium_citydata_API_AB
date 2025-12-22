// ไฟล์: /api/usage-types.js

import { neon } from '@neondatabase/serverless';

// 1. กำหนดให้ API นี้ทำงานบน Edge Runtime
export const config = {
  runtime: 'edge',
};

// 2. (Optional) กำหนด CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // หรือ 'https://your-frontend-app.vercel.app'
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 3. The main API handler function
export default async function handler(req) {
  
  // --- 3.1. ตอบกลับ OPTIONS (Preflight) request สำหรับ CORS ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- 3.2. จำกัดให้รับเฉพาะ GET method ---
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // 4. (!!! เปลี่ยน !!!)
    //    ใช้ 'DATABASE_URL' ที่ Vercel-Neon Integration ใส่ให้
    const sql = neon(process.env.DATABASE_URL); 

    // 5. (!!! เปลี่ยน !!!)
    //    Query ข้อมูลจากตาราง usage_types
    const query = sql`
      SELECT 
        usage_type_id AS value, 
        type_label AS label 
      FROM usage_types 
      ORDER BY type_label;
    `;
    
    const rows = await query;

    // 6. (!!! เปลี่ยน !!!)
    //    ส่งข้อมูลกลับด้วย 'new Response()'
    return new Response(JSON.stringify(rows), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Error (usage-types):', error);
    return new Response(JSON.stringify({ message: 'Database query failed', error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
