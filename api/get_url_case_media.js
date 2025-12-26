// api/get_url_case_media.js

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Regex สำหรับตรวจสอบรูปแบบ UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      const { searchParams } = new URL(req.url);
      const case_id = searchParams.get('case_id');

      // 1. ตรวจสอบว่ามีค่า และ รูปแบบถูกต้องตาม UUID หรือไม่
      if (!case_id || !UUID_REGEX.test(case_id)) {
        return new Response(JSON.stringify({ message: 'Invalid or missing case_id (UUID required)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Query (ใส่ค่า UUID ลงไปได้เลย)
      const result = await sql`
        SELECT url 
        FROM case_media 
        WHERE case_id = ${case_id}
      `;

      const urls = result.map(row => row.url);

      return new Response(JSON.stringify(urls), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("Database Error:", error);
      return new Response(JSON.stringify({ message: 'Fetch Media Failed', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
}