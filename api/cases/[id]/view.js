// /api/cases/[id]/view.js
// (!!! สำคัญ !!!)
// เราได้ลบ 'export const config = { runtime: 'edge' };' ออกไปแล้ว
// เพื่อให้ Vercel ใช้ Node.js Runtime ซึ่งรองรับ Transaction ที่ซับซ้อนได้

import { neon } from '@neondatabase/serverless';

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // URL ของ React App
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS', // อนุญาต PATCH (สำหรับอัปเดต)
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};


// The main API handler function
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
      // (สำคัญ!) Vercel Node.js runtime จะอ่าน URL จาก 'req.query'
      const { id: case_id } = req.query; // เช่น /api/cases/UUID/view -> case_id = UUID

      // 2.2. ดึง ID ของหน่วยงาน (Integer) และ ID ของเจ้าหน้าที่ (Integer)
      body = await req.json();
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
      
      const newStatus = 'กำลังประสานงาน'; // สถานะใหม่ตามที่คุณต้องการ

      // 2.4. !!! เริ่ม Transaction (แบบ Node.js) !!!
      const transactionResult = await sql.transaction(async (tx) => {
        
        // Step 1: ดึงข้อมูลเก่า (สถานะเก่า และ ชื่อเจ้าหน้าที่)
        // (เรารัน 2 query นี้พร้อมกันเพื่อความเร็ว)
        const [oldCase, officer] = await Promise.all([
          tx`SELECT status FROM issue_cases WHERE issue_cases_id = ${case_id}`,
          tx`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}` 
          // (!!!) แก้ 'first_name', 'last_name' ถ้าตาราง users ของคุณใช้ชื่ออื่น
        ]);

        // (Error Handling)
        if (oldCase.length === 0) throw new Error('Case not found');
        if (officer.length === 0) throw new Error('User (officer) not found');
        
        const oldStatus = oldCase[0].status;
        const officerName = `${officer[0].first_name || ''} ${officer[0].last_name || ''}`.trim();
        const comment = `เจ้าหน้าที่เข้าชมเคส โดย ${user_id} ${officerName}`; // คอมเมนต์ตามที่คุณต้องการ

        // Step 2: อัปเดตตาราง 'case_organizations' (ตั้งค่า is_viewed = true)
        const updatedOrg = await tx`
          UPDATE case_organizations
          SET is_viewed = true
          WHERE case_id = ${case_id} AND organization_id = ${organization_id}
          RETURNING *; 
        `;

        if (updatedOrg.length === 0) {
          throw new Error('This case is not assigned to this organization.');
        }

        // Step 3: อัปเดตตาราง 'issue_cases' (ตั้งค่า status = 'กำลังประสานงาน')
        await tx`
          UPDATE issue_cases
          SET status = ${newStatus}, updated_at = now()
          WHERE issue_cases_id = ${case_id}
        `;
        
        // Step 4: บันทึกประวัติลง 'case_activity_logs'
        await tx`
          INSERT INTO case_activity_logs 
            (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
          VALUES 
            (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment})
        `;
        
        return updatedOrg[0]; // ส่งผลลัพธ์จาก Step 2 กลับไป
      });
      
      // 2.5. Transaction สำเร็จ
      return new Response(JSON.stringify(transactionResult), { 
          status: 200, // 200 OK
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 2.6. จัดการ Error
      console.error("API Error (PATCH /view):", error);
      
      let status = 500;
      if (error.message.includes('not found')) status = 404;
      if (error.message.includes('not assigned')) status = 404;

      return new Response(JSON.stringify({ message: error.message }), { 
          status: status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // --- 3. Handle any other HTTP methods ---
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}

