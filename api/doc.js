// api/doc.js
import express from 'express';
const app = express();

// --- 1. ใส่ Spec API ของคุณ (ตัวแปรเดิมที่ยาวๆ) ---
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'City Data API',
    version: '1.1.0',
    description: 'API Documentation for City Data & Incident Management System',
  },
  servers: [
    {
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
      description: 'Current Server',
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
    schemas: {
      User: {
        type: 'object',
        properties: {
          user_id: { type: 'integer', example: 101 },
          email: { type: 'string', example: 'somchai@example.com' },
          first_name: { type: 'string', example: 'Somchai' },
          last_name: { type: 'string', example: 'Jaidee' },
          providers: { type: 'array', items: { type: 'string' } },
          access_token: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/api/users': {
      post: {
        summary: 'Login or Register User',
        tags: ['Authentication'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'provider', 'first_name', 'last_name', 'access_token'],
                properties: {
                  email: { type: 'string', example: 'user@example.com' },
                  provider: { type: 'string', example: 'google' },
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  access_token: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'User Updated' },
          '201': { description: 'User Created' },
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
                properties: {
                  user_id: { type: 'integer' },
                },
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
        summary: 'Save General User Logs',
        tags: ['Logs'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_id', 'action_type'],
                properties: {
                  user_id: { type: 'integer' },
                  action_type: { type: 'string' },
                  provider: { type: 'string' },
                  user_agent: { type: 'string' },
                  status: { type: 'string' },
                  details: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Log saved' },
        },
      },
    },
    '/api/organizations': {
      post: {
        summary: 'Create New Organization',
        tags: ['Organizations'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['organization_code', 'organization_name', 'admin_code'],
                properties: {
                  organization_code: { type: 'string' },
                  organization_name: { type: 'string' },
                  admin_code: { type: 'string' },
                  org_type_id: { type: 'integer' },
                  usage_type_id: { type: 'integer' },
                  url_logo: { type: 'string' },
                  province: { type: 'string' },
                  district: { type: 'string' },
                  sub_district: { type: 'string' },
                  contact_phone: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '409': { description: 'Conflict' },
        },
      },
    },
    '/api/users_organizations': {
      get: {
        summary: 'Get User-Organization Relationships',
        tags: ['Organizations'],
        parameters: [
          { name: 'user_id', in: 'query', schema: { type: 'integer' } },
          { name: 'organization_code', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Success' } },
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
        responses: { '201': { description: 'Joined' } },
      },
    },
    '/api/organization-types': {
      get: {
        summary: 'Get Organization Types',
        tags: ['Organizations'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/api/usage-types': {
      get: {
        summary: 'Get Usage Types',
        tags: ['Organizations'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/api/score': {
      get: {
        summary: 'Get Case Ratings',
        tags: ['Scoring'],
        parameters: [{ name: 'case_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success' } },
      },
      post: {
        summary: 'Submit Rating',
        tags: ['Scoring'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['issue_case_id', 'score'],
                properties: {
                  issue_case_id: { type: 'integer' },
                  score: { type: 'number' },
                  comment: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/GPS': {
      get: {
        summary: 'Reverse Geocoding',
        tags: ['Utilities'],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
};

// --- 2. สร้าง HTML String ที่บังคับโหลดจาก CDN (แก้ปัญหา Error <) ---
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
        // Begin Swagger UI call region
        const ui = SwaggerUIBundle({
          spec: ${JSON.stringify(swaggerDocument)},
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout"
        });
        // End Swagger UI call region
        window.ui = ui;
      };
    </script>
  </body>
</html>
`;

// --- 3. Route ส่ง HTML กลับไปตรงๆ ---
app.get('/api/doc', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML_TEMPLATE);
});

export default app;