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

export default async function handler(req) {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      // 2. รับค่า case_id จาก URL (เช่น ?case_id=123)
      const { searchParams } = new URL(req.url);
      const case_id = searchParams.get('case_id');

      // ตรวจสอบว่ามีการส่ง case_id มาหรือไม่
      if (!case_id) {
        return new Response(JSON.stringify({ message: 'Missing case_id parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3. Query ดึง URL จากตาราง case_media
      // เลือกเฉพาะ column 'url' (หรือเลือก * ถ้าต้องการข้อมูลอื่นด้วย เช่น type, filename)
      const result = await sql`
        SELECT url 
        FROM case_media 
        WHERE case_id = ${case_id}
      `;

      // 4. แปลงผลลัพธ์
      // ถ้าต้องการแค่ Array ของ URL strings: ['https://...', 'https://...']
      const urls = result.map(row => row.url);

      // (ทางเลือก) ถ้าต้องการส่งกลับเป็น Object เดิม ให้ใช้: const urls = result;

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