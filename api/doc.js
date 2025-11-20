// api/doc.js
import express from 'express';
import swaggerUi from 'swagger-ui-express';

const app = express();

// --- 1. กำหนด Spec ของ API (OpenAPI 3.0) ---
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'City Data API',
    version: '1.0.0',
    description: 'API Documentation for City Data System',
  },
  servers: [
    {
      // ใช้ VERCEL_URL ถ้ามี ถ้าไม่มีให้ใช้ localhost
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
      description: 'Current Server',
    },
  ],
  paths: {
    '/api/users': {
      post: {
        summary: 'Login or Register User',
        description: 'Handles user authentication. Checks if the email exists: if yes, updates the user info (Login); if no, creates a new user (Register).',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'provider', 'first_name', 'last_name', 'access_token'],
                properties: {
                  email: { 
                    type: 'string', 
                    format: 'email',
                    example: 'somchai@example.com' 
                  },
                  provider: { 
                    type: 'string', 
                    description: 'Authentication provider (e.g., google, facebook, line)',
                    example: 'google' 
                  },
                  first_name: { 
                    type: 'string', 
                    example: 'Somchai' 
                  },
                  last_name: { 
                    type: 'string', 
                    example: 'Jaidee' 
                  },
                  access_token: { 
                    type: 'string', 
                    description: 'Access token received from the provider',
                    example: 'ya29.a0Aa456...' 
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login Successful (Existing user updated)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
          '201': {
            description: 'Registration Successful (New user created)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
          '500': {
            description: 'Internal Server Error (Database or Logic failure)',
            content: {
              'application/json': {
                example: {
                  message: 'An error occurred',
                  error: 'Error details...'
                }
              }
            }
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          user_id: { type: 'integer', example: 101 },
          email: { type: 'string', example: 'somchai@example.com' },
          first_name: { type: 'string', example: 'Somchai' },
          last_name: { type: 'string', example: 'Jaidee' },
          providers: { 
            type: 'array', 
            items: { type: 'string' },
            example: ['google', 'facebook']
          },
          access_token: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

// --- 2. ตั้งค่า CDN สำหรับไฟล์ CSS และ JS ของ Swagger ---
// (จำเป็นสำหรับ Vercel เพื่อแก้ปัญหาโหลดไฟล์ไม่เจอ 404)
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
    customSiteTitle: "City Data API Docs" // ตั้งชื่อ Tab Browser
  })
);

// Export default เพื่อให้ Vercel นำไปรันได้
export default app;