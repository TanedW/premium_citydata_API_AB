// /api/users.js

// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ตั้งค่า CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- [เพิ่มใหม่] ฟังก์ชันสำหรับบันทึก Log โดยเฉพาะ ---
// แยกเป็นฟังก์ชันเพื่อให้โค้ดหลักสะอาดและนำไปใช้ซ้ำได้ง่าย
async function saveLoginLog(sql, logData) {
  const { userId, provider, ipAddress, userAgent, status } = logData;
  try {
    await sql`
      INSERT INTO user_logs 
        (user_id, action_type, provider, ip_address, user_agent, status)
      VALUES
        (${userId}, 'LOGIN', ${provider}, ${ipAddress}, ${userAgent}, ${status});
    `;
  } catch (logError) {
    // หากการบันทึก log ผิดพลาด ให้แค่แสดง error ใน console
    // แต่ไม่ต้องทำให้ request หลักล่มไปด้วย
    console.error("Failed to save log:", logError);
  }
}

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'POST') {
    // --- [เพิ่มใหม่] ดึงข้อมูล IP และ User-Agent จาก Request ---
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0].trim() : null;
    
    const userAgent = req.headers.get('user-agent') || null; // .get() เป็นวิธีมาตรฐานของ Headers API
    
    let email, provider; // ประกาศตัวแปรไว้นอก try เพื่อใช้ใน catch ได้

    try {
      const body = await req.json();
      email = body.email;
      provider = body.provider;
      const { first_name, last_name, access_token } = body;
      
      const sql = neon(process.env.DATABASE_URL);

      const existingUser = await sql`SELECT * FROM users WHERE "email" = ${email}`;

      if (existingUser.length > 0) {
        // --- กรณีที่ 1: เจอผู้ใช้ ---
        const user = existingUser[0];
        const providerExists = user.providers && user.providers.includes(provider);

        const updatedUser = await sql`
            UPDATE users SET "access_token" = ${access_token}, "last_name" = ${last_name}, "first_name" = ${first_name},
              providers = CASE WHEN ${providerExists} = TRUE THEN providers ELSE array_append(providers, ${provider}) END
            WHERE "email" = ${email} RETURNING *;
          `;
        
        // --- [เพิ่มใหม่] บันทึก Log หลังจากอัปเดตสำเร็จ ---
        await saveLoginLog(sql, {
          userId: updatedUser[0].user_id,
          provider: provider,
          ipAddress: ipAddress,
          userAgent: userAgent,
          status: 'SUCCESS'
        });

        return new Response(JSON.stringify(updatedUser[0]), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else {
        // --- กรณีที่ 2: ไม่เจอผู้ใช้ -> สร้างใหม่ ---
        const newUser = await sql`
          INSERT INTO users ("email", "first_name", "last_name", "access_token", providers) 
          VALUES (${email}, ${first_name}, ${last_name}, ${access_token}, ARRAY[${provider}]) 
          RETURNING *;
        `;
        
        // --- [เพิ่มใหม่] บันทึก Log หลังจากสร้างผู้ใช้สำเร็จ ---
        await saveLoginLog(sql, {
          userId: newUser[0].user_id,
          provider: provider,
          ipAddress: ipAddress,
          userAgent: userAgent,
          status: 'SUCCESS'
        });

        return new Response(JSON.stringify(newUser[0]), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error("API Error:", error);

      // --- [เพิ่มใหม่] บันทึก Log กรณีเกิดข้อผิดพลาด ---
      // เราอาจจะยังไม่มี user_id แต่ยังสามารถบันทึกเหตุการณ์ที่ล้มเหลวได้
      const sql = neon(process.env.DATABASE_URL);
      await saveLoginLog(sql, {
        userId: null, // ไม่มี user_id เพราะการทำงานผิดพลาด
        provider: provider, // อาจจะได้ค่า provider จาก body ก่อนที่จะเกิด error
        ipAddress: ipAddress,
        userAgent: userAgent,
        status: 'FAILED'
      });

      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: corsHeaders 
      });
    }
  }

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}