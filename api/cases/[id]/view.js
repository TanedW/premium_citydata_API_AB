// export const config = {
//   runtime: 'edge',
// };

// import { neon } from '@neondatabase/serverless';

// const corsHeaders = {
//   'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
//   'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
//   'Access-Control-Allow-Headers': 'Content-Type, Authorization',
// };

// export default async function handler(req) {
//   if (req.method === 'OPTIONS') {
//     return new Response(null, { status: 204, headers: corsHeaders });
//   }

//   if (req.method === 'PATCH') {
//     const sql = neon(process.env.DATABASE_URL);

//     try {
//       // ✅ 1. ดึง case_id จาก URL
//       const url = new URL(req.url, `http://${req.headers.get('host')}`);
//       const case_id = url.pathname.split('/')[3];

//       // ✅ 2. ดึงข้อมูลจาก body
//       const body = await req.json();
//       const { organization_id, user_id } = body;

//       // ตรวจสอบค่าที่จำเป็น
//       if (!case_id || !organization_id || !user_id) {
//         return new Response(
//           JSON.stringify({
//             message:
//               'Missing required fields: case_id (from URL), organization_id, and user_id are required.',
//           }),
//           { status: 400, headers: corsHeaders }
//         );
//       }

//       // ✅ 3. ดึงข้อมูล user
//       const [user] = await sql`
//         SELECT user_id, first_name
//         FROM users
//         WHERE user_id = ${user_id};
//       `;
//       const user_name = user?.first_name || 'ไม่ทราบชื่อ';

//       // ✅ 4. ดึงค่า old_status ของเคส
//       const result = await sql`
//         SELECT status 
//         FROM issue_cases 
//         WHERE issue_cases_id = ${case_id}
//         LIMIT 1;
//       `;
//       const oldStatus = result[0]?.status || null;

//       // ✅ 5. ตั้งค่าข้อมูลใหม่
//       const newStatus = 'กำลังประสานงาน';
//       const comment = `เจ้าหน้าที่ (ID: ${user_id} ชื่อ ${user_name}) เข้าชมเคส โดยสถานะก่อนหน้า: ${oldStatus ?? 'ไม่ทราบ'}`;

//       // ✅ 6. เตรียม queries สำหรับ transaction
//       const queries = [];

//       // อัปเดตสถานะการเข้าชมของหน่วยงาน
//       queries.push(sql`
//         UPDATE case_organizations
//         SET is_viewed = true
//         WHERE case_id = ${case_id} AND organization_id = ${organization_id};
//       `);

//       // อัปเดตสถานะของเคส (เฉพาะที่ยังอยู่สถานะ 'รอรับเรื่อง')
//       queries.push(sql`
//         UPDATE issue_cases
//         SET status = ${newStatus}, updated_at = now()
//         WHERE issue_cases_id = ${case_id} AND status = 'รอรับเรื่อง';
//       `);

//       // บันทึก Log
//       queries.push(sql`
//         INSERT INTO case_activity_logs 
//           (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
//         VALUES 
//           (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment});
//       `);

//       // ✅ 7. รันทั้งหมดใน transaction เดียว
//       await sql.transaction(queries);

//       // ✅ 8. ตอบกลับสำเร็จ
//       return new Response(
//         JSON.stringify({
//           message: 'Case viewed and status updated successfully.',
//           old_status: oldStatus,
//           new_status: newStatus,
//           user_name,
//         }),
//         { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
//       );

//     } catch (error) {
//       console.error('API Error (PATCH /view - Edge):', error);

//       return new Response(
//         JSON.stringify({ message: 'An error occurred', error: error.message }),
//         { status: 500, headers: corsHeaders }
//       );
//     }
//   }

//   // ❌ Method not allowed
//   return new Response(
//     JSON.stringify({ message: `Method ${req.method} Not Allowed` }),
//     { status: 405, headers: corsHeaders }
//   );
// }


// /api/cases/[id]/view.js
// (!!! Runtime: 'edge' !!!)
// (นี่คือเวอร์ชันที่ "ปลอดภัย" และรันบน Edge ได้)
// (Trade-off: Log จะไม่สมบูรณ์ - ไม่มี old_status, ไม่มี user name)

export const config = {
  runtime: 'edge', 
};

import { neon } from '@neondatabase/serverless';

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <-- ตรวจสอบ URL ของ React App
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};


