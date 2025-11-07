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
        // case_id ในตารางนี้คือ issue_cases_id (UUID)
        sql`SELECT case_id, organization_id FROM case_organizations;`,
        sql`SELECT organization_id, organization_name FROM organizations;`,
      ]);

      // รวมข้อมูล
      const merged = cases.map((c) => {
        // 1. หาประเภท (อันนี้ถูกต้อง)
        const type = issueTypes.find((t) => t.issue_id === c.issue_type_id);

        // 2. (ที่แก้ไข) หา "ลิงก์" ทั้งหมดที่เชื่อมเคสนี้กับหน่วยงาน
        //    (Code เดิม: .find((co) => co.issue_id === c.issue_id) <-- นี่คือจุดที่ผิด)
        //    (Code แก้ไข: .filter((co) => co.case_id === c.issue_cases_id))
        const relatedLinks = caseOrgs.filter(
          (co) => co.case_id === c.issue_cases_id
        );

        // 3. (ที่แก้ไข) แปลง "ลิงก์" ทั้งหมดให้เป็น "ข้อมูลหน่วยงาน" จริง
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
          // กรณีหา orgData ไม่เจอ (เช่น หน่วยงานถูกลบ แต่ลิงก์ยังอยู่)
          return {
            orgid: link.organization_id,
            responsible_unit: 'ไม่พบข้อมูลหน่วยงาน',
          };
        });

        // 4. (ที่แก้ไข) คืน object ที่มี array ของ organizations
        return {
          ...c,
          issue_type_name: type ? type.name : 'ไม่ทราบประเภท',
          organizations: relatedOrgs, // แทนที่ orgid และ responsible_unit เดิม
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
      // 3.1. ดึงข้อมูลที่ส่งมาจาก Frontend
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
        user_id, // (Optional)
        organization_ids // (!!! ใหม่ !!!) Array ของ ID หน่วยงาน (integer)
      } = body;
      
      // 3.2. ตรวจสอบข้อมูลจำเป็น
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
      
      // 3.3. (!!! หัวใจสำคัญ !!!)
      // สร้าง ID ทั้งหมดขึ้นมาก่อน
      const newCaseId = crypto.randomUUID(); 
      const caseCode = generateCaseCode();
      const defaultStatus = 'รอรับเรื่อง'; // สถานะเริ่มต้น
        
      // 3.4. สร้าง "Array" ของ Queries (สำหรับ Vercel Edge)
      const queries = [];

      // Step 1: Query สร้างเคสหลัก
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

      // Step 2: (ถ้ามี) Query สร้างไฟล์มีเดีย
      if (media_files && media_files.length > 0) {
        for (const file of media_files) {
          queries.push(sql`
            INSERT INTO case_media (case_id, media_type, url)
            VALUES (${newCaseId}, ${file.media_type}, ${file.url})
          `);
        }
      }

      // Step 3: Query สร้างประวัติ
      queries.push(sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES
          (${newCaseId}, ${validUserId}, 'CREATE', NULL, ${defaultStatus}, 'สร้างเคสใหม่');
      `);

      // -----------------------------------------------------------
      // (!!! นี่คือส่วนที่เพิ่มใหม่ !!!)
      // Step 4: (ถ้ามี) Query จ่ายงานให้หน่วยงาน
      if (organization_ids && organization_ids.length > 0) {
        for (const orgId of organization_ids) {
          // ตรวจสอบว่าเป็น Integer ที่ถูกต้อง
          if (typeof orgId === 'number' && Number.isInteger(orgId)) {
            queries.push(sql`
              INSERT INTO case_organizations (case_id, organization_id, is_viewed)
              VALUES (${newCaseId}, ${orgId}, false)
            `);
          }
        }
      }
      // -----------------------------------------------------------
      
      // 3.5. !!! รัน Transaction (แบบ Array) !!!
      const results = await sql.transaction(queries);
          
      // 3.6. Transaction สำเร็จ
      const newCase = results[0]; 
      
      return new Response(JSON.stringify(newCase), { 
          status: 201, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 3.7. จัดการ Error
      console.error("API Error (POST):", error);

      if (error.message && error.message.includes('unique constraint') && error.message.includes('issue_cases_case_code_key')) {
        return new Response(JSON.stringify({ 
          message: 'Case code collision. Please try submitting again.',
          error: error.message 
        }), { 
            status: 409, // 409 Conflict
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (error.message && error.message.includes('violates foreign key constraint')) {
         return new Response(JSON.stringify({ 
          message: 'Invalid data. For example, issue_type_id, user_id, or organization_id does not exist.',
          error: error.message 
        }), { 
            status: 400, // 400 Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Error อื่นๆ
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
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