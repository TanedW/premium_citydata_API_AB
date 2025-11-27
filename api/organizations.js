// /api/organizations.js
import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // เปลี่ยนเป็น URL ของคุณ
  'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS', // เพิ่ม PUT
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  // 1. Handle Preflight Request
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  // ---------------------------------------------------------
  // 2. POST: สร้างองค์กรใหม่ (Create)
  // ---------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      
      // Map ตัวแปรจาก Frontend ให้ตรงกับ Database
      const {
        organization_code,
        organization_name,
        admin_code,
        // รับค่าทั้งสองแบบเผื่อ Frontend ส่งมาต่างกัน
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

      // Validation
      if (!organization_code || !organization_name || !admin_code) {
        return new Response(JSON.stringify({
          message: 'Missing required fields: organization_code, organization_name, admin_code'
        }), { status: 400, headers: corsHeaders });
      }

      // Check duplicate
      const existingOrg = await sql`
        SELECT organization_code FROM organizations WHERE "organization_code" = ${organization_code}
      `;

      if (existingOrg.length > 0) {
        return new Response(JSON.stringify({ message: 'Organization code already exists' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Insert
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

    } catch (error) {
      console.error("POST Error:", error);
      return new Response(JSON.stringify({ message: 'Server Error', error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // ---------------------------------------------------------
  // 3. PUT: อัปเดตข้อมูลองค์กร (Update) -> เพิ่มส่วนนี้
  // ---------------------------------------------------------
  if (req.method === 'PUT') {
    try {
      const body = await req.json();
      const { organization_code } = body;

      if (!organization_code) {
        return new Response(JSON.stringify({ message: 'organization_code is required for update' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      // เตรียมข้อมูลสำหรับอัปเดต (ตรวจสอบว่ามีการส่งค่ามาหรือไม่ ถ้าไม่ส่งให้ข้าม)
      // ใช้ Logic แบบ Dynamic Update
      
      // Map ตัวแปรประเภท
      const org_type_id = body.org_type_id || body.org_type;
      const usage_type_id = body.usage_type_id || body.usage_type;

      // ตรวจสอบว่ามี Organization นี้อยู่จริงไหม
      const checkOrg = await sql`SELECT id FROM organizations WHERE organization_code = ${organization_code}`;
      if (checkOrg.length === 0) {
        return new Response(JSON.stringify({ message: 'Organization not found' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      // ทำการอัปเดต (แยก Query ตามกลุ่มข้อมูล หรือจะรวมก็ได้ แต่วิธีนี้ปลอดภัยสำหรับการส่ง Partial Data)
      // ใช้ COALESCE ใน SQL หรือ Logic JS เพื่ออัปเดตเฉพาะค่าที่ไม่ใช่ undefined
      
      const updatedOrg = await sql`
        UPDATE organizations SET
          organization_name = COALESCE(${body.organization_name || null}, organization_name),
          org_type_id = COALESCE(${org_type_id || null}, org_type_id),
          usage_type_id = COALESCE(${usage_type_id || null}, usage_type_id),
          url_logo = COALESCE(${body.url_logo || null}, url_logo),
          district = COALESCE(${body.district || null}, district),
          sub_district = COALESCE(${body.sub_district || null}, sub_district),
          contact_phone = COALESCE(${body.contact_phone || null}, contact_phone),
          province = COALESCE(${body.province || null}, province),
          latitude = COALESCE(${body.latitude || null}, latitude),
          longitude = COALESCE(${body.longitude || null}, longitude)
        WHERE organization_code = ${organization_code}
        RETURNING *;
      `;

      return new Response(JSON.stringify(updatedOrg[0]), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("PUT Error:", error);
      return new Response(JSON.stringify({ message: 'Update Failed', error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // Method Not Allowed
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
    status: 405,
    headers: corsHeaders
  });
}