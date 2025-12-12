// /api/organizations.js
import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', 
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // =========================================================
    // SECTION 0: GET -> ดึงข้อมูลองค์กร
    // =========================================================
    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ message: 'Organization ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await sql`
        SELECT * FROM organizations WHERE organization_id = ${id}
      `;

      if (data.length === 0) {
        return new Response(JSON.stringify({ message: 'Organization not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(data[0]), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // =========================================================
    // SECTION 1: POST -> สร้างองค์กรใหม่ (เพิ่ม Hierarchy)
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
        longitude,
        // --- [NEW] รับค่าสำหรับ Hierarchy ---
        parent_id,       // ID ขององค์กรแม่ (ถ้ามี)
        hierarchy_level  // ระดับชั้น เช่น 'Province', 'District'
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

      // --- [UPDATED] เพิ่ม column parent_id และ hierarchy_level ลงใน SQL ---
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
          longitude,
          parent_id,       -- เพิ่มตรงนี้
          hierarchy_level  -- เพิ่มตรงนี้
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
          ${longitude || null},
          ${parent_id || null},       -- เพิ่มค่าที่รับมา
          ${hierarchy_level || null}  -- เพิ่มค่าที่รับมา
        ) 
        RETURNING *; 
      `;

      return new Response(JSON.stringify(newOrg[0]), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // =========================================================
    // SECTION 2: PUT -> แก้ไขข้อมูล (รองรับการย้ายสังกัด/เปลี่ยนระดับ)
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

      const checkOrg = await sql`
        SELECT organization_id FROM organizations WHERE organization_id = ${organization_id}
      `;
      
      if (checkOrg.length === 0) {
        return new Response(JSON.stringify({ message: 'Organization ID not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // --- [UPDATED] เพิ่มการ update parent_id และ hierarchy_level ---
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
          longitude         = COALESCE(${body.longitude || null}, longitude),
          parent_id         = COALESCE(${body.parent_id || null}, parent_id),          -- เพิ่มตรงนี้
          hierarchy_level   = COALESCE(${body.hierarchy_level || null}, hierarchy_level) -- เพิ่มตรงนี้
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