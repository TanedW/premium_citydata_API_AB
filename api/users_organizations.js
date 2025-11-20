
//api/users_organizations:

// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ตั้งค่า CORS Headers (สำคัญ: ต้องมี Authorization)
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * ฟังก์ชันสำหรับบันทึก Log การเข้าร่วมองค์กร
 */
async function saveLoginLog(sql, logData) {
  const { userId, provider, ipAddress, userAgent, status } = logData;
  try {
    await sql`
      INSERT INTO user_logs 
        (user_id, action_type, provider, ip_address, user_agent, status)
      VALUES
        (${userId}, 'JOIN ORGANIZATION', ${provider}, ${ipAddress}, ${userAgent}, ${status});
    `;
  } catch (logError) {
    // If logging fails, just log the error to the console
    // but do not crash the main API request.
    console.error("Failed to save log:", logError);
  }
}

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  
  // --- (ส่วนที่แก้ไขล่าสุด) ---
  // ตอบกลับ request แบบ 'OPTIONS' (Preflight)
  if (req.method === 'OPTIONS') {
    console.log("OPTIONS request received, sending 200 OK"); // <-- เพิ่ม Log
    return new Response(null, { 
        status: 200, // <-- เปลี่ยนเป็น 200
        headers: corsHeaders 
    });
  }
  // --- (จบส่วนที่แก้ไข) ---


  // --- Logic สำหรับ HTTP GET (เมื่อต้องการดึงข้อมูล) ---
  if (req.method === 'GET') {
    try {
      const sql = neon(process.env.DATABASE_URL);
      
      const requestUrl = new URL(req.url, `http://${req.headers.get('host')}`);
      const user_id = requestUrl.searchParams.get('user_id');
      const organization_code = requestUrl.searchParams.get('organization_code');

      let queryResult;

      if (user_id) {
        // Case 1: ค้นหาทุก organization ที่ user คนนี้อยู่
        queryResult = await sql`
          SELECT * FROM view_user_org_details WHERE "user_id" = ${user_id};
        `;
      } else if (organization_code) {
        // Case 2: ค้นหาทุก user ที่อยู่ใน organization นี้
        queryResult = await sql`
          SELECT * FROM view_user_org_details WHERE "organization_code" = ${organization_code};
        `;
      } else {
        // Case 3: ไม่ได้ระบุ parameter ที่ถูกต้อง
        return new Response(JSON.stringify({ message: 'A query parameter (user_id or organization_code) is required' }), { 
            status: 400, // Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ส่งข้อมูลที่ค้นหาเจอ (Status 200 OK)
      return new Response(JSON.stringify(queryResult), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("API Error (GET):", error);
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- Logic สำหรับ HTTP POST (เมื่อต้องการเชื่อม User กับ Organization) ---
  if (req.method === 'POST') {
    
    let user_id;
    let sql;
    let currentProvider = null; // <-- ค่าเริ่มต้นสำหรับ provider

    try {
      // 1. รับข้อมูล user_id และ organization_code จาก Frontend
      const body = await req.json();
      user_id = body.user_id;
      const { organization_code } = body;

      // ตรวจสอบว่าได้รับข้อมูลครบถ้วนหรือไม่
      if (!user_id || !organization_code) {
        return new Response(JSON.stringify({ message: 'user_id and organization_code are required' }), { 
            status: 400, // Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      sql = neon(process.env.DATABASE_URL);

      // --- 1.5 ดึง Provider ล่าสุดที่ใช้ Login จากตาราง logs ---
      try {
        const lastLoginLog = await sql`
          SELECT provider 
          FROM user_logs 
          WHERE "user_id" = ${user_id} AND "action_type" = 'LOGIN'
          ORDER BY "created_at" DESC
          LIMIT 1;
        `;
        
        if (lastLoginLog.length > 0) {
          currentProvider = lastLoginLog[0].provider; // <-- ได้ provider ที่ใช้ใน session นี้
        }
      } catch (e) {
        console.error("Failed to fetch last provider from logs:", e);
        // ไม่เป็นไร ถ้าหาไม่เจอ ก็ใช้ null (currentProvider) ทำต่อ
      }
      // --- จบส่วนดึง provider ---

      // 2. ตรวจสอบก่อนว่า User คนนี้เคยผูกกับ Organization นี้แล้วหรือยัง
      const existingLink = await sql`
        SELECT * FROM users_organizations 
        WHERE "user_id" = ${user_id} AND "organization_code" = ${organization_code}
      `;

      // 3. ถ้าเจอข้อมูลซ้ำ
      if (existingLink.length > 0) {
        return new Response(JSON.stringify({ message: 'User is already in this organization' }), { 
            status: 409, // Conflict
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // 4. ถ้าไม่ซ้ำ -> สร้างความสัมพันธ์ใหม่
        const newUserOrgLink = await sql`
          INSERT INTO users_organizations (user_id, organization_code) 
          VALUES (${user_id}, ${organization_code}) 
          RETURNING *;
        `;
        
        // --- บันทึก Log (Success) ---
        const logDataSuccess = {
          userId: user_id,
          provider: currentProvider,
          ipAddress: req.headers.get('x-forwarded-for') || null,
          userAgent: req.headers.get('user-agent') || null,
          status: 'SUCCESS'
        };
        saveLoginLog(sql, logDataSuccess);
        
        // ส่งข้อมูลใหม่กลับไป (Status 201 Created)
        return new Response(JSON.stringify(newUserOrgLink[0]), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      // กรณีเกิดข้อผิดพลาด
      console.error("API Error (POST):", error);
      
      // --- บันทึก Log (Failure) ---
      if (sql && user_id) {
          const logDataFailure = {
              userId: user_id,
              provider: currentProvider,
              ipAddress: req.headers.get('x-forwarded-for') || null,
              userAgent: req.headers.get('user-agent') || null,
              status: 'FAILURE'
          };
          saveLoginLog(sql, logDataFailure);
      }
      
      // ตรวจสอบ error code เฉพาะของ PostgreSQL
      if (error.code === '23503') { // Foreign Key Violation
        return new Response(JSON.stringify({ message: 'Invalid user_id or organization_code' }), { 
            status: 404, // Not Found
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // สำหรับ error อื่นๆ
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // หากมีการเรียกด้วย Method อื่น (เช่น PUT, DELETE)
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}
