/**
 * Vercel Serverless Function - /api/GPS
 * * This file is the BACKEND API. It receives (lat, lon) and returns
 * a Thai address using Longdo Map's Reverse Geocoding service.
 * * It also includes critical CORS headers to allow requests from
 * your React application (both on localhost and production).
 */
export default async function handler(req, res) {

  // ==================================================================
  // 1. CRITICAL: CORS Configuration
  // ==================================================================
  
  // Define the list of origins (websites) allowed to access this API
  const allowedOrigins = [
    'http://localhost:3000',                 // Your React app on your computer
    'https://demo-premium-citydata-pi.vercel.app' // Your production React app
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    // If the request is from an allowed origin, set the header to that origin
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  // Set other necessary CORS headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle the 'preflight' request (browser checks if it's safe to send)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================================================================
  // 2. API Core Logic: Reverse Geocoding
  // ==================================================================

  try {
    // 2.1. Get lat/lon from the query string
    const { lat, lon } = req.query;

    // 2.2. Get the Longdo API Key from Vercel Environment Variables
    // !! YOU MUST SET THIS in your Vercel project settings !!
    const apiKey = process.env.LONGDO_API_KEY;

    // 2.3. Input Validation (This prevents 500 Errors)
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing lat or lon parameters' });
    }

    if (!apiKey) {
      console.error("!!! FATAL: LONGDO_API_KEY is not set in Vercel Environment Variables.");
      return res.status(500).json({ error: 'API key is not configured on server' });
    }

    // 2.4. Fetch data from the external Longdo Map API
    const longdoUrl = `https://api.longdo.com/map/services/address?lon=${lon}&lat=${lat}&key=${apiKey}`;
    
    const longdoRes = await fetch(longdoUrl);

    if (!longdoRes.ok) {
      throw new Error(`Longdo API failed with status ${longdoRes.status}`);
    }

    const data = await longdoRes.json();

    // 2.5. Format the data to match what CreateOrg.js expects
    // Note: Longdo returns 'subdistrict', but your React state uses 'sub_district'
    const formattedData = {
      province: data.province || '',
      district: data.district || '',
      sub_district: data.subdistrict || '', // Map 'subdistrict' to 'sub_district'
    };

    // 2.6. Success! Send the formatted address back to React
    res.status(200).json(formattedData);

  } catch (error) {
    // 2.7. Catch any errors (like fetch failing) and return a 500 status
    console.error("Error in /api/GPS:", error.message);
    res.status(500).json({ error: 'Failed to fetch address data', details: error.message });
  }
}
