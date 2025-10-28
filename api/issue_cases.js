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

/**
 * ฟังก์ชันสำหรับบันทึก Log การสร้างเคสใหม่
 */
async function saveCaseStatusLog(sql, logData) {
  // userId สามารถเป็น null ได้
  const { caseId, newStatus, comment, userId } = logData; 
  try {
    await sql`
      INSERT INTO case_status_logs 
        (case_id, old_status, new_status, comment, changed_by_user_id)
      VALUES
        (${caseId}, NULL, ${newStatus}, ${comment}, ${userId});
    `;
  } catch (logError) {
    console.error("Failed to save case status log:", logError.message);
    throw new Error(`Log saving failed: ${logError.message}`); 
  }
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
    // ... (ส่วนนี้เหมือนเดิมครับ) ...
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
        user_id // <-- (Optional) อาจจะเป็น null หรือ undefined
      } = body;
      
      // 3.2. ตรวจสอบข้อมูลจำเป็น
      // (!!! แก้ไข !!!) เอา user_id ออกจากช่องบังคับ
      if (!title || !issue_type_id || !latitude || !longitude) {
        return new Response(JSON.stringify({ message: 'Missing required fields: title, issue_type_id, latitude, and longitude are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // (!!! ใหม่ !!!) ตรวจสอบ user_id "ถ้ามี"
      let validUserId = null; // Default เป็น null
      if (user_id !== null && user_id !== undefined) {
        // ถ้ามี user_id ส่งมา แต่ไม่ใช่ตัวเลข
        if (typeof user_id !== 'number' || !Number.isInteger(user_id)) {
           return new Response(JSON.stringify({ message: 'Invalid user_id: If provided, must be an integer.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        validUserId = user_id; // ถ้าถูกต้อง ก็ใช้ค่านั้น
      }
      
      // 3.3. ตรรกะ "สุ่มแล้วเช็ก" ... (ส่วนนี้เหมือนเดิม) ...
      let newCase = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 5;

      while (attempts < MAX_ATTEMPTS) {
        const caseCode = generateCaseCode();
        
        try {
          // 3.4. !!! เริ่ม Transaction !!!
          const result = await sql.transaction(async (tx) => {
            
            // Step 1: สร้างเคสหลัก (เหมือนเดิม)
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

            // Step 2: บันทึกไฟล์มีเดีย (เหมือนเดิม)
            if (media_files && media_files.length > 0) {
              const mediaQueries = media_files.map(file => tx`
                INSERT INTO case_media (case_id, media_type, url)
                VALUES (${newCaseId}, ${file.media_type}, ${file.url})
              `);
              await Promise.all(mediaQueries);
            }

            // Step 3: (!!! แก้ไข !!!) บันทึกประวัติการสร้าง
            await saveCaseStatusLog(tx, {
              caseId: newCaseId,
              newStatus: newCaseData.status,
              comment: 'สร้างเคสใหม่',
              userId: validUserId // <-- (ใหม่!) ส่ง ID ที่ตรวจสอบแล้ว (ซึ่งอาจจะเป็น null)
            });

            return newCaseData;
          });
          
          newCase = result;
          break; 

        } catch (err) {
          // ... (ส่วน Error Handling เหมือนเดิม) ...
          if (err.message && err.message.includes('unique constraint') && err.message.includes('issue_cases_case_code_key')) {
            attempts++;
            console.warn(`Case code collision: ${caseCode}. Retrying...`);
          } else {
            throw err;
          }
        }
      } // จบ while loop

      // 3.5. ตรวจสอบผลลัพธ์ (เหมือนเดิม)
      if (newCase) {
        return new Response(JSON.stringify(newCase), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        throw new Error(`Failed to generate unique case code after ${MAX_ATTEMPTS} attempts.`);
      }

    } catch (error) {
      // 3.6. จัดการ Error ทั้งหมด (เหมือนเดิม)
      console.error("API Error (POST):", error);
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