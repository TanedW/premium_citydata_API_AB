export const config = {
  runtime: 'nodejs', // <--- ระบุ 'nodejs' โดยตรง
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
      const { id: case_id } = req.query; 

      // 2.2. ดึง ID ของหน่วยงาน (Integer) และ ID ของเจ้าหน้าที่ (Integer)
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

      console.log('Starting manual transaction...'); // <-- LOG 1

      // 2.4. !!! เริ่ม Transaction (แบบ Manual) !!!
      
      let transactionResult; // ประกาศตัวแปรสำหรับผลลัพธ์นอก try...catch

      // ใช้ try...catch ซ้อนกันเพื่อจัดการ Rollback
      try {
        
        // 1. เริ่ม Transaction
        await sql`BEGIN`;

        // Step 1: ดึงข้อมูลเก่า (สถานะเก่า)
        // (สำคัญ: เปลี่ยน 'tx' ทั้งหมดเป็น 'sql' เพราะเราใช้ connection หลัก)
        const oldCase = await sql`SELECT status FROM issue_cases WHERE issue_cases_id = ${case_id}`;
        if (oldCase.length === 0) throw new Error('Case not found');
        const oldStatus = oldCase[0].status;
        
        // Step 2: ดึงชื่อเจ้าหน้าที่
        const officer = await sql`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}`;
        if (officer.length === 0) throw new Error('User (officer) not found');
        
        const officerName = `${officer[0].first_name || ''} ${officer[0].last_name || ''}`.trim();
        const comment = `เจ้าหน้าที่เข้าชมเคส โดย ${user_id} ${officerName}`; // คอมเมนต์ Log

        // Step 3: อัปเดตตาราง 'case_organizations' (ตั้งค่า is_viewed = true)
        const updatedOrg = await sql`
          UPDATE case_organizations
          SET is_viewed = true
          WHERE case_id = ${case_id} AND organization_id = ${organization_id}
          RETURNING *; 
        `;

        // ตรวจสอบว่ามีแถวถูกอัปเดตหรือไม่
        if (updatedOrg.length === 0) {
          throw new Error('This case might not be assigned to this organization, or the record does not exist.');
        }
        
        // เก็บผลลัพธ์ไว้ส่งกลับ
        transactionResult = updatedOrg[0];

        // Step 4: อัปเดตตาราง 'issue_cases' (เปลี่ยน status)
        let statusUpdated = false;
        if (oldStatus === 'รอรับเรื่อง') {
          await sql`
            UPDATE issue_cases
            SET status = ${newStatus}, updated_at = now()
            WHERE issue_cases_id = ${case_id}
          `;
          statusUpdated = true;
        }
        
        // Step 5: บันทึกประวัติลง 'case_activity_logs'
        if (statusUpdated) {
          // บันทึก Log การเปลี่ยนสถานะ
          await sql`
            INSERT INTO case_activity_logs 
              (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
            VALUES 
              (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment})
          `;
        } else {
            // บันทึก Log การเข้าชมซ้ำ (กรณีสถานะไม่เปลี่ยน)
             await sql`
               INSERT INTO case_activity_logs
                 (case_id, changed_by_user_id, activity_type, comment)
               VALUES
                 (${case_id}, ${user_id}, 'COMMENT', ${`เจ้าหน้าที่ ${user_id} ${officerName} เข้าชมเคสซ้ำ (สถานะปัจจุบัน: ${oldStatus})`})
             `;
        }
        
        // 2. ถ้าทุกอย่างสำเร็จ ให้ COMMIT
        await sql`COMMIT`;
        
        console.log('Transaction committed successfully.'); // <-- LOG 2

      } catch (innerError) {
        // 3. ถ้ามี Error (ใน try ด้านบน) ให้ ROLLBACK
        console.error("Transaction Error, Rolling back:", innerError.message);
        await sql`ROLLBACK`;
        
        // ส่ง Error ที่เกิดขึ้นภายใน Transaction ออกไปให้ catch ด้านนอกจัดการ
        throw innerError; 
      }
      
      // 2.5. Transaction สำเร็จ
      return new Response(JSON.stringify(transactionResult), { 
          status: 200, // 200 OK
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 2.6. จัดการ Error (ทั้ง Error การเชื่อมต่อ หรือ Error จาก Transaction)
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