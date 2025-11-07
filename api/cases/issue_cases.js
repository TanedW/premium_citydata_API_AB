// /api/cases.js

export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ---------------- CORS ----------------
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // URL ของ Frontend
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ---------------- Helper ----------------
function generateCaseCode() {
  const year = new Date().getFullYear();
  const randomDigits = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomLetters = '';
  for (let i = 0; i < 3; i++) {
    randomLetters += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return `${year}-${randomDigits}${randomLetters}`;
}

// ---------------- Handler ----------------
export default async function handler(req) {
  // --- Preflight (CORS) ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  // ============================================================
  // 1️⃣ GET — ดึงข้อมูลเคสทั้งหมด (รวมประเภทและหน่วยงาน)
  // [🌟 UPDATED BLOCK 🌟]
  // ============================================================
  if (req.method === 'GET') {
    try {
      const { organization_id } = Object.fromEntries(
        new URL(req.url).searchParams
      );

      let cases;
      if (organization_id) {
        // ดึงเฉพาะเคสที่เกี่ยวกับหน่วยงานนี้
        cases = await sql`
          SELECT ic.*
          FROM issue_cases ic
          JOIN case_organizations co ON ic.issue_case_id = co.case_id
          WHERE co.organization_id = ${organization_id}
          ORDER BY ic.created_at DESC
          LIMIT 100;
        `;
      } else {
        // ดึงทั้งหมด
        cases = await sql`
          SELECT * FROM issue_cases
          ORDER BY created_at DESC
          LIMIT 100;
        `;
      }

      // ดึงข้อมูลประกอบทั้งหมดเพื่อแมป
      const [issueTypes, caseOrgs, orgs] = await Promise.all([
        sql`SELECT issue_id, name FROM issue_types;`,
        // ⚠️ FIXED: ต้องดึงทั้ง case_id และ organization_id
        sql`SELECT case_id, organization_id FROM case_organizations;`,
        sql`SELECT organization_id, organization_name FROM organizations;`,
      ]);

      // รวมข้อมูล
      const merged = cases.map((c) => {
        // 1. หา type (เหมือนเดิม)
        const type = issueTypes.find((t) => t.issue_id === c.issue_type_id);

        // 2. 🌟 CHANGED: หาทุก organizations ที่เกี่ยวข้อง (ใช้ .filter)
        const relatedCaseOrgs = caseOrgs.filter(
          // ⚠️ FIXED: แก้ไขการจับคู่ key ให้ถูกต้อง
          (co) => co.case_id === c.issue_case_id
        );

        // 3. 🌟 CHANGED: ดึงข้อมูล organizations ฉบับเต็ม (ใช้ .map)
        const responsible_organizations = relatedCaseOrgs
          .map((co) => {
            // หาข้อมูล org เต็มๆ จาก array 'orgs'
            return orgs.find((o) => o.organization_id === co.organization_id);
          })
          .filter(Boolean); // .filter(Boolean) กัน Error หากหาไม่เจอ (เช่น org ถูกลบไปแล้ว)

        // 4. 🌟 CHANGED: สร้างผลลัพธ์
        return {
          ...c,
          issue_type_name: type ? type.name : 'ไม่ทราบประเภท',

          // Field ใหม่: ส่งกลับเป็น Array ของ Objects
          responsible_organizations: responsible_organizations,

          // Field ใหม่: ส่งกลับเป็น String ที่อ่านง่าย (เช่น "เทศบาล A, เทศบาล B")
          responsible_units_display:
            responsible_organizations.length > 0
              ? responsible_organizations
                  .map((o) => o.organization_name)
                  .join(', ')
              : '-',
        };
      });

      return new Response(JSON.stringify(merged), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('API Error (GET):', error);
      return new Response(
        JSON.stringify({
          message: 'Database query failed',
          error: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // ============================================================
  // 2️⃣ POST — เพิ่มเคสใหม่
  // ============================================================
  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
      const {
        title,
        description,
        cover_image_url,
        issue_type_id,
        latitude,
        longitude,
        tags,
        media_files,
        user_id,
        organization_ids,
      } = body;

      if (!title || !issue_type_id || !latitude || !longitude) {
        return new Response(
          JSON.stringify({
            message:
              'Missing required fields: title, issue_type_id, latitude, and longitude are required.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const validUserId =
        user_id && Number.isInteger(user_id) ? user_id : null;

      const newCaseId = crypto.randomUUID();
      const caseCode = generateCaseCode();
      const defaultStatus = 'รอรับเรื่อง';

      // Step 1: Insert issue_cases
      await sql`
        INSERT INTO issue_cases (
          issue_case_id, case_code, title, description, cover_image_url,
          issue_type_id, latitude, longitude, tags, status
        ) VALUES (
          ${newCaseId}, ${caseCode}, ${title}, ${description}, ${cover_image_url},
          ${issue_type_id}, ${latitude}, ${longitude}, ${tags}, ${defaultStatus}
        );
      `;

      // Step 2: บันทึก organization ที่รับผิดชอบ
      if (organization_ids && organization_ids.length > 0) {
        for (const orgId of organization_ids) {
          await sql`
            INSERT INTO case_organizations (case_id, organization_id, is_viewed)
            VALUES (${newCaseId}, ${orgId}, false);
          `;
        }
      }

      // Step 3: เพิ่ม log
      await sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES
          (${newCaseId}, ${validUserId}, 'CREATE', NULL, ${defaultStatus}, 'สร้างเคสใหม่');
      `;

      return new Response(
        JSON.stringify({ message: 'Case created', case_id: newCaseId }),
        {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('API Error (POST):', error);
      return new Response(
        JSON.stringify({
          message: 'Error creating case',
          error: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // ============================================================
  // 3️⃣ Default — ไม่รองรับ method อื่น
  // ============================================================
  return new Response(
    JSON.stringify({ message: `Method ${req.method} Not Allowed` }),
    {
      status: 405,
      headers: corsHeaders,
    }
  );
}