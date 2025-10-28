// /api/issue_cases.js

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
 * (แยกออกมาเพื่อความสะอาด)
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
 * (แยกออกมาเหมือนกับ saveLoginLog ของคุณ)
 */
async function saveCaseStatusLog(sql, logData) {
  const { caseId, newStatus, comment } = logData;
  try {
    // หมายเหตุ: เราไม่ได้ใส่ changed_by_user_id เพราะสคีมาของคุณไม่มี user_id ในเคส
    await sql`
      INSERT INTO case_status_logs 
        (case_id, old_status, new_status, comment)
      VALUES
        (${caseId}, NULL, ${newStatus}, ${comment});
    `;
  } catch (logError) {
    // ถ้าบันทึก log ไม่ได้ ก็แค่ log error ไว้ แต่ไม่ทำให้ API ล่ม
    console.error("Failed to save case status log:", logError.message);
  }
}


// The main API handler function
export default async function handler(req) {
  // --- 1. Respond to OPTIONS (Preflight) request ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // สร้างการเชื่อมต่อ DB
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
      
      // ส่งข้อมูลกลับไป (Status 200 OK)
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
    let body; // ประกาศไว้นอก try เพื่อใช้ใน catch
    
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
        tags
      } = body;
      
      // 3.2. ตรวจสอบข้อมูลจำเป็น
      if (!title || !issue_type_id || !latitude || !longitude) {
        return new Response(JSON.stringify({ message: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3.3. ตรรกะ "สุ่มแล้วเช็ก" (Random + Check)
      let newCase = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 5; // กัน Loop วิ่งไม่หยุด

      while (attempts < MAX_ATTEMPTS) {
        const caseCode = generateCaseCode(); // สุ่มรหัสใหม่
        
        try {
          // พยายาม INSERT
          const result = await sql`
            INSERT INTO issue_cases (
              case_code, title, description, cover_image_url, 
              issue_type_id, latitude, longitude, tags
            ) VALUES (
              ${caseCode}, ${title}, ${description}, ${cover_image_url}, 
              ${issue_type_id}, ${latitude}, ${longitude}, ${tags}
            )
            RETURNING *; -- ส่งข้อมูลเคสที่สร้างเสร็จกลับมา
          `;
          
          newCase = result[0];
          break; // ถ้าสำเร็จ ให้ออกจาก Loop

        } catch (err) {
          // ตรวจสอบว่า Error เกิดจาก 'unique constraint' (รหัสซ้ำ) หรือไม่
          // (ใน Vercel Edge การเช็ก err.message ปลอดภัยกว่า err.code)
          if (err.message && err.message.includes('unique constraint') && err.message.includes('issue_cases_case_code_key')) {
            // รหัสซ้ำจริง
            attempts++;
            console.warn(`Case code collision: ${caseCode}. Retrying...`);
            // Loop จะวนกลับไปสุ่มใหม่
          } else {
            // ถ้าเป็น Error อื่น (เช่น issue_type_id ผิด) ให้โยน Error ออกไปเลย
            throw err;
          }
        }
      } // จบ while loop

      // 3.4. ตรวจสอบผลลัพธ์
      if (newCase) {
        // --- สำเร็จ ---
        // 3.5. (สำคัญ) บันทึกประวัติการสร้างเคสใหม่ลงใน `case_status_logs`
        await saveCaseStatusLog(sql, {
          caseId: newCase.issue_cases_id,
          newStatus: newCase.status, // ดึงสถานะ default ('รอรับเรื่อง')
          comment: 'สร้างเคสใหม่'
        });
        
        // 3.6. ส่งเคสใหม่กลับไป (Status 201 Created)
        return new Response(JSON.stringify(newCase), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // --- ล้มเหลว (พยายาม 5 ครั้งแล้วยังซ้ำ) ---
        throw new Error(`Failed to generate unique case code after ${MAX_ATTEMPTS} attempts.`);
      }

    } catch (error) {
      // 3.7. จัดการ Error ทั้งหมด
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
