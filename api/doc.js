// api/doc.js
import express from 'express';
const app = express();

// ============================================================================
// 1. API SPECIFICATION (OpenAPI 3.0)
// ============================================================================
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'City Data API',
    version: '1.5.0',
    description: 'Complete API Documentation for City Data Management System',
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
    schemas: {
      // --- AUTH & USERS ---
      User_Input: {
        type: 'object',
        required: ['email', 'provider', 'first_name', 'last_name'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          provider: { type: 'string', example: 'google' },
          first_name: { type: 'string', example: 'Somchai' },
          last_name: { type: 'string', example: 'Jaidee' },
          access_token: { type: 'string', example: 'ya29.a0Aa...' },
        },
      },
      User_Log_Input: {
        type: 'object',
        required: ['user_id', 'action_type'],
        properties: {
          user_id: { type: 'integer', example: 101 },
          action_type: { type: 'string', example: 'CLICK_BUTTON' },
          provider: { type: 'string', example: 'google' },
          user_agent: { type: 'string' },
          status: { type: 'string', example: 'SUCCESS' },
          details: { type: 'string' },
        },
      },

      // --- ORGANIZATIONS ---
      Organization_Input: {
        type: 'object',
        required: ['organization_code', 'organization_name', 'admin_code'],
        properties: {
          organization_code: { type: 'string', example: 'BKK01' },
          organization_name: { type: 'string', example: 'Bangkok City Hall' },
          admin_code: { type: 'string', example: 'ADM-009' },
          org_type_id: { type: 'integer', example: 2 },
          usage_type_id: { type: 'integer', example: 1 },
          url_logo: { type: 'string' },
          province: { type: 'string' },
          district: { type: 'string' },
          sub_district: { type: 'string' },
          contact_phone: { type: 'string' },
        },
      },
      Join_Org_Input: {
        type: 'object',
        required: ['user_id', 'organization_code'],
        properties: {
          user_id: { type: 'integer', example: 101 },
          organization_code: { type: 'string', example: 'BKK01' },
        },
      },

      // --- ISSUE CASES ---
      IssueCase_Input: {
        type: 'object',
        required: ['title', 'issue_type_id', 'latitude', 'longitude'],
        properties: {
          title: { type: 'string', example: 'Found a pothole' },
          description: { type: 'string', example: 'Big hole near the market' },
          cover_image_url: { type: 'string' },
          issue_type_id: { type: 'integer', example: 1 },
          latitude: { type: 'number', format: 'float', example: 13.7563 },
          longitude: { type: 'number', format: 'float', example: 100.5018 },
          tags: { type: 'array', items: { type: 'string' }, example: ['urgent', 'road'] },
          user_id: { type: 'integer', example: 101 },
          organization_ids: { 
            type: 'array', 
            items: { type: 'integer' }, 
            example: [5, 8],
            description: 'List of Organization IDs to assign'
          },
          media_files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                media_type: { type: 'string', example: 'image' },
                url: { type: 'string' }
              }
            }
          }
        }
      },
      ViewCase_Input: { // For PATCH view
        type: 'object',
        required: ['organization_id', 'user_id'],
        properties: {
          organization_id: { type: 'integer', example: 5 },
          user_id: { type: 'integer', example: 101, description: 'Officer User ID' },
        }
      },

      // --- SCORING ---
      Score_Input: {
        type: 'object',
        required: ['issue_case_id', 'score'],
        properties: {
          issue_case_id: { type: 'integer', example: 50 },
          score: { type: 'number', minimum: 1, maximum: 5, example: 4 },
          comment: { type: 'string', example: 'Good service' },
        },
      },

      // --- STATS RESPONSE SCHEMAS ---
      Stats_Overall: {
        type: 'object',
        properties: {
          overall_average: { type: 'number', example: 4.5 },
          total_count: { type: 'integer', example: 120 },
          breakdown: { type: 'array', items: { type: 'object' } }
        }
      },
      Stats_List: { // Generic list for activities, types, etc.
        type: 'array',
        items: { type: 'object' }
      }
    },
  },
  paths: {
    // ==========================================
    // 1. User & Authentication
    // ==========================================
    '/api/users': {
      post: {
        summary: 'Login / Register',
        tags: ['Users'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User_Input' } } } },
        responses: { '200': { description: 'Success' } }
      }
    },
    '/api/logout': {
      post: {
        summary: 'Logout',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Logged out' } }
      }
    },
    '/api/user_logs': {
      post: {
        summary: 'Save General Log',
        tags: ['Users'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User_Log_Input' } } } },
        responses: { '201': { description: 'Saved' } }
      }
    },

    // ==========================================
    // 2. Organization Management
    // ==========================================
    '/api/organizations': {
      post: {
        summary: 'Create Organization',
        tags: ['Organizations'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Organization_Input' } } } },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/api/users_organizations': {
      get: {
        summary: 'Get Members / My Orgs',
        tags: ['Organizations'],
        parameters: [
          { name: 'user_id', in: 'query', schema: { type: 'integer' } },
          { name: 'organization_code', in: 'query', schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Success' } }
      },
      post: {
        summary: 'Join Organization',
        tags: ['Organizations'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Join_Org_Input' } } } },
        responses: { '201': { description: 'Joined' } }
      }
    },
    '/api/organization-types': {
      get: {
        summary: 'Get Org Types List',
        tags: ['Organizations'],
        responses: { '200': { description: 'List returned' } }
      }
    },
    '/api/usage-types': {
      get: {
        summary: 'Get Usage Types List',
        tags: ['Organizations'],
        responses: { '200': { description: 'List returned' } }
      }
    },

    // ==========================================
    // 3. Case Management
    // ==========================================
    '/api/cases/issue_cases': {
      get: {
        summary: 'Get Cases List',
        tags: ['Cases'],
        parameters: [{ name: 'organization_id', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success' } }
      },
      post: {
        summary: 'Create New Case',
        tags: ['Cases'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/IssueCase_Input' } } } },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/api/cases/{id}/view': {
      patch: {
        summary: 'Officer Views Case',
        description: 'Mark case as viewed by organization officer',
        tags: ['Cases'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ViewCase_Input' } } } },
        responses: { '200': { description: 'Updated' } }
      }
    },

    // ==========================================
    // 4. Scoring & Feedback
    // ==========================================
    '/api/score': {
      get: {
        summary: 'Get Case Rating',
        tags: ['Scoring'],
        parameters: [{ name: 'case_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success' } }
      },
      post: {
        summary: 'Submit Rating',
        tags: ['Scoring'],
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Score_Input' } } } },
        responses: { '201': { description: 'Created' } }
      }
    },

    // ==========================================
    // 5. Dashboard Statistics (Protected)
    // ==========================================
    '/api/stats/overview': {
      get: {
        summary: 'Overview Status Counts',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stats_List' } } } } }
      }
    },
    '/api/stats/overall-rating': {
      get: {
        summary: 'Satisfaction Stats',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stats_Overall' } } } } }
      }
    },
    '/api/stats/count-by-type': {
      get: {
        summary: 'Issues by Type',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stats_List' } } } } }
      }
    },
    '/api/stats/staff-activities': {
      get: {
        summary: 'Staff Leaderboard',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stats_List' } } } } }
      }
    },
    '/api/stats/staff-count': {
      get: {
        summary: 'Total Staff Count',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success' } }
      }
    },

    // ==========================================
    // 6. Utilities
    // ==========================================
    '/api/stats/GPS': {
      get: {
        summary: 'Reverse Geocode',
        tags: ['Utilities'],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Address Found' } }
      }
    }
  }
};

// ============================================================================
// 2. HTML TEMPLATE (Vercel Optimization)
// ============================================================================
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>City Data API Documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #61affe; }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #49cc90; }
      .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #fca130; }
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
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout"
        });
        window.ui = ui;
      };
    </script>
  </body>
</html>
`;

// ============================================================================
// 3. SERVER HANDLER
// ============================================================================
app.get('/api/doc', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML_TEMPLATE);
});

export default app;