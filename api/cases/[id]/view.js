// /api/cases/[id]/view.js
// API นี้มีหน้าที่เดียว: "ปั๊มตราว่าอ่านแล้ว" (is_viewed = true)

// (!!! สำคัญ !!!)
// เราจะเก็บ 'edge' runtime ไว้
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // URL ของ React App
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS', // อนุญาต PATCH (สำหรับอัปเดต)
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};


// The main API handler function
export default async function handler(req) {
  // --- 1. Respond to OPTIONS (Preflight) request ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- 2. Main logic for HTTP PATCH (อัปเดต 'is_viewed') ---
  if (req.method === 'PATCH') {
    const sql = neon(process.env.DATABASE_URL);
    let body;

    try {
      // 2.1. ดึง ID ของเคส (UUID) จาก URL
      const url = new URL(req.url, `http://${req.headers.get('host')}`);
      const case_id = url.pathname.split('/')[3]; // เอา UUID ของเคสออกมา

      // 2.2. ดึง ID ของหน่วยงาน (Integer) จาก JSON Body
      body = await req.json();
      const { organization_id } = body;

      // 2.3. ตรวจสอบข้อมูล
      if (!case_id || !organization_id) {
        return new Response(JSON.stringify({ message: 'Missing required fields: case_id (from URL) and organization_id (from body) are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (typeof organization_id !== 'number' || !Number.isInteger(organization_id)) {
         return new Response(JSON.stringify({ message: 'Invalid organization_id: Must be an integer.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2.4. !!! คำสั่ง SQL (หัวใจสำคัญ) !!!
      // อัปเดตตาราง 'case_organizations'
      // โดยค้นหา "แถว" ที่ตรงกับเคสนี้ และ หน่วยงานนี้
      const results = await sql`
        UPDATE case_organizations
        SET 
          is_viewed = true
        WHERE 
          case_id = ${case_id} AND organization_id = ${organization_id}
        RETURNING *; 
      `;
      
      // 2.5. ตรวจสอบว่าอัปเดตสำเร็จหรือไม่
      if (results.length === 0) {
        // ถ้าไม่เจอแถวที่ตรงกัน (เช่น จ่ายงานผิดคน หรือเคสไม่มีอยู่จริง)
        return new Response(JSON.stringify({ message: 'Record not found. This case may not be assigned to this organization.' }), {
          status: 404, // 404 Not Found
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // 2.6. Transaction สำเร็จ
      return new Response(JSON.stringify(results[0]), { 
          status: 200, // 200 OK
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 2.7. จัดการ Error
      console.error("API Error (PATCH /view):", error);
      
      if (error.message && error.message.includes('violates foreign key constraint')) {
         return new Response(JSON.stringify({ 
          message: 'Invalid data. For example, case_id or organization_id does not exist.',
          error: error.message 
        }), { 
            status: 400, // 400 Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- 3. Handle any other HTTP methods ---
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}
