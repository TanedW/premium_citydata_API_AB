// api/users_organizations
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

export default async function handler(req) {
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // --- GET Logic (เหมือนเดิม) ---
  if (req.method === 'GET') {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const requestUrl = new URL(req.url, `http://${req.headers.get('host')}`);
      const user_id = requestUrl.searchParams.get('user_id');
      const organization_code = requestUrl.searchParams.get('organization_code');

      let queryResult;

      if (user_id) {
        queryResult = await sql`SELECT * FROM view_user_org_details WHERE "user_id" = ${user_id};`;
      } else if (organization_code) {
        queryResult = await sql`SELECT * FROM view_user_org_details WHERE "organization_code" = ${organization_code};`;
      } else {
        return new Response(JSON.stringify({ message: 'Missing parameters' }), { 
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(queryResult), { 
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("API Error (GET):", error);
      return new Response(JSON.stringify({ message: 'Error', error: error.message }), { 
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- POST Logic (ส่วนที่แก้ไขเพื่อรองรับ Admin Code) ---
  if (req.method === 'POST') {
    
    let user_id;
    let sql;
    let currentProvider = null;

    try {
      const body = await req.json();
      user_id = body.user_id;
      // รับค่ามาเป็น input_code เพราะอาจจะเป็น org code หรือ admin code ก็ได้
      const input_code = body.organization_code; 

      if (!user_id || !input_code) {
        return new Response(JSON.stringify({ message: 'user_id and organization_code are required' }), { 
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      sql = neon(process.env.DATABASE_URL);

      // 1. ดึง Provider ล่าสุด (เหมือนเดิม)
      try {
        const lastLoginLog = await sql`
          SELECT provider FROM user_logs 
          WHERE "user_id" = ${user_id} AND "action_type" = 'LOGIN'
          ORDER BY "created_at" DESC LIMIT 1;
        `;
        if (lastLoginLog.length > 0) currentProvider = lastLoginLog[0].provider;
      } catch (e) { console.error("Log fetch error:", e); }


      // --- [NEW] 2. ตรวจสอบ Code กับตาราง Organizations เพื่อหา Role ---
      const orgCheck = await sql`
        SELECT organization_code, admin_code 
        FROM organizations 
        WHERE organization_code = ${input_code} OR admin_code = ${input_code}
        LIMIT 1;
      `;

      if (orgCheck.length === 0) {
        return new Response(JSON.stringify({ message: 'Invalid organization or admin code' }), { 
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const targetOrg = orgCheck[0];
      const realOrganizationCode = targetOrg.organization_code; // รหัสจริงที่จะบันทึก
      let assignedRole = 'member'; // Default เป็น Member

      // ตรวจสอบว่า Code ที่กรอกมา ตรงกับ admin_code หรือไม่
      if (targetOrg.admin_code && targetOrg.admin_code === input_code) {
        assignedRole = 'admin';
      }
      // -----------------------------------------------------------


      // 3. ตรวจสอบว่า User เคยผูกกับ Organization นี้แล้วหรือยัง (ใช้ realOrganizationCode)
      const existingLink = await sql`
        SELECT * FROM users_organizations 
        WHERE "user_id" = ${user_id} AND "organization_code" = ${realOrganizationCode}
      `;

      if (existingLink.length > 0) {
        return new Response(JSON.stringify({ message: 'User is already in this organization' }), { 
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        
        // 4. สร้างความสัมพันธ์ใหม่ พร้อมระบุ Role
        // หมายเหตุ: ตรวจสอบให้แน่ใจว่าตาราง users_organizations มี column 'role'
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
            status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
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
      
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, headers: corsHeaders 
  });
}