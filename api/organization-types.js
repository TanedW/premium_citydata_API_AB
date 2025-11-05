// ไฟล์: /api/organization-types.js

import { Pool } from 'pg';

// 1. สร้าง Pool เชื่อมต่อโดยดึง Connection String จาก Vercel Env
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false, // จำเป็นสำหรับ Neon.tech
  },
});

export default async function handler(req, res) {
  // 2. จำกัดให้รับเฉพาะ GET method
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // 3. Query ข้อมูล
    //    - เลือก org_type_id (UUID) มาเป็น "value"
    //    - เลือก type_label (TEXT) มาเป็น "label"
    //    - เรียงตามตัวอักษรเพื่อความสวยงาม
    const query = `
      SELECT 
        org_type_id AS value, 
        type_label AS label 
      FROM organization_types 
      ORDER BY type_label;
    `;
    
    const { rows } = await pool.query(query);

    // 4. ส่งข้อมูลกลับเป็น JSON
    //    ผลลัพธ์จะเป็น: [{ value: "uuid-...", label: "ภาครัฐ" }, ...]
    return res.status(200).json(rows);

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}