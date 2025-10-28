// /api/cases.js

// (!!! สำคัญ !!!)
// เราจะเก็บ 'edge' runtime ไว้
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';
// (!!! สำคัญ !!!)
// เราได้ลบบรรทัด 'import { crypto } from 'node:crypto';' ทิ้งไปแล้ว
// เพราะ 'crypto' มีอยู่แล้วใน Vercel Edge Runtime

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // URL ของ React App
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * ฟังก์ชันสำหรับสุ่มรหัสเคส (YYYY-NNNAAA)
 */
function generateCaseCode() {
  const year = new Date().getFullYear();
  
  const randomDigits = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomLetters = '';
  for (let i = 0; i < 3; i++) {
    randomLetters += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return `${year}-${randomDigits}${randomLetters}`;
}

// The main API handler function
export default async function handler(req) {
  // --- 1. Respond to OPTIONS (Preflight) request ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  // --- 2. Main logic for HTTP GET (ดึงเคสทั้งหมด) ---
  if (req.method === 'GET') {
    try {
      const cases = await sql`
        SELECT * FROM issue_cases 
        ORDER BY created_at DESC 
        LIMIT 50;
      `;
      return new Response(JSON.stringify(cases), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("API Error (GET):", error);
      return new Response(JSON.stringify({ message: 'Database query failed', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- 3. Main logic for HTTP POST (สร้างเคสใหม่) ---
  if (req.method === 'POST') {
    let body; 
    
    try {
      // 3.1. ดึงข้อมูลที่ส่งมาจาก Frontend
      body = await req.json();
      const {
        title,
        description,
        cover_image_url,
        issue_type_id,
        latitude,
        longitude,
        tags,
        media_files,
        user_id // (Optional)
      } = body;
      
      // 3.2. ตรวจสอบข้อมูลจำเป็น
      if (!title || !issue_type_id || !latitude || !longitude) {
        return new Response(JSON.stringify({ message: 'Missing required fields: title, issue_type_id, latitude, and longitude are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      let validUserId = null; 
      if (user_id !== null && user_id !== undefined) {
        if (typeof user_id !== 'number' || !Number.isInteger(user_id)) {
           return new Response(JSON.stringify({ message: 'Invalid user_id: If provided, must be an integer.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        validUserId = user_id;
      }
      
      // 3.3. (!!! หัวใจสำคัญ !!!)
      // สร้าง ID ทั้งหมดขึ้นมาก่อน
      // 'crypto' จะถูกดึงมาจาก Global Scope ของ Vercel Edge (ไม่ต้อง import)
      const newCaseId = crypto.randomUUID(); 
      const caseCode = generateCaseCode();
        
      // 3.4. สร้าง "Array" ของ Queries
      const queries = [];

      // Step 1: Query สร้างเคสหลัก
      queries.push(sql`
        INSERT INTO issue_cases (
          issue_cases_id, 
          case_code, 
          title, 
          description, 
          cover_image_url, 
          issue_type_id, 
          latitude, 
          longitude, 
          tags
        ) VALUES (
          ${newCaseId}, 
          ${caseCode}, 
          ${title}, 
          ${description}, 
          ${cover_image_url}, 
          ${issue_type_id}, 
          ${latitude}, 
          ${longitude}, 
          ${tags}
        )
        RETURNING *;
      `);

      // Step 2: (ถ้ามี) Query สร้างไฟล์มีเดีย
      if (media_files && media_files.length > 0) {
        for (const file of media_files) {
          queries.push(sql`
            INSERT INTO case_media (case_id, media_type, url)
            VALUES (${newCaseId}, ${file.media_type}, ${file.url})
          `);
        }
      }

      // Step 3: Query สร้างประวัติ
      queries.push(sql`
        INSERT INTO case_status_logs 
          (case_id, old_status, new_status, comment, changed_by_user_id)
        VALUES
          (${newCaseId}, NULL, 'รอรับเรื่อง', 'สร้างเคสใหม่', ${validUserId});
      `);
      
      // 3.5. !!! รัน Transaction (แบบ Array) !!!
      const results = await sql.transaction(queries);
          
      // 3.6. Transaction สำเร็จ
      const newCase = results[0]; 
      
      return new Response(JSON.stringify(newCase), { 
          status: 201, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 3.7. จัดการ Error
      console.error("API Error (POST):", error);

      // (เช็ก Error ที่พบบ่อย)
      if (error.message && error.message.includes('unique constraint') && error.message.includes('issue_cases_case_code_key')) {
        return new Response(JSON.stringify({ 
          message: 'Case code collision. Please try submitting again.',
          error: error.message 
        }), { 
            status: 409, // 409 Conflict
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (error.message && error.message.includes('violates foreign key constraint')) {
         return new Response(JSON.stringify({ 
          message: 'Invalid data. For example, issue_type_id or user_id does not exist.',
          error: error.message 
        }), { 
            status: 400, // 400 Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Error อื่นๆ
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- 4. Handle any other HTTP methods ---
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}
