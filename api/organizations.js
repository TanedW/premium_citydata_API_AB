import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // ปรับเป็น domain จริงเมื่อขึ้น Production
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
    // SECTION 1: POST -> สร้างองค์กรใหม่ + สร้าง Hierarchy
    // =========================================================
    if (req.method === 'POST') {
      const body = await req.json();

      const {
        organization_code, organization_name, admin_code,
        org_type_id, usage_type_id, url_logo,
        district, sub_district, contact_phone, province,
        latitude, longitude,
        parent_id,       // รับค่า ID พ่อ
        hierarchy_level  // รับค่าระดับชั้น
      } = body;

      if (!organization_code || !organization_name || !admin_code) {
        return new Response(JSON.stringify({
          message: 'Missing required fields'
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const existingOrg = await sql`SELECT organization_code FROM organizations WHERE organization_code = ${organization_code}`;
      if (existingOrg.length > 0) {
        return new Response(JSON.stringify({ message: 'Organization code already exists' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 1. Insert ลงตารางหลัก (เก็บ parent_id ไว้ด้วยเพื่อความชัวร์แบบ Hybrid)
      const newOrg = await sql`
        INSERT INTO organizations (
          organization_code, organization_name, admin_code, 
          org_type_id, usage_type_id, url_logo,
          district, sub_district, contact_phone, province,
          latitude, longitude, parent_id, hierarchy_level
        ) VALUES (
          ${organization_code}, ${organization_name}, ${admin_code}, 
          ${org_type_id || null}, ${usage_type_id || null}, ${url_logo || null},
          ${district || null}, ${sub_district || null}, ${contact_phone || null}, ${province || null},
          ${latitude || null}, ${longitude || null}, ${parent_id || null}, ${hierarchy_level || null}
        ) RETURNING *;
      `;

      const newOrgId = newOrg[0].organization_id;

      // 2. Insert ลงตาราง Closure Table (organization_hierarchy)
      // 2.1 ใส่ตัวเอง (Depth 0)
      await sql`
        INSERT INTO organization_hierarchy (ancestor_id, descendant_id, depth)
        VALUES (${newOrgId}, ${newOrgId}, 0)
      `;

      // 2.2 ถ้ามี Parent ให้ Copy path ทั้งหมดจาก Parent มาใส่ให้ตัวเอง
      if (parent_id) {
        await sql`
          INSERT INTO organization_hierarchy (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, ${newOrgId}, depth + 1
          FROM organization_hierarchy
          WHERE descendant_id = ${parent_id}
        `;
      }

      return new Response(JSON.stringify(newOrg[0]), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // =========================================================
    // SECTION 2: PUT -> แก้ไขข้อมูล + ปรับ Hierarchy
    // =========================================================
    if (req.method === 'PUT') {
      const body = await req.json();
      const { organization_id } = body; 

      if (!organization_id) {
        return new Response(JSON.stringify({ message: 'organization_id is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 1. Update ข้อมูลทั่วไปในตารางหลัก
      const updatedOrg = await sql`
        UPDATE organizations SET
          organization_name = COALESCE(${body.organization_name || null}, organization_name),
          org_type_id       = COALESCE(${body.org_type_id || body.org_type || null}, org_type_id),
          usage_type_id     = COALESCE(${body.usage_type_id || body.usage_type || null}, usage_type_id),
          url_logo          = COALESCE(${body.url_logo || null}, url_logo),
          district          = COALESCE(${body.district || null}, district),
          sub_district      = COALESCE(${body.sub_district || null}, sub_district),
          contact_phone     = COALESCE(${body.contact_phone || null}, contact_phone),
          province          = COALESCE(${body.province || null}, province),
          latitude          = COALESCE(${body.latitude || null}, latitude),
          longitude         = COALESCE(${body.longitude || null}, longitude),
          parent_id         = COALESCE(${body.parent_id || null}, parent_id),          
          hierarchy_level   = COALESCE(${body.hierarchy_level || null}, hierarchy_level)
        WHERE organization_id = ${organization_id}
        RETURNING *;
      `;

      // 2. จัดการ Closure Table (ถ้ามีการส่ง parent_id มาเพื่อเปลี่ยนสังกัด)
      if (body.parent_id !== undefined) {
         // กรณีเปลี่ยนสังกัด: 
         // 2.1 ลบความสัมพันธ์เก่า (Delete relationships where node is descendant but not ancestor of itself)
         await sql`
           DELETE FROM organization_hierarchy 
           WHERE descendant_id = ${organization_id} 
             AND ancestor_id != ${organization_id}
         `;

         // 2.2 สร้างความสัมพันธ์ใหม่ตาม Parent ใหม่ (ถ้ามี)
         if (body.parent_id) {
           await sql`
             INSERT INTO organization_hierarchy (ancestor_id, descendant_id, depth)
             SELECT ancestor_id, ${organization_id}, depth + 1
             FROM organization_hierarchy
             WHERE descendant_id = ${body.parent_id}
           `;
         }
      }

      return new Response(JSON.stringify(updatedOrg[0]), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
      status: 405, headers: corsHeaders
    });

  } catch (error) {
    console.error("API Error:", error);
    return new Response(JSON.stringify({ message: 'Internal Server Error', error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}