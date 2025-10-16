// api/users.js (หรือไฟล์ API ของคุณ)

export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// (ส่วนของ CORS ควรมีอยู่เหมือนเดิม)
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <--- URL ของ React App ของคุณ
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // ตอบกลับ preflight request ของ CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ... (โค้ดสำหรับ GET method สามารถคงไว้เหมือนเดิม) ...

  // --- Logic ใหม่ทั้งหมดสำหรับ POST Method ---
  if (req.method === 'POST') {
    try {
      // 1. รับข้อมูลจาก Frontend
      const { email, first_name, last_name, provider, access_token } = await req.json();
      const sql = neon(process.env.DATABASE_URL);

      // 2. ค้นหาผู้ใช้ด้วยอีเมลที่ได้รับมา
      const existingUser = await sql`SELECT * FROM users WHERE "email" = ${email}`;

      // 3. ตรวจสอบว่ามีผู้ใช้นี้ในระบบแล้วหรือไม่
      if (existingUser.length > 0) {
        // ---> กรณีที่ 1: มีผู้ใช้ในระบบแล้ว (อีเมลซ้ำ)
        console.log(`email ${email} exists. Linking account.`);
        const user = existingUser[0];

        // ตรวจสอบว่า provider ใหม่นี้เคยเชื่อมต่อแล้วหรือยัง
        const providerExists = user.providers && user.providers.includes(provider);

        let updatedUser;
        if (providerExists) {
          // ถ้าเคยเชื่อมแล้ว อัปเดตแค่ Access Token ล่าสุด
          updatedUser = await sql`
            UPDATE users 
            SET "access_token" = ${access_token}, "last_name" = ${last_name}, "first_name" = ${first_name} 
            WHERE "email" = ${email} 
            RETURNING *;
          `;
        } else {
          // ถ้าเป็น provider ใหม่ ให้เพิ่มเข้าไปใน array
          updatedUser = await sql`
            UPDATE users 
            SET 
              "access_token" = ${access_token}, 
              "last_name" = ${last_name}, 
              "first_name" = ${first_name},
              providers = array_append(providers, ${provider}) 
            WHERE "email" = ${email} 
            RETURNING *;
          `;
        }
        
        // ส่งข้อมูลผู้ใช้ที่อัปเดตแล้วกลับไป
        return new Response(JSON.stringify(updatedUser[0]), { 
            status: 200, // ส่ง 200 OK แทน 201 Created
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else {
        // ---> กรณีที่ 2: ยังไม่มีผู้ใช้ในระบบ (New User)
        console.log(`email ${email} not found. Creating new user.`);
        const newUser = await sql`
          INSERT INTO users ("email", "first_name", "last_name", "provider", "access_token", providers) 
          VALUES (${email}, ${first_name}, ${last_name}, ${provider}, ${access_token}, ARRAY[${provider}]) 
          RETURNING *;
        `;
        
        // ส่งข้อมูลผู้ใช้ใหม่กลับไป
        return new Response(JSON.stringify(newUser[0]), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error("API Error:", error);
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { status: 405, headers: corsHeaders });
}