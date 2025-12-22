import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', 
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
    // SECTION 0: GET -> ดึงข้อมูล (รองรับ Dynamic Dropdown)
    // =========================================================
    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');
      const mode = searchParams.get('mode');          // 'roots' สำหรับหาจังหวัด
      const ancestorId = searchParams.get('ancestor_id'); // หาอำเภอภายใต้จังหวัดนี้

      // CASE A: ดึงข้อมูลองค์กรเดียว (By ID)
      if (id) {
        // ดึงข้อมูลองค์กร + หาว่าใครเป็น "แม่" (Depth=1) เพื่อส่งกลับไปให้ Frontend (ถ้าจำเป็นต้องใช้แสดงผล)
        const data = await sql`
          SELECT 
            o.*,
            (
              SELECT ancestor_id 
              FROM organization_hierarchy 
              WHERE descendant_id = o.organization_id 
              AND depth = 1 
              LIMIT 1
            ) as current_parent_id
          FROM organizations o
          WHERE o.organization_id = ${id}
        `;
        if (data.length === 0) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: corsHeaders });
        return new Response(JSON.stringify(data[0]), { status: 200, headers: corsHeaders });
      }

      // CASE B: ดึงรายชื่อ "จังหวัด" (Root Nodes)
      // คือ Node ที่ไม่มีบรรพบุรุษอื่นเลย (Depth > 0 ไม่ปรากฏในตาราง Hierarchy)
      if (mode === 'roots') {
        const roots = await sql`
          SELECT o.organization_id as id, o.organization_name as name
          FROM organizations o
          WHERE NOT EXISTS (
            SELECT 1 
            FROM organization_hierarchy h 
            WHERE h.descendant_id = o.organization_id 
              AND h.depth > 0
          )
          ORDER BY o.organization_name ASC
        `;
        return new Response(JSON.stringify(roots), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // CASE C: ดึงรายชื่อ "อำเภอ" (Children of specific Ancestor)
      // คือ Node ที่มี ancestor_id เป็นตัวที่เราเลือก และห่างกัน 1 ชั้น (Depth = 1)
      if (ancestorId) {
        const children = await sql`
          SELECT o.organization_id as id, o.organization_name as name
          FROM organizations o
          JOIN organization_hierarchy h ON o.organization_id = h.descendant_id
          WHERE h.ancestor_id = ${ancestorId}
            AND h.depth = 1
          ORDER BY o.organization_name ASC
        `;
        return new Response(JSON.stringify(children), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });
    }

    // =========================================================
    // SECTION 1: POST -> สร้างองค์กรใหม่
    // =========================================================
    if (req.method === 'POST') {
      const body = await req.json();

      const {
        organization_code, organization_name, admin_code,
        org_type_id, usage_type_id, url_logo,
        district, sub_district, contact_phone, province,
        latitude, longitude,
        // [IMPORTANT] รับตัวแปรนี้เพื่อใช้สร้าง Hierarchy แต่ไม่บันทึกลงตาราง organizations
        target_parent_id 
      } = body;

      if (!organization_code || !organization_name || !admin_code) {
        return new Response(JSON.stringify({ message: 'Missing required fields' }), { status: 400, headers: corsHeaders });
      }

      // 1. Insert ลงตารางหลัก (Clean Table: ไม่มี parent_id)
      const newOrg = await sql`
        INSERT INTO organizations (
          organization_code, organization_name, admin_code, 
          org_type_id, usage_type_id, url_logo,
          district, sub_district, contact_phone, province,
          latitude, longitude
        ) VALUES (
          ${organization_code}, ${organization_name}, ${admin_code}, 
          ${org_type_id || null}, ${usage_type_id || null}, ${url_logo || null},
          ${district || null}, ${sub_district || null}, ${contact_phone || null}, ${province || null},
          ${latitude || null}, ${longitude || null}
        ) RETURNING organization_id;
      `;

      const newOrgId = newOrg[0].organization_id;

      // 2. สร้าง Hierarchy (Closure Table)
      // 2.1 ใส่ตัวเอง (Depth 0)
      await sql`
        INSERT INTO organization_hierarchy (ancestor_id, descendant_id, depth)
        VALUES (${newOrgId}, ${newOrgId}, 0)
      `;

      // 2.2 ถ้ามีเป้าหมายแม่ (target_parent_id) ให้ Copy เส้นทางมา
      if (target_parent_id) {
        await sql`
          INSERT INTO organization_hierarchy (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, ${newOrgId}, depth + 1
          FROM organization_hierarchy
          WHERE descendant_id = ${target_parent_id}
        `;
      }

      return new Response(JSON.stringify({ ...body, organization_id: newOrgId }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // =========================================================
    // SECTION 2: PUT -> แก้ไขข้อมูล / ย้ายสังกัด
    // =========================================================
    if (req.method === 'PUT') {
      const body = await req.json();
      const { organization_id, target_parent_id } = body; 

      if (!organization_id) {
        return new Response(JSON.stringify({ message: 'organization_id is required' }), { status: 400, headers: corsHeaders });
      }

      // 1. Update ตารางหลัก (เฉพาะข้อมูลทั่วไป)
      await sql`
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
          longitude         = COALESCE(${body.longitude || null}, longitude)
        WHERE organization_id = ${organization_id}
      `;

      // 2. Handle Hierarchy Change (Move Node)
      // ถ้ามีการส่ง target_parent_id มา (แม้จะเป็น null) แสดงว่าต้องการเปลี่ยนโครงสร้าง
      if (target_parent_id !== undefined) {
         // 2.1 ลบความสัมพันธ์เก่า (ตัดออกจากสายเดิม)
         await sql`
           DELETE FROM organization_hierarchy 
           WHERE descendant_id = ${organization_id} 
             AND ancestor_id != ${organization_id}
         `;

         // 2.2 สร้างความสัมพันธ์ใหม่ (ถ้า target_parent_id ไม่ใช่ null)
         if (target_parent_id) {
           await sql`
             INSERT INTO organization_hierarchy (ancestor_id, descendant_id, depth)
             SELECT ancestor_id, ${organization_id}, depth + 1
             FROM organization_hierarchy
             WHERE descendant_id = ${target_parent_id}
           `;
         }
      }

      return new Response(JSON.stringify({ success: true, organization_id }), {
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