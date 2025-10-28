// /api/cases.js

// Use Vercel's Edge Runtime
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

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
      
      // 3.3. สุ่มรหัสเคส (แค่ครั้งเดียว)
      const caseCode = generateCaseCode();
        
      // 3.4. !!! เริ่ม Transaction (หุ้มด้วย try...catch บล็อกเดียว) !!!
      const result = await sql.transaction(async (tx) => {
        
        // Step 1: สร้างเคสหลัก
        const insertedCase = await tx`
          INSERT INTO issue_cases (
            case_code, title, description, cover_image_url, 
            issue_type_id, latitude, longitude, tags
          ) VALUES (
            ${caseCode}, ${title}, ${description}, ${cover_image_url}, 
            ${issue_type_id}, ${latitude}, ${longitude}, ${tags}
          )
          RETURNING *;
        `;
        
        const newCaseData = insertedCase[0];
        const newCaseId = newCaseData.issue_cases_id;

        // Step 2: (ถ้ามี) บันทึกไฟล์มีเดีย
        if (media_files && media_files.length > 0) {
          for (const file of media_files) {
            await tx`
              INSERT INTO case_media (case_id, media_type, url)
              VALUES (${newCaseId}, ${file.media_type}, ${file.url})
            `;
          }
        }

        // Step 3: บันทึกประวัติการสร้าง
        // (เราต้อง try/catch ข้างในนี้เผื่อไว้ แต่ไม่ throw ต่อ)
        try {
          await tx`
            INSERT INTO case_status_logs 
              (case_id, old_status, new_status, comment, changed_by_user_id)
            VALUES
              (${newCaseId}, NULL, ${newCaseData.status}, 'สร้างเคสใหม่', ${validUserId});
          `;
        } catch (logError) {
           // ถ้า Log พัง ให้แค่ log ไว้ แต่อย่าทำให้ Transaction หลักล่ม
           console.error("Critical: Log saving failed but transaction continued:", logError.message);
        }

        // Step 4: ส่งข้อมูลเคสที่สร้างเสร็จ ออกจาก Transaction
        return newCaseData;
      });
          
      // 3.5. Transaction สำเร็จ
      return new Response(JSON.stringify(result), { 
          status: 201, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 3.6. !!! จัดการ Error (สำคัญมาก) !!!
      console.error("API Error (POST):", error);

      // (ใหม่!) ถ้า Error เพราะรหัสเคสซ้ำ (โอกาส 1 ในล้าน)
      if (error.message && error.message.includes('unique constraint') && error.message.includes('issue_cases_case_code_key')) {
        return new Response(JSON.stringify({ 
          message: 'Case code collision. Please try submitting again.',
          error: error.message 
        }), { 
            status: 409, // 409 Conflict
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ถ้า Error เพราะ Foreign Key (เช่น issue_type_id ผิด)
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
