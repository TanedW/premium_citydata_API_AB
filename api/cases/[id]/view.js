// /api/cases/[id]/view.js

export const config = {
  runtime: 'nodejs',
};
import { neon } from '@neondatabase/serverless';

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- ★ แก้ไขตรงนี้: เปลี่ยนลายเซ็นเป็น (req, res) ---
export default async function handler(req, res) { 
  
  // --- 1. Respond to OPTIONS (Preflight) request ---
  if (req.method === 'OPTIONS') {
    const headers = {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    res.writeHead(204, headers);
    return res.end();
  }

  // --- 2. Main logic for HTTP PATCH ---
  if (req.method === 'PATCH') {
    const sql = neon(process.env.DATABASE_URL);
    
    try {
      const { id: case_id } = req.query; 
      const { organization_id, user_id } = req.body;

      // 2.3. ตรวจสอบข้อมูล
      if (!case_id || !organization_id || !user_id) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(400).json({ message: 'Missing required fields...' });
      }
      
      if (typeof organization_id !== 'number' || !Number.isInteger(organization_id) ||
          typeof user_id !== 'number' || !Number.isInteger(user_id)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
         return res.status(400).json({ message: 'Invalid format: organization_id and user_id must be integers.' });
      }
      
      const newStatus = 'กำลังประสานงาน';

      console.log('Starting manual transaction...'); 

      let transactionResult; 

      try {
        await sql`BEGIN`;

        // Step 1: ดึงข้อมูลเก่า (เติม public.)
        const oldCase = await sql`SELECT status FROM public.issue_cases WHERE issue_cases_id = ${case_id}`;
        if (oldCase.length === 0) throw new Error('Case not found');
        const oldStatus = oldCase[0].status;
        
        // Step 2: ดึงชื่อเจ้าหน้าที่ (เติม public.)
        const officer = await sql`SELECT first_name, last_name FROM public.users WHERE user_id = ${user_id}`;
        if (officer.length === 0) throw new Error('User (officer) not found');
        
        const officerName = `${officer[0].first_name || ''} ${officer[0].last_name || ''}`.trim();
        const comment = `เจ้าหน้าที่เข้าชมเคส โดย ${user_id} ${officerName}`; 

        // Step 3: อัปเดต 'case_organizations' (เติม public.)
        const updatedOrg = await sql`
          UPDATE public.case_organizations
          SET is_viewed = true
          WHERE case_id = ${case_id} AND organization_id = ${organization_id}
          RETURNING *; 
        `;

        if (updatedOrg.length === 0) {
          throw new Error('This case might not be assigned to this organization, or the record does not exist.');
        }
        
        transactionResult = updatedOrg[0];

        // Step 4: อัปเดต 'issue_cases' (เติม public.)
        let statusUpdated = false;
        if (oldStatus === 'รอรับเรื่อง') {
          await sql`
            UPDATE public.issue_cases
            SET status = ${newStatus}, updated_at = now()
            WHERE issue_cases_id = ${case_id}
          `;
          statusUpdated = true;
        }
        
        // Step 5: บันทึก 'case_activity_logs' (เติม public.)
        if (statusUpdated) {
          await sql`
            INSERT INTO public.case_activity_logs 
              (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
            VALUES 
              (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment})
          `;
        } else {
             await sql`
               INSERT INTO public.case_activity_logs
                 (case_id, changed_by_user_id, activity_type, comment)
               VALUES
                 (${case_id}, ${user_id}, 'COMMENT', ${`เจ้าหน้าที่ ${user_id} ${officerName} เข้าชมเคสซ้ำ (สถานะปัจจุบัน: ${oldStatus})`})
             `;
        }
        
        await sql`COMMIT`;
        console.log('Transaction committed successfully.');

      } catch (innerError) {
        console.error("Transaction Error, Rolling back:", innerError.message);
        await sql`ROLLBACK`;
        throw innerError; 
      }
      
      // 2.5. Transaction สำเร็จ
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(200).json(transactionResult);

    } catch (error) {
      // 2.6. จัดการ Error
      console.error("API Error (PATCH /view, Node.js):", error);
      let status = 500;
      let message = 'An error occurred processing your request.';

      if (error.message === 'Case not found') status = 404;
      else if (error.message === 'User (officer) not found') status = 400;
      else if (error.message.includes('not assigned')) status = 404;
      else if (error.message.includes('violates foreign key constraint')) status = 400;
      
      if (status !== 500) message = error.message;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(status).json({ message: message, error: error.message });
    }
  }

  // --- 3. Handle any other HTTP methods ---
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}