export default async function handler(req) {
  // --- 1. Respond to OPTIONS (Preflight) request ---
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- 2. Main logic for HTTP PATCH (อัปเดต 'is_viewed' และ 'status') ---
  if (req.method === 'PATCH') {
    const sql = neon(process.env.DATABASE_URL);
    let body;

    try {
      // 2.1. ดึง ID ของเคส (UUID) จาก URL
      const url = new URL(req.url, `http://${req.headers.get('host')}`);
      const case_id = url.pathname.split('/')[3]; 

      // 2.2. ดึง ID ของหน่วยงาน และ ID ของเจ้าหน้าที่
      body = await req.json(); // Edge Runtime ใช้ .json()
      const { organization_id, user_id } = body;

      // 2.3. ตรวจสอบข้อมูล
      if (!case_id || !organization_id || !user_id) {
        return new Response(JSON.stringify({ message: 'Missing required fields: case_id (from URL), organization_id, and user_id are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (typeof organization_id !== 'number' || !Number.isInteger(organization_id) ||
          typeof user_id !== 'number' || !Number.isInteger(user_id)) {
         return new Response(JSON.stringify({ message: 'Invalid format: organization_id and user_id must be integers.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // (!!! นี่คือการตัดฟีเจอร์ (Trade-off) ของ Edge !!!)
      // เราไม่สามารถ SELECT 'old_status' หรือ 'user_name' ได้
      const newStatus = 'กำลังประสานงาน';
      const comment = `เจ้าหน้าที่ (ID: ${user_id}) เข้าชมเคส`;

      // 2.4. (!!! หัวใจสำคัญ !!!)
      // สร้าง "Array" ของ Queries (สำหรับ Vercel Edge Transaction)
      const queries = [];

      // Step 1: อัปเดต 'is_viewed' = true
      // (สำคัญ: เราต้องมั่นใจว่าแถวนี้มีอยู่จริงก่อน Transaction)
      // เราอาจจะ SELECT ก่อนเพื่อเช็ก แต่ Edge ทำให้ยุ่งยาก
      // ดังนั้น Transaction จะเป็นการป้องกันที่ดีที่สุด
      queries.push(sql`
        UPDATE case_organizations
        SET is_viewed = true
        WHERE case_id = ${case_id} AND organization_id = ${organization_id}
      `);

      // Step 2: อัปเดต 'status' = 'กำลังประสานงาน'
      // (สำคัญ: ใช้ WHERE status = 'รอรับเรื่อง' เพื่อป้องกันการเขียนทับสถานะอื่น)
      queries.push(sql`
        UPDATE issue_cases
        SET status = ${newStatus}, updated_at = now()
        WHERE issue_cases_id = ${case_id} AND status = 'รอรับเรื่อง'
      `);

      // Step 3: บันทึก Log (แบบ "ไม่สมบูรณ์" แต่ปลอดภัย)
      // (!!! Trade-off: old_value เป็น NULL, comment ไม่มีชื่อ !!!)
      queries.push(sql`
        INSERT INTO case_activity_logs 
          (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
        VALUES 
          (${case_id}, ${user_id}, 'STATUS_CHANGE', NULL, ${newStatus}, ${comment})
      `);

      // 2.5. !!! รัน Transaction (แบบ Array) !!!
      // ถ้าคำสั่งใดคำสั่งหนึ่งใน Array ล้มเหลว (เช่น user_id ไม่มีอยู่จริง)
      // Transaction ทั้งหมดจะ Rollback โดยอัตโนมัติ
      await sql.transaction(queries);
      
      // 2.6. Transaction สำเร็จ
      return new Response(JSON.stringify({ message: 'Case viewed and status updated successfully.' }), { 
          status: 200, // 200 OK
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 2.7. จัดการ Error
      console.error("API Error (PATCH /view - Edge):", error);
      
      // (เช็ก Error ที่พบบ่อย)
      if (error.message && error.message.includes('violates foreign key constraint')) {
         // อาจเกิดจาก case_id, organization_id, หรือ user_id ไม่มีอยู่จริง
         return new Response(JSON.stringify({ 
          message: 'Invalid data provided. Ensure case_id, organization_id, and user_id exist.',
          error: error.message 
        }), { 
            status: 400, // 400 Bad Request
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Error อื่นๆ (เช่น Network Error, DB Down)
      return new Response(JSON.stringify({ message: 'An error occurred processing your request.', error: error.message }), { 
          status: 500, // 500 Internal Server Error
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- 3. Handle any other HTTP methods ---
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, // 405 Method Not Allowed
      headers: corsHeaders 
  });
}
