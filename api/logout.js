


// /api/logout.js

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

// --- Helper Function: บันทึก Log ---
async function saveUserLog(sql, logData) {
  const { userId, actionType, provider, ipAddress, userAgent, status } = logData;
  try {
    // เราใช้ user_id ที่ได้รับมา (ไม่ว่าจะเป็นจาก token หรือ body)
    await sql`
      INSERT INTO user_logs 
        (user_id, action_type, provider, ip_address, user_agent, status)
      VALUES
        (${userId}, ${actionType}, ${provider}, ${ipAddress}, ${userAgent}, ${status});
    `;
    console.log(`Log saved: User ${userId}, Action: ${actionType}, Status: ${status}`);
  } catch (logError) {
    console.error("--- LOGGING FAILED ---", {
      message: "Failed to save log",
      error: logError.message,
      data: logData, // Log ข้อมูลที่พยายามบันทึกไว้ด้วย
    });
    // ใน use case นี้ เราไม่ throw error ต่อ เพราะการ Log ล้มเหลว
    // ไม่ควรทำให้การ Logout หลัก (ฝั่ง Client) ล้มเหลวไปด้วย
  }
}

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <-- URL ของ React App
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // อนุญาตแค่ POST และ OPTIONS
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- Main API Handler ---
export default async function handler(req) {
  // 1. ตอบกลับ CORS Preflight (OPTIONS request)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 2. จัดการเฉพาะ POST request
  if (req.method === 'POST') {
    let logUserId = null;       // ID ที่จะใช้บันทึก Log (ได้มาจาก body)
    let logStatus = 'UNKNOWN';  // สถานะเริ่มต้น
    let officialUserId = null;  // ID ที่ยืนยันตัวตนผ่าน (ถ้ามี)

    // ดึงข้อมูลสำหรับ Log ไว้ก่อน (ทำนอก try...catch)
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0].trim() : null;
    const userAgent = req.headers.get('user-agent') || null;

    try {
      const sql = neon(process.env.DATABASE_URL);

      // 3. พยายามดึง user_id จาก body (ที่ส่งมาจาก React)
      // เราใช้ ID นี้ "เพื่อการบันทึก Log เท่านั้น"
      try {
        const body = await req.json();
        logUserId = body.user_id || null;
      } catch (bodyError) {
        // ถ้า Client ส่ง body มาไม่ถูกต้อง หรือไม่ส่งเลย
        console.warn("Could not parse body or missing user_id:", bodyError.message);
        logStatus = 'FAILED_MISSING_BODY';
        // (ทำงานต่อ เพราะเราอาจจะยังยืนยันตัวตนจาก Token ได้)
      }

      // 4. ดึง Access Token จาก Header
      const authHeader = req.headers.get('authorization');
      const accessToken = (authHeader && authHeader.startsWith('Bearer ')) 
        ? authHeader.split(' ')[1] 
        : null;

      // 5. พยายามยืนยันตัวตนด้วย Token
      if (accessToken) {
        const userResult = await sql`SELECT user_id FROM users WHERE "access_token" = ${accessToken}`;
        
        if (userResult.length > 0) {
          // 5.1 ยืนยันตัวตนสำเร็จ (Token ถูกต้อง)
          officialUserId = userResult[0].user_id;
          
          // ถ้า ID จาก Token ไม่ตรงกับ ID จาก body, ให้เชื่อ ID จาก Token
          if (logUserId !== officialUserId) {
             console.warn(`User ID mismatch: Body (${logUserId}) vs Token (${officialUserId}). Using Token ID.`);
             logUserId = officialUserId; 
          }

          logStatus = 'SUCCESS';
          
          // 5.2 ทำให้ Token นี้ใช้ไม่ได้อีก (Invalidate Token)
          // ทำอย่างปลอดภัย โดยเช็กว่า officialUserId มีค่าแน่นอน
          await sql`UPDATE users SET "access_token" = NULL WHERE "user_id" = ${officialUserId}`;
          
        } else {
          // 5.3 ยืนยันตัวตนล้มเหลว (Token ผิด / Stale Token)
          logStatus = 'FAILED_AUTH_TOKEN'; // Token ผิด, แต่เรายังรู้ว่าใครพยายาม (จาก body)
          // officialUserId ยังคงเป็น null
        }
      } else {
        // 5.4 ไม่ได้ส่ง Token มาเลย
        // ถ้า logStatus ยังไม่ถูกตั้งค่าเป็น FAILED_MISSING_BODY
        if (logStatus === 'UNKNOWN') {
           logStatus = 'FAILED_NO_TOKEN';
        }
      }

      // 6. บันทึก Log (ไม่ว่าผลจะเป็นยังไงก็ตาม)
      // เราจะ Log โดยใช้ logUserId (ที่ได้มาจาก body หรือ Token ที่ถูกต้อง)
      // ตราบใดที่ logUserId ไม่ใช่ null
      if (logUserId) {
        await saveUserLog(sql, {
          userId: logUserId,
          actionType: 'LOGOUT',
          provider: null,       // ไม่เกี่ยวข้องกับการ Logout
          ipAddress: ipAddress,
          userAgent: userAgent,
          status: logStatus // 'SUCCESS', 'FAILED_AUTH_TOKEN', 'FAILED_NO_TOKEN', 'FAILED_MISSING_BODY'
        });
      } else {
         console.warn("Cannot save log: No User ID provided from body or valid token.");
      }
      
      // 7. ส่งคำตอบกลับไปว่า Logout สำเร็จ
      // เราตอบ 200 OK เสมอ เพราะฝั่ง React ไม่สนผลลัพธ์อยู่แล้ว (มันอยู่ใน finally)
      return new Response(JSON.stringify({ message: 'Logout processed' }), { status: 200, headers: corsHeaders });

    } catch (error) {
      console.error("--- LOGOUT API CRITICAL ERROR ---", error);
      
      // [ทางเลือก] แม้จะเกิด Error หนักๆ (เช่น DB ต่อไม่ติด)
      // เราก็ยังพยายาม Log ครั้งสุดท้าย (ถ้ายังทำได้)
      // แต่ในที่นี้ เราจะแค่ตอบ Error 500 กลับไป
      
      // อย่าลืมแนบ CORS Headers ไปกับ Error Response ด้วย
      return new Response(JSON.stringify({ message: 'An internal error occurred' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  } 

  // 3. ตอบกลับหากใช้ Method อื่น
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
    status: 405, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  });
}