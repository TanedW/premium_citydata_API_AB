//api/stats/overview: 

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://demo-premium-citydata-pi.vercel.app',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    const sql = neon(process.env.DATABASE_URL);

    try {
      const authHeader = req.headers.get('authorization');
      const accessToken = (authHeader && authHeader.startsWith('Bearer '))
        ? authHeader.split(' ')[1]
        : null;

      if (!accessToken) {
        return new Response(JSON.stringify({ message: 'Authorization token required' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const userResult = await sql`SELECT user_id FROM users WHERE "access_token" = ${accessToken}`;

      if (userResult.length === 0) {
        return new Response(JSON.stringify({ message: 'Invalid or expired token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { searchParams } = new URL(req.url, `https:${req.headers.host}`);
      const organizationId = searchParams.get('organization_id');

      if (!organizationId) {
        return new Response(JSON.stringify({ message: 'organization_id query parameter is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const statsResult = await sql`
        SELECT 
          ic.status, 
          COUNT(ic.issue_cases_id) AS count
        FROM 
          issue_cases ic
        JOIN 
          case_organizations co ON ic.issue_cases_id = co.case_id
        WHERE 
          co.organization_id = ${organizationId}
        GROUP BY 
          ic.status;
      `;

      return new Response(JSON.stringify(statsResult), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error("--- STATS OVERVIEW API ERROR ---", error);
      return new Response(JSON.stringify({ message: 'An internal error occurred', error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ message: `Method ${req.method} Not Allowed` }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}