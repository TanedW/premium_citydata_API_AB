// /api/cases/[id]/view.js
// (!!! สำคัญ !!!)
// รันบน Node.js Runtime (ไม่มี config)

import { neon } from '@neondatabase/serverless';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};


export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'PATCH') {
    const sql = neon(process.env.DATABASE_URL);
    let body;

    try {
      const { id: case_id } = req.query; 

      // -----------------------------------------------------------
      // (!!! นี่คือจุดที่แก้ไข !!!)
      // เปลี่ยนจาก 'await req.json()' เป็น 'req.body'
      body = req.body;
      // -----------------------------------------------------------

      const { organization_id, user_id } = body;

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
      
      const newStatus = 'กำลังประสานงาน'; 

      const transactionResult = await sql.transaction(async (tx) => {
        
        const [oldCase, officer] = await Promise.all([
          tx`SELECT status FROM issue_cases WHERE issue_cases_id = ${case_id}`,
          tx`SELECT first_name, last_name FROM users WHERE user_id = ${user_id}` 
        ]);

        if (oldCase.length === 0) throw new Error('Case not found');
        if (officer.length === 0) throw new Error('User (officer) not found');
        
        const oldStatus = oldCase[0].status;
        const officerName = `${officer[0].first_name || ''} ${officer[0].last_name || ''}`.trim();
        const comment = `เจ้าหน้าที่เข้าชมเคส โดย ${user_id} ${officerName}`; 

        const updatedOrg = await tx`
          UPDATE case_organizations
          SET is_viewed = true
          WHERE case_id = ${case_id} AND organization_id = ${organization_id}
          RETURNING *; 
        `;

        if (updatedOrg.length === 0) {
          throw new Error('This case is not assigned to this organization.');
        }

        await tx`
          UPDATE issue_cases
          SET status = ${newStatus}, updated_at = now()
          WHERE issue_cases_id = ${case_id}
        `;
        
        await tx`
          INSERT INTO case_activity_logs 
            (case_id, changed_by_user_id, activity_type, old_value, new_value, comment)
          VALUES 
            (${case_id}, ${user_id}, 'STATUS_CHANGE', ${oldStatus}, ${newStatus}, ${comment})
        `;
        
        return updatedOrg[0]; 
      });
      
      return new Response(JSON.stringify(transactionResult), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
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

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}

