// /api/cases/issue_cases.js

export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// ---------------- CORS ----------------
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // URL ของ Frontend
  // !!! เพิ่ม PATCH เข้าไปในรายการ Methods !!!
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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
          JOIN case_organizations co ON ic.issue_cases_id = co.case_id
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
        sql`SELECT case_id, organization_id FROM case_organizations;`,
        sql`SELECT organization_id, organization_name FROM organizations;`,
      ]);

      // รวมข้อมูล
      const merged = cases.map((c) => {
        const type = issueTypes.find((t) => t.issue_id === c.issue_type_id);

        const relatedLinks = caseOrgs.filter(
          (co) => co.case_id === c.issue_cases_id
        );

        const relatedOrgs = relatedLinks.map((link) => {
          const orgData = orgs.find(
            (o) => o.organization_id === link.organization_id
          );

          if (orgData) {
            return {
              orgid: orgData.organization_id,
              responsible_unit: orgData.organization_name,
            };
          }
          return {
            orgid: link.organization_id,
            responsible_unit: 'ไม่พบข้อมูลหน่วยงาน',
          };
        });

        return {
          ...c,
          issue_type_name: type ? type.name : 'ไม่ทราบประเภท',
          organizations: relatedOrgs,
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
        organization_ids
      } = body;
      
      if (!title || !issue_type_id || !latitude || !longitude) {
        return new Response(JSON.stringify({ message: 'Missing required fields: title, issue_type_id, latitude, and longitude are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      let validUserId = null; 
      if (user_id !== null && user_id !== undefined) {
        if (typeof user_id !== 'number' || !Number.isInteger(user_id)) {
           return new Response(JSON.stringify({ message: 'Invalid user_id: If provided, must be an integer.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        validUserId = user_id;
      }
      
      const newCaseId = crypto.randomUUID(); 
      const caseCode = generateCaseCode();
      const defaultStatus = 'รอรับเรื่อง'; 
        
      const queries = [];

      // Step 1: Create Case
      queries.push(sql`
        INSERT INTO issue_cases (
          issue_cases_id, 
          case_code, 
          title, 
          description, 
          cover_image_url, 
          issue_type_id, 
          latitude, 
          longitude, 
          tags,
          status
        ) VALUES (
          ${newCaseId}, 
          ${caseCode}, 
          ${title}, 
          ${description}, 
          ${cover_image_url}, 
          ${issue_type_id}, 
          ${latitude}, 
          ${longitude}, 
          ${tags},
          ${defaultStatus}
        )
        RETURNING *;
      `);

      // Step 2: Media Files
      if (media_files && media_files.length > 0) {
        for (const file of media_files) {
          queries.push(sql`
            INSERT INTO case_media (case_id, media_type, url)
            VALUES (${newCaseId}, ${file.media_type}, ${file.url})
          `);
        }
      }

      // Step 3: Activity Log (CREATE)
      queries.push(sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES
          (${newCaseId}, ${validUserId}, 'CREATE', NULL, ${defaultStatus}, 'สร้างเคสใหม่');
      `);

      // Step 4: Organization Links
      if (organization_ids && organization_ids.length > 0) {
        for (const orgId of organization_ids) {
          if (typeof orgId === 'number' && Number.isInteger(orgId)) {
            queries.push(sql`
              INSERT INTO case_organizations (case_id, organization_id, is_viewed)
              VALUES (${newCaseId}, ${orgId}, false)
            `);
          }
        }
      }
      
      const results = await sql.transaction(queries);
      const newCase = results[0]; 
      
      return new Response(JSON.stringify(newCase), { 
          status: 201, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("API Error (POST):", error);
      if (error.message && error.message.includes('unique constraint') && error.message.includes('issue_cases_case_code_key')) {
        return new Response(JSON.stringify({ 
          message: 'Case code collision. Please try submitting again.',
          error: error.message 
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (error.message && error.message.includes('violates foreign key constraint')) {
         return new Response(JSON.stringify({ 
          message: 'Invalid data. For example, issue_type_id, user_id, or organization_id does not exist.',
          error: error.message 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // ============================================================
  // 3️⃣ PATCH — อัปเดตสถานะ (!!! เพิ่มใหม่ !!!)
  // ============================================================
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const {
        case_id,        // ID ของเคส (UUID)
        user_id,        // ID ของ User ที่ทำรายการ (Integer)
        new_status,     // สถานะใหม่ เช่น 'ดำเนินการ', 'เสร็จสิ้น'
        comment,        // รายละเอียดการดำเนินการ
        media_url,      // (Optional) URL รูปภาพผลการทำงาน
        media_type      // (Optional) เช่น 'image'
      } = body;

      // 3.1 ตรวจสอบข้อมูลจำเป็น
      if (!case_id || !new_status || !user_id) {
        return new Response(JSON.stringify({ 
          message: 'Missing required fields: case_id, user_id, and new_status are required.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3.2 ดึงสถานะเดิมก่อน (เพื่อเอามาลง Log)
      const currentCase = await sql`
        SELECT status FROM issue_cases WHERE issue_cases_id = ${case_id} LIMIT 1
      `;

      if (currentCase.length === 0) {
        return new Response(JSON.stringify({ message: 'Case not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const oldStatus = currentCase[0].status;
      const queries = [];

      // Step 1: Query อัปเดตสถานะในตารางหลัก
      queries.push(sql`
        UPDATE issue_cases 
        SET status = ${new_status}, updated_at = NOW()
        WHERE issue_cases_id = ${case_id}
      `);

      // Step 2: Query บันทึก Log การเปลี่ยนแปลง (activity_type = 'STATUS_CHANGE')
      queries.push(sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES
          (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${new_status}, ${comment || ''})
      `);

      // Step 3: (ถ้ามี) บันทึกรูปภาพประกอบการทำงาน
      if (media_url) {
        queries.push(sql`
          INSERT INTO case_media (case_id, media_type, url)
          VALUES (${case_id}, ${media_type || 'image'}, ${media_url})
        `);
      }

      // 3.3 รัน Transaction
      await sql.transaction(queries);

      return new Response(JSON.stringify({ 
        message: 'Status updated successfully',
        prev_status: oldStatus,
        new_status: new_status
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("API Error (PATCH):", error);
      return new Response(JSON.stringify({ 
        message: 'Failed to update status',
        error: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- 4. Handle any other HTTP methods ---
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}