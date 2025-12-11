// /api/organizations.js
import { neon } from '@neondatabase/serverless';

// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

// ตั้งค่า CORS Headers
const corsHeaders = {
  // **สำคัญ:** อย่าลืมเปลี่ยนเป็น URL ของ React App ของคุณ หรือใช้ '*' เพื่อทดสอบชั่วคราว
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', 
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  // 1. ตอบกลับ request แบบ 'OPTIONS' (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // =========================================================
    // SECTION 0: GET -> ดึงข้อมูลองค์กร (พร้อม DEBUG MODE)
    // =========================================================
    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url);

      // -------------------------------------------------------
      // 🛠️ DEBUG MODE START: ตรวจสอบ Database Schema
      // วิธีใช้: เรียก URL /api/organizations?check_db_type=true
      // -------------------------------------------------------
      if (searchParams.get('check_db_type') === 'true') {
        try {
          // 1. เช็ค Data Type ของ column 'organization_id'
          const typeCheck = await sql`
            SELECT table_name, column_name, data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = 'organizations'
            AND column_name = 'organization_id';
          `;
          
          // 2. เช็คชื่อ Database ที่กำลังเชื่อมต่ออยู่
          const dbInfo = await sql`SELECT current_database(), current_user;`;

          return new Response(JSON.stringify({
            message: "DEBUG INFO",
            connected_database: dbInfo[0],
            column_schema: typeCheck
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (dbError) {
           return new Response(JSON.stringify({ message: "Debug Error", error: dbError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      // -------------------------------------------------------
      // 🛠️ DEBUG MODE END
      // -------------------------------------------------------

      const id = searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ message: 'Organization ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Query ข้อมูลจาก DB
      const data = await sql`
        SELECT * FROM organizations WHERE organization_id = ${id}
      `;

      if (data.length === 0) {
        return new Response(JSON.stringify({ message: 'Organization not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ส่งข้อมูลกลับ (รายการแรก)
      return new Response(JSON.stringify(data[0]), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // =========================================================
    // SECTION 1: POST -> สร้างองค์กรใหม่
    // =========================================================
    if (req.method === 'POST') {
      const body = await req.json();

      const {
        organization_code,
        organization_name,
        admin_code,
        org_type_id = body.org_type || null,
        usage_type_id = body.usage_type || null,
        url_logo,
        district,
        sub_district,
        contact_phone,
        province,
        latitude,
        longitude
      } = body;

      if (!organization_code || !organization_name || !admin_code) {
        return new Response(JSON.stringify({
          message: 'Missing required fields: organization_code, organization_name, admin_code'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const existingOrg = await sql`
        SELECT organization_code FROM organizations WHERE "organization_code" = ${organization_code}
      `;

      if (existingOrg.length > 0) {
        return new Response(JSON.stringify({ message: 'Organization code already exists' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const newOrg = await sql`
        INSERT INTO organizations (
          organization_code, organization_name, admin_code, 
          org_type_id, usage_type_id, url_logo,
          district, sub_district, contact_phone, province,
          latitude, longitude
        ) 
        VALUES (
          ${organization_code}, ${organization_name}, ${admin_code}, 
          ${org_type_id}, ${usage_type_id}, ${url_logo || null},
          ${district || null}, ${sub_district || null}, ${contact_phone || null}, ${province || null},
          ${latitude || null}, ${longitude || null}
        ) 
        RETURNING *; 
      `;

      return new Response(JSON.stringify(newOrg[0]), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // =========================================================
    // SECTION 2: PUT -> แก้ไขข้อมูล
    // =========================================================
    if (req.method === 'PUT') {
      const body = await req.json();
      const { organization_id } = body; 

      if (!organization_id) {
        return new Response(JSON.stringify({ message: 'organization_id is required for update' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const org_type_id = body.org_type_id || body.org_type;
      const usage_type_id = body.usage_type_id || body.usage_type;

      // ตรวจสอบว่ามี ID นี้หรือไม่
      const checkOrg = await sql`
        SELECT organization_id FROM organizations WHERE organization_id = ${organization_id}
      `;
      
      if (checkOrg.length === 0) {
        return new Response(JSON.stringify({ message: 'Organization ID not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // อัปเดตข้อมูล
      const updatedOrg = await sql`
        UPDATE organizations SET
          organization_name = COALESCE(${body.organization_name || null}, organization_name),
          org_type_id       = COALESCE(${org_type_id || null}, org_type_id),
          usage_type_id     = COALESCE(${usage_type_id || null}, usage_type_id),
          url_logo          = COALESCE(${body.url_logo || null}, url_logo),
          district          = COALESCE(${body.district || null}, district),
          sub_district      = COALESCE(${body.sub_district || null}, sub_district),
          contact_phone     = COALESCE(${body.contact_phone || null}, contact_phone),
          province          = COALESCE(${body.province || null}, province),
          latitude          = COALESCE(${body.latitude || null}, latitude),
          longitude         = COALESCE(${body.longitude || null}, longitude)
        WHERE organization_id = ${organization_id}
        RETURNING *;
      `;

      return new Response(JSON.stringify(updatedOrg[0]), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
      status: 405,
      headers: corsHeaders
    });

  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ message: 'Internal Server Error', error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}