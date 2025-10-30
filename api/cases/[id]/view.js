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

// /api/cases/[id]/view.js
// (!!! Runtime: 'Node.js' !!!)
// (นี่คือ API ที่ "ฉลาด" สำหรับชมเคส และบันทึก Log ที่สมบูรณ์)
// (!!! ไม่มี 'export const config' !!!)

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
    // Node.js runtime handles OPTIONS differently, often automatically.
    // However, explicitly handling it ensures CORS headers are set correctly.
    // Sending back the allowed methods and headers.
    const headers = {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    return new Response(null, { status: 204, headers: headers });
  }

  // --- 2. Main logic for HTTP PATCH (อัปเดต 'is_viewed' และ 'status') ---
  if (req.method === 'PATCH') {
    const sql = neon(process.env.DATABASE_URL);
    let body;

    try {
      // 2.1. ดึง ID ของเคส (UUID) จาก URL
      // (Node.js Runtime อ่านจาก 'req.query')
      // Vercel populates req.query based on the file path [id].js -> req.query.id
      const { id: case_id } = req.query; 

      // 2.2. ดึง ID ของหน่วยงาน (Integer) และ ID ของเจ้าหน้าที่ (Integer)
      // (Node.js Runtime อ่าน JSON body จาก 'req.body')
      // Vercel parses the JSON body automatically for Node.js functions
      body = req.body;

      const { organization_id, user_id } = body;

      // 2.3. ตรวจสอบข้อมูล
      if (!case_id || !organization_id || !user_id) {
        return new Response(JSON.stringify({ message: 'Missing required fields: case_id (from URL), organization_id (from body), and user_id (from body) are required.' }), {
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
      
      const newStatus = 'กำลังประสานงาน'; // สถานะใหม่

      console.log('Starting transaction...'); // <-- LOG 1

      // 2.4. !!! เริ่ม Transaction (แบบ 'Node.js' ที่ซับซ้อนได้) !!!
      const transactionResult = await sql.transaction(async (tx) => {
        
        // Step 1: ดึงข้อมูลเก่า (สถานะเก่า)
        const oldCase = await tx`SELECT status FROM issue_cases WHERE issue_cases_id = ${case_id}`;
        if (oldCase.length === 0) throw new Error('Case not found');
        const oldStatus = oldCase[0].status;
        
        // Step 2: ดึงชื่อเจ้าหน้าที่
        const officer = await tx`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}`;
        if (officer.length === 0) throw new Error('User (officer) not found');
        
        const officerName = `${officer[0].first_name || ''} ${officer[0].last_name || ''}`.trim();
        const comment = `เจ้าหน้าที่เข้าชมเคส โดย ${user_id} ${officerName}`; // คอมเมนต์ Log

        // Step 3: อัปเดตตาราง 'case_organizations' (ตั้งค่า is_viewed = true)
        const updatedOrg = await tx`
          UPDATE case_organizations
          SET is_viewed = true
          WHERE case_id = ${case_id} AND organization_id = ${organization_id}
          RETURNING *; 
        `;

        // ตรวจสอบว่ามีแถวถูกอัปเดตหรือไม่ (ป้องกันการยิงใส่เคสที่ไม่ได้รับมอบหมาย)
        if (updatedOrg.length === 0) {
          throw new Error('This case might not be assigned to this organization, or the record does not exist.');
        }

        // Step 4: อัปเดตตาราง 'issue_cases' (เปลี่ยน status)
        // (เช็กก่อนว่าสถานะปัจจุบันคือ 'รอรับเรื่อง' หรือไม่ เพื่อป้องกันการเขียนทับ)
        let statusUpdated = false;
        if (oldStatus === 'รอรับเรื่อง') {
          await tx`
            UPDATE issue_cases
            SET status = ${newStatus}, updated_at = now()
            WHERE issue_cases_id = ${case_id}
          `;
          statusUpdated = true;
        }
        
        // Step 5: บันทึกประวัติลง 'case_activity_logs' (ด้วย Log ที่สมบูรณ์)
        // บันทึกเฉพาะเมื่อมีการเปลี่ยนสถานะจริงๆ
        if (statusUpdated) {
          await tx`
            INSERT INTO case_activity_logs 
              (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
            VALUES 
              (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment})
          `;
        } else {
            // ถ้าสถานะไม่ได้เปลี่ยน (เช่น เคสถูกเปิดอ่านซ้ำ) เราอาจจะบันทึก Log แบบอื่น
            // หรือ ไม่บันทึกเลยก็ได้ ขึ้นอยู่กับความต้องการ
            // ตัวอย่าง: บันทึกแค่การเข้าชมซ้ำ (ถ้าต้องการ)
             await tx`
               INSERT INTO case_activity_logs
                 (case_id, changed_by_user_id, activity_type, comment)
               VALUES
                 (${case_id}, ${user_id}, 'COMMENT', ${`เจ้าหน้าที่ ${user_id} ${officerName} เข้าชมเคสซ้ำ (สถานะปัจจุบัน: ${oldStatus})`})
             `;
        }
        
        // ส่งผลลัพธ์จาก Step 3 (ข้อมูล is_viewed ที่อัปเดตแล้ว) กลับไป
        return updatedOrg[0]; 
      });

      
      console.log('Transaction successful, preparing response:', transactionResult); // <-- LOG 2
      // 2.5. Transaction สำเร็จ
      return new Response(JSON.stringify(transactionResult), { 
          status: 200, // 200 OK
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 2.6. จัดการ Error
      console.error("API Error (PATCH /view, Node.js):", error);
      let status = 500;
      let message = 'An error occurred processing your request.';

      if (error.message === 'Case not found') {
        status = 404;
        message = error.message;
      } else if (error.message === 'User (officer) not found') {
        status = 400; // Bad Request เพราะ user_id ที่ส่งมาไม่มีอยู่จริง
        message = error.message;
      } else if (error.message.includes('not assigned')) {
          status = 404; // Not Found เพราะเคสนี้ไม่ได้มอบหมายให้ org นี้
          message = error.message;
      } else if (error.message.includes('violates foreign key constraint')) {
          status = 400; // Bad Request เพราะข้อมูลอ้างอิงผิดพลาด
          message = 'Invalid data provided. Ensure case_id, organization_id, and user_id exist and are valid.';
      }

      return new Response(JSON.stringify({ message: message, error: error.message }), { 
          status: status, 
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