// /api/users.js

// Use Vercel's Edge Runtime for optimal performance
export const config = {
  runtime: 'edge',
};

import { neon } from '@neondatabase/serverless';

// Define CORS Headers to allow your React App to call this API
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app', // <-- Your React App's URL
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * A dedicated function to save login logs.
 * This keeps the main handler clean and handles logging errors gracefully.
 * @param {object} sql - The neon sql instance.
 * @param {object} logData - The data to be logged.
 */
async function saveLoginLog(sql, logData) {
  const { userId, provider, ipAddress, userAgent, status } = logData;
  try {
    await sql`
      INSERT INTO user_logs 
        (user_id, action_type, provider, ip_address, user_agent, status)
      VALUES
        (${userId}, 'LOGIN', ${provider}, ${ipAddress}, ${userAgent}, ${status});
    `;
  } catch (logError) {
    // If logging fails, just log the error to the console
    // but do not crash the main API request.
    console.error("Failed to save log:", logError);
  }
}

// The main API handler function
export default async function handler(req) {
  // Respond to the 'OPTIONS' (Preflight) request sent by browsers to check CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Main logic for HTTP POST (when a user logs in) ---
  if (req.method === 'POST') {
    // Get the user's real IP address from the x-forwarded-for header
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0].trim() : null;
    
    // Get the user's browser/device information
    const userAgent = req.headers.get('user-agent') || null;
    
    // Declare variables outside the try block to use them in the catch block
    let email, provider;

    try {
      // 1. Get user data sent from the frontend
      const body = await req.json();
      email = body.email;
      provider = body.provider;
      const { first_name, last_name, access_token } = body;
      
      const sql = neon(process.env.DATABASE_URL);

      // 2. Check if a user with this email already exists
      const existingUser = await sql`SELECT * FROM users WHERE "email" = ${email}`;

      if (existingUser.length > 0) {
        // --- Case 1: User exists -> Update their info ---
        const user = existingUser[0];
        const providerExists = user.providers && user.providers.includes(provider);

        const updatedUser = await sql`
            UPDATE users SET 
              "access_token" = ${access_token}, 
              "last_name" = ${last_name}, 
              "first_name" = ${first_name},
              -- Append the new provider to the array only if it doesn't already exist
              providers = CASE 
                            WHEN ${providerExists} = TRUE THEN providers 
                            ELSE array_append(providers, ${provider}) 
                          END
            WHERE "email" = ${email} 
            RETURNING *; -- Return the complete updated user object
          `;
        
        // Log the successful login event
        await saveLoginLog(sql, {
          userId: updatedUser[0].user_id,
          provider: provider,
          ipAddress: ipAddress,
          userAgent: userAgent,
          status: 'SUCCESS'
        });

        // Send the updated user data back to the frontend (Status 200 OK)
        return new Response(JSON.stringify(updatedUser[0]), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else {
        // --- Case 2: User does not exist -> Create a new one ---
        const newUser = await sql`
          INSERT INTO users ("email", "first_name", "last_name", "access_token", providers) 
          VALUES (${email}, ${first_name}, ${last_name}, ${access_token}, ARRAY[${provider}]) 
          RETURNING *; -- Return the complete new user object
        `;
        
        // Log the successful registration/login event
        await saveLoginLog(sql, {
          userId: newUser[0].user_id,
          provider: provider,
          ipAddress: ipAddress,
          userAgent: userAgent,
          status: 'SUCCESS'
        });

        // Send the new user data back to the frontend (Status 201 Created)
        return new Response(JSON.stringify(newUser[0]), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      // Handle any unexpected errors
      console.error("API Error:", error);

      // Attempt to log the failed login attempt
      const sql = neon(process.env.DATABASE_URL);
      await saveLoginLog(sql, {
        userId: null, // No user_id because the process failed
        provider: provider, // We might have the provider info
        ipAddress: ipAddress,
        userAgent: userAgent,
        status: 'FAILED'
      });

      // Return a generic error message
      return new Response(JSON.stringify({ message: 'An error occurred', error: error.message }), { 
          status: 500, 
          headers: corsHeaders 
      });
    }
  }

  // Handle any other HTTP methods
  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), { 
      status: 405, 
      headers: corsHeaders 
  });
}