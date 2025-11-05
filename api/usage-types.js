// ไฟล์: /api/usage-types.js

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // 3. Query ข้อมูลจากตาราง usage_types
    const query = `
      SELECT 
        usage_type_id AS value, 
        type_label AS label 
      FROM usage_types 
      ORDER BY type_label;
    `;
    
    const { rows } = await pool.query(query);

    // 4. ส่งข้อมูลกลับเป็น JSON
    //    ผลลัพธ์จะเป็น: [{ value: "uuid-...", label: "กู้ภัย" }, ...]
    return res.status(200).json(rows);

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}