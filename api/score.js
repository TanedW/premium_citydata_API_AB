//api/score:

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

// --- Helper Function: บันทึก Log (เหมือนเดิม) ---
async function saveUserLog(sql, logData) {
  const { userId, actionType, provider, ipAddress, userAgent, status, description } = logData;
  try {
    await sql`
      INSERT INTO user_logs 
        (user_id, action_type, provider, ip_address, user_agent, status, description)
      VALUES
        (${userId}, ${actionType}, ${provider}, ${ipAddress}, ${userAgent}, ${status}, ${description});
    `;
    console.log(`Log saved: User ${userId}, Action: ${actionType}, Status: ${status}`);
  } catch (logError) {
    console.error("--- LOGGING FAILED ---", {
      message: "Failed to save log",
      error: logError.message,
      data: logData,
    });
  }
}

// --- CORS Headers (เหมือนเดิม) ---
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <-- URL ของ React App
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // <-- เพิ่ม GET
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- Main API Handler ---
export default async function handler(req) {
  // 1. ตอบกลับ CORS Preflight (OPTIONS request)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);
  const forwarded = req.headers.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : null;
  const userAgent = req.headers.get('user-agent') || null;

  // -----------------------------------------------------------------
  // --- [POST] - สร้าง Rating ใหม่ ---
  // -----------------------------------------------------------------
  if (req.method === 'POST') {
    let logUserId = null;       // ID ของผู้ใช้ที่ยืนยันตัวตนแล้ว
    let logStatus = 'UNKNOWN';
    let logDescription = null;

    try {
      // 2. ยืนยันตัวตน (Mandatory)
      const authHeader = req.headers.get('authorization');
      const accessToken = (authHeader && authHeader.startsWith('Bearer ')) 
        ? authHeader.split(' ')[1] 
        : null;

      if (!accessToken) {
        logStatus = 'FAILED_AUTH_NO_TOKEN';
        return new Response(JSON.stringify({ message: 'Authorization token required' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const userResult = await sql`SELECT user_id FROM users WHERE "access_token" = ${accessToken}`;
      
      if (userResult.length === 0) {
        logStatus = 'FAILED_AUTH_INVALID_TOKEN';
        return new Response(JSON.stringify({ message: 'Invalid or expired token' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      // ยืนยันตัวตนสำเร็จ
      logUserId = userResult[0].user_id;

      // 3. ดึงข้อมูลจาก Body
      let body;
      try {
        body = await req.json();
      } catch (bodyError) {
        logStatus = 'FAILED_BAD_REQUEST_BODY';
        logDescription = `Failed to parse JSON body: ${bodyError.message}`;
        // Log ก่อนส่ง
        await saveUserLog(sql, {
          userId: logUserId, actionType: 'CREATE_RATING', provider: null, 
          ipAddress, userAgent, status: logStatus, description: logDescription
        });
        return new Response(JSON.stringify({ message: 'Invalid JSON body' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const { issue_case_id, score, comment } = body;

      // 4. ตรวจสอบข้อมูล (Validation)
      if (!issue_case_id || !score) {
        logStatus = 'FAILED_VALIDATION';
        logDescription = 'Missing issue_case_id or score';
        await saveUserLog(sql, {
          userId: logUserId, actionType: 'CREATE_RATING', provider: null, 
          ipAddress, userAgent, status: logStatus, description: logDescription
        });
        return new Response(JSON.stringify({ message: logDescription }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (typeof score !== 'number' || score < 1 || score > 5) {
        logStatus = 'FAILED_VALIDATION';
        logDescription = `Invalid score: ${score}. Must be a number 1-5.`;
        await saveUserLog(sql, {
          userId: logUserId, actionType: 'CREATE_RATING', provider: null, 
          ipAddress, userAgent, status: logStatus, description: logDescription
        });
        return new Response(JSON.stringify({ message: logDescription }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // 5. บันทึกข้อมูลลง DB
      // (เราใช้ logUserId ที่ได้จาก Token, ไม่เชื่อ user_id จาก body)
      const newRatingResult = await sql`
        INSERT INTO case_ratings (issue_case_id, user_id, score, comment)
        VALUES (${issue_case_id}, ${logUserId}, ${score}, ${comment || null})
        RETURNING *;
      `;
      
      const newRating = newRatingResult[0];
      logStatus = 'SUCCESS';
      logDescription = `Rating created with ID: ${newRating.id} for case: ${issue_case_id}`;
      
      // 6. บันทึก Log สำเร็จ
      await saveUserLog(sql, {
        userId: logUserId, actionType: 'CREATE_RATING', provider: null, 
        ipAddress, userAgent, status: logStatus, description: logDescription
      });
      
      // 7. ส่งข้อมูลที่สร้างสำเร็จกลับไป (201 Created)
      return new Response(JSON.stringify(newRating), { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (error) {
      console.error("--- RATING API CRITICAL ERROR (POST) ---", error);
      logStatus = 'FAILED_SERVER_ERROR';
      logDescription = error.message;

      // พยายาม Log error ครั้งสุดท้าย (ถ้าเรามียืนยันตัวตนแล้ว)
      if (logUserId) {
        await saveUserLog(sql, {
          userId: logUserId, actionType: 'CREATE_RATING', provider: null, 
          ipAddress, userAgent, status: logStatus, description: logDescription
        });
      }
      
      return new Response(JSON.stringify({ message: 'An internal error occurred', error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  }

  // -----------------------------------------------------------------
  // --- [GET] - ดึง Rating ของเคส ---
  // -----------------------------------------------------------------
  if (req.method === 'GET') {
    try {
        // ดึง issue_case_id จาก query parameter
        // เช่น /api/ratings?case_id=123
        const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
        const caseId = searchParams.get('case_id');

        if (!caseId) {
            return new Response(JSON.stringify({ message: 'Missing case_id query parameter' }), { 
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // ดึงข้อมูล Rating ทั้งหมดของเคสนั้น
        // และคำนวณ AVG ไปเลย
        const result = await sql`
            SELECT 
                AVG(score) AS average_score, 
                COUNT(*) AS total_ratings,
                (SELECT score FROM case_ratings WHERE issue_case_id = ${caseId} ORDER BY created_at DESC LIMIT 1) as latest_score
            FROM case_ratings 
            WHERE issue_case_id = ${caseId};
        `;
        
        const ratingData = result[0];
        
        // ถ้ายังไม่มีใครให้คะแนน (count = 0), AVG จะเป็น null
        // เราควรปรับให้เป็น 0 หรือค่าที่เหมาะสม
        if (ratingData.total_ratings === "0") {
             return new Response(JSON.stringify({
                average_score: 0,
                total_ratings: 0,
                latest_score: null
             }), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }
        
        // แปลงค่า (neon-serverless คืนค่าเป็น string)
        ratingData.average_score = parseFloat(ratingData.average_score);
        ratingData.total_ratings = parseInt(ratingData.total_ratings, 10);
        ratingData.latest_score = parseInt(ratingData.latest_score, 10);

        return new Response(JSON.stringify(ratingData), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error("--- RATING API CRITICAL ERROR (GET) ---", error);
        return new Response(JSON.stringify({ message: 'An internal error occurred', error: error.message }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }
  }

  // 3. ตอบกลับหากใช้ Method อื่น (นอกจาก GET, POST, OPTIONS)
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
    status: 405, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  });
}