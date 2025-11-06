/**
 * Vercel Serverless Function - /api/GPS
 * * This file is the BACKEND API. It receives (lat, lon) and returns
 * a Thai address using Nominatim (OpenStreetMap).
 * * It also includes critical CORS headers to allow requests from
 * your React application.
 */
export default async function handler(req, res) {

  // ==================================================================
  // 1. CRITICAL: CORS Configuration (ส่วนนี้เหมือนเดิม)
  // ==================================================================
  
  const allowedOrigins = [
    'http://localhost:3000',
    'https://demo-premium-citydata-pi.vercel.app'
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================================================================
  // 2. API Core Logic: Reverse Geocoding (ส่วนนี้แก้ไขใหม่)
  // ==================================================================

  try {
    // 2.1. Get lat/lon from the query string
    const { lat, lon } = req.query;

    // 2.2. Input Validation (ลบส่วน API Key ออก)
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing lat or lon parameters' });
    }
    
    // 2.3. สร้าง URL สำหรับ Nominatim (OSM)
    //    format=jsonv2 -> ขอ JSON รูปแบบใหม่
    //    accept-language=th -> พยายามขอผลลัพธ์ภาษาไทย
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=th`;
    
    // 2.4. Fetch data from the external Nominatim API
    //    !! สำคัญมาก: ต้องเพิ่ม headers และ 'User-Agent' !!
    const nominatimRes = await fetch(nominatimUrl, {
      method: 'GET',
      headers: {
        // !! เปลี่ยน "IncidentReportApp/1.0 (youremail@example.com)" !!
        // !! เป็นชื่อแอปและอีเมลของคุณ (จำเป็นตามนโยบาย Nominatim) !!
        'User-Agent': 'demopremiumcitydata/1.0 (taned.wo@gmail.com)'
      }
    });

    if (!nominatimRes.ok) {
      // ถ้าโดนบล็อก (เช่น 403 Forbidden) มักเป็นเพราะ User-Agent
      console.error(`Nominatim API failed with status ${nominatimRes.status}`);
      return res.status(nominatimRes.status).json({ 
        error: 'Nominatim API request failed', 
        status: nominatimRes.status 
      });
    }

    const data = await nominatimRes.json();
    const address = data.address || {};

    // 2.5. Format the data to match what CreateOrg.js expects (ส่วนที่ท้าทาย)
    //    นี่คือการ "เดา" ค่า จังหวัด/อำเภอ/ตำบล จากโครงสร้างของ OSM
    //    คุณอาจต้องปรับแก้ส่วนนี้หลังจากทดสอบจริง
    
    // OSM 'state' มักจะเป็น 'จังหวัด'
    const province = address.state || ''; 

    // 'อำเภอ' อาจจะเป็น 'city', 'county', หรือ 'city_district'
    const district = address.city || address.county || address.city_district || '';

    // 'ตำบล' อาจจะเป็น 'suburb', 'village', หรือ 'town'
    const sub_district = address.suburb || address.village || address.town || '';

    const formattedData = {
      province: province,
      district: district,
      sub_district: sub_district,
    };

    // 2.6. Success! Send the formatted address back to React
    res.status(200).json(formattedData);

  } catch (error) {
    // 2.7. Catch any errors
    console.error("Error in /api/GPS:", error.message);
    res.status(500).json({ error: 'Failed to fetch address data', details: error.message });
  }
}