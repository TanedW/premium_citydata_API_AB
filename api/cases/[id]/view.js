// /api/cases/[id]/view.js
// (!!! นี่คือไฟล์ทดสอบชั่วคราว !!!)
// (!!! ไม่มี 'export const config' !!!)

// Define CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', 
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- ส่วนทดสอบ ---
  if (req.method === 'PATCH') {
    // พยายามเข้าถึงตัวแปรที่มีเฉพาะใน Node.js
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    const runtimeInfo = isNode ? `Node.js version: ${process.versions.node}` : 'Edge Runtime (or unknown)';

    console.log(`RUNTIME CHECK: ${runtimeInfo}`); // <-- Log นี้สำคัญมาก

    // ดึง ID เพื่อให้รู้ว่า Request ถูกต้อง
    const case_id = req.query ? req.query.id : 'ID not available in query (Likely Edge)'; 

    return new Response(JSON.stringify({ 
      message: 'Runtime Check Complete', 
      detectedRuntime: runtimeInfo,
      caseIdReceived: case_id 
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  // --- จบส่วนทดสอบ ---

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
    status: 405, headers: corsHeaders 
  });
}

