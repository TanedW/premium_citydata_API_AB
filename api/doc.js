// api/doc.js
import express from 'express';
import swaggerUi from 'swagger-ui-express';

const app = express();

// --- 1. กำหนด Spec ของ API (OpenAPI 3.0) ---
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
  // --- กำหนดระบบ Authentication ---
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      User: { /* ...Schema เดิม... */ },
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
        description: 'Invalidates the user access token in the database.',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }], // ต้องการ Token
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  user_id: { type: 'integer', description: 'Optional: User ID for logging purposes' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Logout processed successfully' },
        },
      },
    },
    '/api/user_logs': {
      post: {
        summary: 'Save General User Logs',
        tags: ['Logs'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_id', 'action_type'],
                properties: {
                  user_id: { type: 'integer' },
                  action_type: { type: 'string', example: 'CLICK_BUTTON' },
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
          '201': { description: 'Log saved successfully' },
        },
      },
    },

    // ==========================================
    // Group: Organizations
    // ==========================================
    '/api/organizations': {
      post: {
        summary: 'Create New Organization',
        tags: ['Organizations'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['organization_code', 'organization_name', 'admin_code'],
                properties: {
                  organization_code: { type: 'string', example: 'ORG001' },
                  organization_name: { type: 'string', example: 'Bangkok City Hall' },
                  admin_code: { type: 'string', example: 'ADM999' },
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
          '201': { description: 'Organization created successfully' },
          '409': { description: 'Organization code already exists' },
        },
      },
    },
    '/api/users_organizations': {
      get: {
        summary: 'Get User-Organization Relationships',
        description: 'Search by user_id OR organization_code',
        tags: ['Organizations'],
        parameters: [
          { name: 'user_id', in: 'query', schema: { type: 'integer' }, description: 'To find orgs a user belongs to' },
          { name: 'organization_code', in: 'query', schema: { type: 'string' }, description: 'To find users in an org' },
        ],
        responses: {
          '200': { description: 'List of relationships found' },
          '400': { description: 'Missing query parameter' },
        },
      },
      post: {
        summary: 'Join Organization',
        tags: ['Organizations'],
        requestBody: {
          required: true,
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
          '201': { description: 'Joined organization successfully' },
          '409': { description: 'User is already in this organization' },
        },
      },
    },
    '/api/organization-types': {
      get: {
        summary: 'Get Organization Types',
        tags: ['Organizations'],
        responses: {
          '200': {
            description: 'List of organization types',
            content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { value: { type: 'integer' }, label: { type: 'string' } } } } } },
          },
        },
      },
    },
    '/api/usage-types': {
      get: {
        summary: 'Get Usage Types',
        tags: ['Organizations'],
        responses: {
          '200': {
            description: 'List of usage types',
            content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { value: { type: 'integer' }, label: { type: 'string' } } } } } },
          },
        },
      },
    },

    // ==========================================
    // Group: Case & Scoring
    // ==========================================
    '/api/score': {
      get: {
        summary: 'Get Case Ratings',
        tags: ['Scoring'],
        parameters: [
          { name: 'case_id', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Rating statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    average_score: { type: 'number' },
                    total_ratings: { type: 'integer' },
                    latest_score: { type: 'integer', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Submit Rating',
        tags: ['Scoring'],
        security: [{ bearerAuth: [] }], // ต้องการ Token
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['issue_case_id', 'score'],
                properties: {
                  issue_case_id: { type: 'integer' },
                  score: { type: 'number', description: 'Rating 1-5' },
                  comment: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Rating submitted successfully' },
          '401': { description: 'Unauthorized (Invalid Token)' },
        },
      },
    },

    // ==========================================
    // Group: Tools & Utilities
    // ==========================================
    '/api/GPS': {
      get: {
        summary: 'Reverse Geocoding (GPS to Address)',
        description: 'Converts Lat/Lon to Address using OpenStreetMap (Nominatim).',
        tags: ['Utilities'],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'lon', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Address found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    province: { type: 'string' },
                    district: { type: 'string' },
                    sub_district: { type: 'string' },
                  },
                },
              },
            },
          },
          '500': { description: 'External API Error' },
        },
      },
    },
  },
};

// --- 2. ตั้งค่า CDN สำหรับไฟล์ CSS และ JS ของ Swagger ---
const CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui.min.css";
const JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui-bundle.min.js";
const PRESET_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui-standalone-preset.min.js";

// --- 3. สร้าง Route ---
app.use(
  '/api/doc',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customCssUrl: CSS_URL,
    customJs: [JS_URL, PRESET_URL],
    customSiteTitle: "City Data API Docs"
  })
);

export default app;