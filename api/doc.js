// api/doc.js
import express from 'express';
const app = express();

// --- 1. กำหนด Spec API ---
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'City Data API',
    version: '1.3.0',
    description: 'API Documentation (Schemas matched with Filenames)',
  },
  servers: [
    {
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
      description: 'Production Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    // --- SCHEMAS (ตั้งชื่อตามไฟล์) ---
    schemas: {
      // ไฟล์: users.js
      Users: {
        type: 'object',
        required: ['email', 'provider', 'first_name', 'last_name'],
        properties: {
          user_id: { type: 'integer', example: 101 },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          first_name: { type: 'string', example: 'Somchai' },
          last_name: { type: 'string', example: 'Jaidee' },
          providers: { type: 'array', items: { type: 'string' }, example: ['google'] },
          access_token: { type: 'string', example: 'ya29.a0Aa...' },
        },
      },
      // ไฟล์: organizations.js
      Organizations: {
        type: 'object',
        required: ['organization_code', 'organization_name', 'admin_code'],
        properties: {
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
      // ไฟล์: user_logs.js
      UserLogs: {
        type: 'object',
        required: ['user_id', 'action_type'],
        properties: {
          user_id: { type: 'integer', example: 101 },
          action_type: { type: 'string', example: 'LOGIN' },
          provider: { type: 'string', example: 'google' },
          user_agent: { type: 'string', example: 'Mozilla/5.0...' },
          status: { type: 'string', example: 'SUCCESS' },
          details: { type: 'string', example: 'User logged in' },
        },
      },
      // ไฟล์: users_organizations.js (สำหรับการ Join)
      UsersOrganizations_Input: {
        type: 'object',
        required: ['user_id', 'organization_code'],
        properties: {
          user_id: { type: 'integer', example: 101 },
          organization_code: { type: 'string', example: 'BKK01' },
        },
      },
      // ไฟล์: score.js (Input สำหรับส่งคะแนน)
      Score_Input: {
        type: 'object',
        required: ['issue_case_id', 'score'],
        properties: {
          issue_case_id: { type: 'integer', example: 50 },
          score: { type: 'number', minimum: 1, maximum: 5, example: 4 },
          comment: { type: 'string', example: 'Good job!' },
        },
      },
      // ไฟล์: score.js (Output สำหรับดูสถิติ)
      Score_Stats: {
        type: 'object',
        properties: {
          average_score: { type: 'number', example: 4.5 },
          total_ratings: { type: 'integer', example: 120 },
          latest_score: { type: 'integer', example: 5, nullable: true },
        },
      },
      // ไฟล์: GPS.js
      GPS_Address: {
        type: 'object',
        properties: {
          province: { type: 'string', example: 'Pathum Thani' },
          district: { type: 'string', example: 'Khlong Luang' },
          sub_district: { type: 'string', example: 'Khlong Nueng' },
        },
      },
      // ไฟล์: organization-types.js & usage-types.js (ใช้โครงสร้างเดียวกัน)
      Common_SelectOption: {
        type: 'object',
        properties: {
          value: { type: 'integer', example: 1 },
          label: { type: 'string', example: 'Option Name' },
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
        tags: ['Users.js'],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Users' } },
          },
        },
        responses: {
          '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Users' } } } },
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Users' } } } },
        },
      },
    },
    '/api/logout': {
      post: {
        summary: 'Logout User',
        tags: ['Logout.js'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': { schema: { type: 'object', properties: { user_id: { type: 'integer' } } } },
          },
        },
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/api/user_logs': {
      post: {
        summary: 'Save Log',
        tags: ['User_Logs.js'],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UserLogs' } },
          },
        },
        responses: { '201': { description: 'Saved' } },
      },
    },

    // ==========================================
    // Group: Organizations
    // ==========================================
    '/api/organizations': {
      post: {
        summary: 'Create Organization',
        tags: ['Organizations.js'],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Organizations' } },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Organizations' } } } },
        },
      },
    },
    '/api/users_organizations': {
      get: {
        summary: 'Get Relationships',
        tags: ['Users_Organizations.js'],
        parameters: [
          { name: 'user_id', in: 'query', schema: { type: 'integer' } },
          { name: 'organization_code', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Success' } },
      },
      post: {
        summary: 'Join Organization',
        tags: ['Users_Organizations.js'],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/UsersOrganizations_Input' } },
          },
        },
        responses: { '201': { description: 'Joined' } },
      },
    },
    '/api/organization-types': {
      get: {
        summary: 'Get Org Types',
        tags: ['Organization-Types.js'],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Common_SelectOption' } } } } },
        },
      },
    },
    '/api/usage-types': {
      get: {
        summary: 'Get Usage Types',
        tags: ['Usage-Types.js'],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Common_SelectOption' } } } } },
        },
      },
    },

    // ==========================================
    // Group: Scoring & Utils
    // ==========================================
    '/api/score': {
      get: {
        summary: 'Get Stats',
        tags: ['Score.js'],
        parameters: [{ name: 'case_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Score_Stats' } } } },
        },
      },
      post: {
        summary: 'Submit Rating',
        tags: ['Score.js'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Score_Input' } },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/GPS': {
      get: {
        summary: 'Reverse Geocode',
        tags: ['GPS.js'],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/GPS_Address' } } } },
        },
      },
    },
  },
};

// --- 2. HTML Template (สำหรับ Vercel) ---
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