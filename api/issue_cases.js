// /api/cases.js

// Use Vercel's Edge Runtime
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // URL ของ React App
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // อนุญาต GET และ POST
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
 * (ถูกเรียกใช้ภายใน Transaction)
 */
async function saveCaseStatusLog(sql, logData) {
  // changed_by_user_id เป็น integer ตามสคีมา
  const { caseId, newStatus, comment, userId } = logData; 
  try {
    await sql`
      INSERT INTO case_status_logs 
        (case_id, old_status, new_status, comment, changed_by_user_id)
      VALUES
        (${caseId}, NULL, ${newStatus}, ${comment}, ${userId});
    `;
  } catch (logError) {
    // ถ้าบันทึก log ไม่ได้ ก็แค่ log error ไว้ แต่ไม่ทำให้ API ล่ม
    // (แต่ถ้าอยู่ใน Transaction มันจะทำให้ Transaction ล่ม ซึ่งถูกต้องแล้ว)
    console.error("Failed to save case status log:", logError.message);
    // โยน Error ต่อเพื่อให้ Transaction รับรู้และ Rollback
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
    try {
      // ดึงเคส 50 รายการล่าสุด
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

  // --- 3. Main logic for HTTP POST (สร้างเคสใหม่ - แบบ All-in-One) ---
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
        media_files, // <-- (ใหม่!) Array ของไฟล์มีเดีย
        user_id      // <-- (ใหม่!) ID ของผู้ใช้ที่สร้าง (integer)
      } = body;
      
      // 3.2. ตรวจสอบข้อมูลจำเป็น
      // (สำคัญ!) เราเพิ่ม user_id เข้าไปในการตรวจสอบ
      if (!title || !issue_type_id || !latitude || !longitude || !user_id) {
        return new Response(JSON.stringify({ message: 'Missing required fields: title, issue_type_id, latitude, longitude, and user_id are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (typeof user_id !== 'number' || !Number.isInteger(user_id)) {
         return new Response(JSON.stringify({ message: 'Invalid user_id: Must be an integer.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3.3. ตรรกะ "สุ่มแล้วเช็ก" (Random + Check)
      let newCase = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 5;

      while (attempts < MAX_ATTEMPTS) {
        const caseCode = generateCaseCode();
        
        try {
          // 3.4. !!! เริ่ม Transaction (สำคัญที่สุด) !!!
          // ทำทุกอย่างในนี้ (สร้างเคส, บันทึกมีเดีย, บันทึก Log)
          const result = await sql.transaction(async (tx) => {
            
            // Step 1: สร้างเคสหลักใน `issue_cases`
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

            // Step 2: (ถ้ามี) บันทึกไฟล์มีเดียลงใน `case_media`
            if (media_files && media_files.length > 0) {
              
              // สร้าง Query สำหรับ media ทั้งหมด
              const mediaQueries = media_files.map(file => tx`
                INSERT INTO case_media (case_id, media_type, url)
                VALUES (${newCaseId}, ${file.media_type}, ${file.url})
              `);
              
              // รันทุก Query พร้อมกัน
              await Promise.all(mediaQueries);
            }

            // Step 3: บันทึกประวัติการสร้างลงใน `case_status_logs`
            await saveCaseStatusLog(tx, {
              caseId: newCaseId,
              newStatus: newCaseData.status, // ดึงสถานะ default ('รอรับเรื่อง')
              comment: 'สร้างเคสใหม่',
              userId: user_id // ส่ง user_id (integer) เข้าไป
            });

            // Step 4: ส่งข้อมูลเคสที่สร้างเสร็จ ออกจาก Transaction
            return newCaseData;
          });
          
          newCase = result;
          break; // ถ้า Transaction สำเร็จ ให้ออกจาก Loop

        } catch (err) {
          // ตรวจสอบว่า Error เกิดจาก 'unique constraint' (รหัสซ้ำ) หรือไม่
          if (err.message && err.message.includes('unique constraint') && err.message.includes('issue_cases_case_code_key')) {
            attempts++;
            console.warn(`Case code collision: ${caseCode}. Retrying...`);
            // Loop จะวนกลับไปสุ่มใหม่
          } else {
            // ถ้าเป็น Error อื่น (เช่น issue_type_id ผิด, หรือ log พัง) ให้โยน Error ออกไปเลย
            throw err;
          }
        }
      } // จบ while loop

      // 3.5. ตรวจสอบผลลัพธ์
      if (newCase) {
        // --- สำเร็จ ---
        return new Response(JSON.stringify(newCase), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // --- ล้มเหลว (พยายาม 5 ครั้งแล้วยังซ้ำ) ---
        throw new Error(`Failed to generate unique case code after ${MAX_ATTEMPTS} attempts.`);
      }

    } catch (error) {
      // 3.6. จัดการ Error ทั้งหมด
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