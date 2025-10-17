// /api/logout.js

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

// ฟังก์ชันสำหรับบันทึก Log (สามารถแยกไปไฟล์อื่นเพื่อใช้ซ้ำได้)
async function saveUserLog(sql, logData) {
  const { userId, actionType, provider, ipAddress, userAgent, status } = logData;
  try {
    await sql`
      INSERT INTO user_logs 
        (user_id, action_type, provider, ip_address, user_agent, status)
      VALUES
        (${userId}, ${actionType}, ${provider}, ${ipAddress}, ${userAgent}, ${status});
    `;
    console.log(`Log saved: User ${userId}, Action: ${actionType}`);
  } catch (logError) {
    console.error("--- LOGGING FAILED ---", {
      message: "Failed to save log",
      error: logError.message,
    });
  }
}

// ตั้งค่า CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <-- URL ของ React App
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handler หลักของ API
export default async function handler(req) {
  // ตอบกลับ CORS Preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'POST') {
    try {
      // 1. ดึง Access Token จาก Header 'Authorization'
      const authHeader = req.headers.get('authorization');
    //   if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //     return new Response(JSON.stringify({ message: 'Authorization header is missing or invalid' }), { status: 401, headers: corsHeaders });
    //   }
      const accessToken = authHeader.split(' ')[1];

      const sql = neon(process.env.DATABASE_URL);

      // 2. ค้นหาผู้ใช้จาก access_token เพื่อยืนยันตัวตนและหา user_id
      const userResult = await sql`SELECT user_id FROM users WHERE "access_token" = ${accessToken}`;
      
      if (userResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Invalid or expired token' }), { status: 401, headers: corsHeaders });
      }
      const userId = userResult[0].user_id;

      // 3. ดึงข้อมูลสำหรับบันทึก Log (IP Address และ User Agent)
      const forwarded = req.headers.get('x-forwarded-for');
      const ipAddress = forwarded ? forwarded.split(',')[0].trim() : null;
      const userAgent = req.headers.get('user-agent') || null;

      // 4. บันทึก Log การ Logout ลงฐานข้อมูล
      await saveUserLog(sql, {
        userId: userId,
        actionType: 'LOGOUT', // ระบุ Action Type เป็น 'LOGOUT'
        provider: null,       // ไม่จำเป็นต้องใช้ provider ตอน logout
        ipAddress: ipAddress,
        userAgent: userAgent,
        status: 'SUCCESS'
      });
      
      // 5. [ทางเลือก แนะนำอย่างยิ่ง] ทำให้ Token นี้ใช้ไม่ได้อีก (Invalidate Token)
      // โดยการลบค่า access_token ของผู้ใช้ออกจากฐานข้อมูล
    //   await sql`UPDATE users SET "access_token" = NULL WHERE "user_id" = ${userId}`;

      // 6. ส่งคำตอบกลับไปว่า Logout สำเร็จ
      return new Response(JSON.stringify({ message: 'Logout successful' }), { status: 200, headers: corsHeaders });

    } catch (error) {
      console.error("Logout API Error:", error);
      return new Response(JSON.stringify({ message: 'An error occurred during logout' }), { status: 500, headers: corsHeaders });
    }
  }

  // ตอบกลับหากใช้ Method อื่น
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { status: 405, headers: corsHeaders });
}