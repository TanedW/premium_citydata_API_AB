// /api/organizations.js
import { neon } from '@neondatabase/serverless';

// แนะนำให้ใช้ Edge Runtime ของ Vercel เพื่อประสิทธิภาพสูงสุด
export const config = {
  runtime: 'edge',
};

// ตั้งค่า CORS Headers
const corsHeaders = {
  // **สำคัญ:** อย่าลืมเปลี่ยนเป็น URL ของ React App ของคุณ
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS', // อนุญาต POST และ PUT
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ฟังก์ชันหลักของ API
export default async function handler(req) {
  // 1. ตอบกลับ request แบบ 'OPTIONS' (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  // =========================================================
  // SECTION 1: POST -> สร้างองค์กรใหม่
  // =========================================================
  if (req.method === 'POST') {
    try {
      const body = await req.json();

      // Map ข้อมูลจาก Frontend ให้ตรงกับ Database
      const {
        organization_code,
        organization_name,
        admin_code,
        // รับค่าได้ทั้ง key ที่มี _id หรือไม่มี (เผื่อ Frontend ส่งมาแบบเก่า)
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

      // Validation: ตรวจสอบค่าบังคับ
      if (!organization_code || !organization_name || !admin_code) {
        return new Response(JSON.stringify({
          message: 'Missing required fields: organization_code, organization_name, admin_code'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check Duplicate: เช็คว่ารหัสองค์กรซ้ำหรือไม่ (ยังคงต้องเช็คแม้ไม่ใช่ PK)
      const existingOrg = await sql`
        SELECT organization_code FROM organizations WHERE "organization_code" = ${organization_code}
      `;

      if (existingOrg.length > 0) {
        return new Response(JSON.stringify({ message: 'Organization code already exists' }), {
          status: 409, // 409 Conflict
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Insert Data
      // หมายเหตุ: ไม่ต้องใส่ organization_id ใน VALUES เพราะ DB จะรันเลขให้เอง (SERIAL/IDENTITY)
      const newOrg = await sql`
        INSERT INTO organizations (
          organization_code, 
          organization_name,
          admin_code, 
          org_type_id,
          usage_type_id,
          url_logo,
          district,
          sub_district,
          contact_phone,
          province,
          latitude,  
          longitude
        ) 
        VALUES (
          ${organization_code}, 
          ${organization_name},
          ${admin_code}, 
          ${org_type_id},
          ${usage_type_id},
          ${url_logo || null},
          ${district || null},
          ${sub_district || null},
          ${contact_phone || null},
          ${province || null},
          ${latitude || null},
          ${longitude || null}
        ) 
        RETURNING *; 
      `;
      // RETURNING * จะส่งข้อมูลกลับมา รวมถึง 'organization_id' ที่เพิ่งสร้างด้วย

      return new Response(JSON.stringify(newOrg[0]), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("POST Error:", error);
      return new Response(JSON.stringify({ message: 'Create Failed', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // =========================================================
  // SECTION 2: PUT -> แก้ไขข้อมูล (โดยใช้ organization_id)
  // =========================================================
  if (req.method === 'PUT') {
    try {
      const body = await req.json();
      
      // รับค่า Primary Key
      const { organization_id } = body; 

      if (!organization_id) {
        return new Response(JSON.stringify({ message: 'organization_id is required for update' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Map ข้อมูล (รองรับการส่งมาแค่บางส่วน)
      const org_type_id = body.org_type_id || body.org_type;
      const usage_type_id = body.usage_type_id || body.usage_type;

      // 1. ตรวจสอบว่ามี ID นี้ในระบบหรือไม่
      const checkOrg = await sql`
        SELECT organization_id FROM organizations WHERE organization_id = ${organization_id}
      `;
      
      if (checkOrg.length === 0) {
        return new Response(JSON.stringify({ message: 'Organization ID not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. อัปเดตข้อมูล (ใช้ COALESCE เพื่ออัปเดตเฉพาะค่าที่ส่งมา ข้อมูลเดิมไม่หาย)
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

    } catch (error) {
      console.error("PUT Error:", error);
      return new Response(JSON.stringify({ message: 'Update Failed', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // หากเรียก Method อื่น
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
    status: 405,
    headers: corsHeaders
  });
}