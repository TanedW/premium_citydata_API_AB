/**
 * Vercel Serverless Function - Reverse Geocoder
 * * รับ lat, lon จาก query string และแปลงเป็นที่อยู่
 * โดยใช้ Longdo Map API (ซึ่งแม่นยำสำหรับประเทศไทย)
 * * Path: /api/reverse-geocode
 * Example Call: /api/reverse-geocode?lat=13.7563&lon=100.5018
 */
export default async function handler(req, res) {
  // 1. ดึงพิกัดจาก query string
  const { lat, lon } = req.query;
  
  // 2. ดึง API Key จาก Environment Variables
  // คุณต้องตั้งค่า LONGDO_API_KEY ใน Vercel project settings
  const apiKey = process.env.LONGDO_API_KEY;

  // 3. ตรวจสอบความพร้อม
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat or lon parameters' });
  }

  if (!apiKey) {
    console.error("LONGDO_API_KEY is not set.");
    return res.status(500).json({ error: 'API key is not configured on server' });
  }

  // 4. สร้าง URL สำหรับเรียก Longdo API
  const longdoUrl = `https://api.longdo.com/map/services/address?lon=${lon}&lat=${lat}&key=${apiKey}`;

  try {
    // 5. เรียก API ภายนอก (Longdo)
    const longdoRes = await fetch(longdoUrl);
    
    if (!longdoRes.ok) {
      throw new Error(`Longdo API failed with status ${longdoRes.status}`);
    }

    const data = await longdoRes.json();

    // 6. Longdo จะคืนค่าเป็น { "province": "...", "district": "...", "subdistrict": "..." }
    // เราปรับ key "subdistrict" ให้ตรงกับ state ของเรา "sub_district"
    const formattedData = {
      province: data.province || '',
      district: data.district || '',
      sub_district: data.subdistrict || '', // Longdo ใช้ 'subdistrict' (ไม่มี gạch)
    };

    // 7. ส่งข้อมูลที่แปลงแล้วกลับไปให้ React
    // ตั้งค่า Cache Control เพื่อให้ Vercel cache ผลลัพธ์นี้ไว้ซักครู่
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(formattedData);

  } catch (error) {
    console.error("Reverse geocode error:", error.message);
    res.status(500).json({ error: 'Failed to fetch address data' });
  }
}
