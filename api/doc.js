// api/doc.js
import express from 'express';
const app = express();

// --- 1. กำหนด Spec API ---
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'City Data API',
    version: '1.2.0', // Update Version
    description: 'API Documentation for City Data & Incident Management System',
  },
  servers: [
    {
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
      description: 'Production Server',
    },
  ],
  // --- Authentication ---
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    // --- SCHEMAS (เพิ่มใหม่ตรงนี้) ---
    schemas: {
      // 1. User Schema
      User: {
        type: 'object',
        required: ['email', 'provider', 'first_name', 'last_name'],
        properties: {
          user_id: { type: 'integer', example: 101 },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          first_name: { type: 'string', example: 'Somchai' },
          last_name: { type: 'string', example: 'Jaidee' },
          providers: { type: 'array', items: { type: 'string' }, example: ['google', 'facebook'] },
          access_token: { type: 'string', example: 'ya29.a0Aa...' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // 2. Organization Schema
      Organization: {
        type: 'object',
        required: ['organization_code', 'organization_name', 'admin_code'],
        properties: {
          id: { type: 'integer', example: 5 },
          organization_code: { type: 'string', example: 'BKK01' },
          organization_name: { type: 'string', example: 'Bangkok City Hall' },
          admin_code: { type: 'string', example: 'ADM-009' },
          org_type_id: { type: 'integer', example: 2 },
          usage_type_id: { type: 'integer', example: 1 },
          url_logo: { type: 'string', example: 'https://example.com/logo.png' },
          province: { type: 'string', example: 'Bangkok' },
          district: { type: 'string', example: 'Phra Nakhon' },
          sub_district: { type: 'string', example: 'Sao Chingcha' },
          contact_phone: { type: 'string', example: '02-123-4567' },
        },
      },
      // 3. Log Schema
      UserLog: {
        type: 'object',
        required: ['user_id', 'action_type'],
        properties: {
          user_id: { type: 'integer', example: 101 },
          action_type: { type: 'string', example: 'LOGIN' },
          provider: { type: 'string', example: 'google' },
          ip_address: { type: 'string', example: '192.168.1.1' },
          user_agent: { type: 'string', example: 'Mozilla/5.0...' },
          status: { type: 'string', example: 'SUCCESS' },
          details: { type: 'string', example: 'User logged in via Google' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // 4. Rating/Score Schema
      RatingInput: {
        type: 'object',
        required: ['issue_case_id', 'score'],
        properties: {
          issue_case_id: { type: 'integer', example: 50 },
          score: { type: 'number', minimum: 1, maximum: 5, example: 4 },
          comment: { type: 'string', example: 'Great service!' },
        },
      },
      ScoreStats: {
        type: 'object',
        properties: {
          average_score: { type: 'number', example: 4.5 },
          total_ratings: { type: 'integer', example: 120 },
          latest_score: { type: 'integer', example: 5, nullable: true },
        },
      },
      // 5. Address (GPS) Schema
      Address: {
        type: 'object',
        properties: {
          province: { type: 'string', example: 'Pathum Thani' },
          district: { type: 'string', example: 'Khlong Luang' },
          sub_district: { type: 'string', example: 'Khlong Nueng' },
        },
      },
      // 6. Dropdown Option Schema
      SelectOption: {
        type: 'object',
        properties: {
          value: { type: 'integer', example: 1 },
          label: { type: 'string', example: 'Government Agency' },
        },
      },
    },
  },
  paths: {
    // ==========================================
    // Group: Users & Auth
    // ==========================================
    '/api/users': {
      post: {
        summary: 'Login or Register User',
        tags: ['Authentication'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/User', // Reuse Schema
              },
            },
          },
        },
        responses: {
          '200': { description: 'User Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '201': { description: 'User Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        },
      },
    },
    '/api/logout': {
      post: {
        summary: 'Logout User',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { user_id: { type: 'integer' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Logout processed' },
        },
      },
    },
    '/api/user_logs': {
      post: {
        summary: 'Save User Log',
        tags: ['Logs'],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserLog' },
            },
          },
        },
        responses: {
          '201': { description: 'Log saved' },
        },
      },
    },

    // ==========================================
    // Group: Organizations
    // ==========================================
    '/api/organizations': {
      post: {
        summary: 'Create Organization',
        tags: ['Organizations'],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Organization' },
            },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Organization' } } } },
          '409': { description: 'Organization Code Exists' },
        },
      },
    },
    '/api/users_organizations': {
      get: {
        summary: 'Get User-Org Relationships',
        tags: ['Organizations'],
        parameters: [
          { name: 'user_id', in: 'query', schema: { type: 'integer' } },
          { name: 'organization_code', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
        },
      },
      post: {
        summary: 'Join Organization',
        tags: ['Organizations'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_id', 'organization_code'],
                properties: {
                  user_id: { type: 'integer' },
                  organization_code: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Joined' },
          '409': { description: 'Already Joined' },
        },
      },
    },
    '/api/organization-types': {
      get: {
        summary: 'Get Org Types',
        tags: ['Organizations'],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SelectOption' } } } } },
        },
      },
    },
    '/api/usage-types': {
      get: {
        summary: 'Get Usage Types',
        tags: ['Organizations'],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SelectOption' } } } } },
        },
      },
    },

    // ==========================================
    // Group: Scoring & Utils
    // ==========================================
    '/api/score': {
      get: {
        summary: 'Get Case Ratings',
        tags: ['Scoring'],
        parameters: [{ name: 'case_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScoreStats' } } } },
        },
      },
      post: {
        summary: 'Submit Rating',
        tags: ['Scoring'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RatingInput' },
            },
          },
        },
        responses: {
          '201': { description: 'Rating Created' },
        },
      },
    },
    '/api/stats/GPS': {
      get: {
        summary: 'Reverse Geocoding',
        tags: ['Utilities'],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Address Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Address' } } } },
        },
      },
    },
  },
};

// --- 2. HTML Template (บังคับโหลด CDN แก้ Error Vercel) ---
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>City Data API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.onload = function() {
        const ui = SwaggerUIBundle({
          spec: ${JSON.stringify(swaggerDocument)},
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [ SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset ],
          plugins: [ SwaggerUIBundle.plugins.DownloadUrl ],
          layout: "StandaloneLayout"
        });
        window.ui = ui;
      };
    </script>
  </body>
</html>
`;

app.get('/api/doc', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML_TEMPLATE);
});

export default app;