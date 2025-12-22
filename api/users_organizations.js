// api/users_organizations
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
    console.error("Failed to save log:", logError);
  }
}

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  
  // 1. Handle Preflight Request
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
        status: 200, 
        headers: corsHeaders 
    });
  }

  // 2. Handle GET Request (ดึงข้อมูล)
  if (req.method === 'GET') {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const requestUrl = new URL(req.url, `http://${req.headers.get('host')}`);
      const user_id = requestUrl.searchParams.get('user_id');
      const organization_code = requestUrl.search_params.get('organization_code');

      let queryResult;

      if (user_id) {
        queryResult = await sql`SELECT * FROM view_user_org_details WHERE "user_id" = ${user_id};`;
      } else if (organization_code) {
        queryResult = await sql`SELECT * FROM view_user_org_details WHERE "organization_code" = ${organization_code};`;
      } else {
        return new Response(JSON.stringify({ message: 'A query parameter (user_id or organization_code) is required' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

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

  // 3. Handle POST Request (เข้าร่วมองค์กร / Upgrade สิทธิ์)
  if (req.method === 'POST') {
    
    let user_id;
    let sql;
    let currentProvider = null;

    try {
      const body = await req.json();
      user_id = body.user_id;
      // รับค่า input_code ซึ่งอาจจะเป็น org code หรือ admin code ก็ได้
      const input_code = body.organization_code; 

      if (!user_id || !input_code) {
        return new Response(JSON.stringify({ message: 'user_id and organization_code are required' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      sql = neon(process.env.DATABASE_URL);

      // --- 3.1 ดึง Provider ล่าสุดเพื่อใช้เก็บ Log ---
      try {
        const lastLoginLog = await sql`
          SELECT provider 
          FROM user_logs 
          WHERE "user_id" = ${user_id} AND "action_type" = 'LOGIN'
          ORDER BY "created_at" DESC
          LIMIT 1;
        `;
        if (lastLoginLog.length > 0) {
          currentProvider = lastLoginLog[0].provider;
        }
      } catch (e) {
        console.error("Failed to fetch last provider from logs:", e);
      }

      // --- 3.2 ตรวจสอบ Code กับตาราง Organizations เพื่อหา Role ที่แท้จริง ---
      const orgCheck = await sql`
        SELECT organization_code, admin_code 
        FROM organizations 
        WHERE organization_code = ${input_code} OR admin_code = ${input_code}
        LIMIT 1;
      `;

      // ถ้าไม่พบรหัสนี้ในระบบเลย
      if (orgCheck.length === 0) {
        return new Response(JSON.stringify({ message: 'Invalid organization or admin code' }), { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const targetOrg = orgCheck[0];
      const realOrganizationCode = targetOrg.organization_code; // รหัสองค์กรที่ถูกต้อง (ไม่ใช่ admin code)
      
      // กำหนด Role เริ่มต้นเป็น 'member' (ตัวพิมพ์เล็ก)
      let assignedRole = 'member'; 

      // ถ้า Input ตรงกับ admin_code ให้เปลี่ยน Role เป็น 'admin'
      if (targetOrg.admin_code && targetOrg.admin_code === input_code) {
        assignedRole = 'admin';
      }

      // --- 3.3 ตรวจสอบสถานะปัจจุบันของ User ในองค์กรนี้ ---
      const existingLink = await sql`
        SELECT * FROM users_organizations 
        WHERE "user_id" = ${user_id} AND "organization_code" = ${realOrganizationCode}
      `;

      // --- กรณีที่ 1: User อยู่ในองค์กรนี้อยู่แล้ว ---
      if (existingLink.length > 0) {
        
        const currentRole = existingLink[0].role;

        // เช็คเงื่อนไขการ UPGRADE: 
        // ถ้าเดิมไม่ใช่ Admin แต่รอบนี้ได้สิทธิ์ Admin (เพราะกรอก Admin Code ถูก) -> ทำการอัปเกรด
        if (assignedRole === 'admin' && currentRole !== 'admin') {
            const updatedLink = await sql`
                UPDATE users_organizations
                SET role = 'admin'
                WHERE "user_id" = ${user_id} AND "organization_code" = ${realOrganizationCode}
                RETURNING *;
            `;

            // บันทึก Log Upgrade
            saveLoginLog(sql, {
                userId: user_id,
                provider: currentProvider,
                ipAddress: req.headers.get('x-forwarded-for') || null,
                userAgent: req.headers.get('user-agent') || null,
                status: 'UPGRADE_TO_ADMIN'
            });

            return new Response(JSON.stringify({ message: 'User upgraded to Admin', data: updatedLink[0] }), { 
                status: 200, // OK
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } 
        
        // ถ้าไม่ได้จะ Upgrade (เช่น เป็น Member แล้วใส่ code Member ซ้ำ หรือเป็น Admin อยู่แล้ว)
        return new Response(JSON.stringify({ message: 'User is already in this organization' }), { 
            status: 409, // Conflict
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else {
        // --- กรณีที่ 2: ยังไม่อยู่ในองค์กร -> เพิ่มใหม่ (INSERT) ---
        
        const newUserOrgLink = await sql`
          INSERT INTO users_organizations (user_id, organization_code, role) 
          VALUES (${user_id}, ${realOrganizationCode}, ${assignedRole}) 
          RETURNING *;
        `;
        
        // บันทึก Log Success
        saveLoginLog(sql, {
          userId: user_id,
          provider: currentProvider,
          ipAddress: req.headers.get('x-forwarded-for') || null,
          userAgent: req.headers.get('user-agent') || null,
          status: 'SUCCESS'
        });
        
        return new Response(JSON.stringify(newUserOrgLink[0]), { 
            status: 201, // Created
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      // กรณีเกิดข้อผิดพลาด (Failure)
      console.error("API Error (POST):", error);
      
      if (sql && user_id) {
          saveLoginLog(sql, {
              userId: user_id,
              provider: currentProvider,
              ipAddress: req.headers.get('x-forwarded-for') || null,
              userAgent: req.headers.get('user-agent') || null,
              status: 'FAILURE'
          });
      }
      
      // ตรวจสอบ error code เฉพาะของ PostgreSQL (เผื่อหลุดมา)
      if (error.code === '23503') { 
        return new Response(JSON.stringify({ message: 'Invalid user_id or organization_code' }), { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // Handle other methods
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}

