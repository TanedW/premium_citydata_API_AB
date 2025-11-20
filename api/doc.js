// api/doc.js
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const app = express();

// กำหนด Spec ของ API (OpenAPI 3.0)
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'City Data API',
    version: '1.0.0',
    description: 'API Documentation for User Management',
  },
  servers: [
    {
      url: 'https://your-project-url.vercel.app', // เปลี่ยนเป็น URL จริงของคุณ
      description: 'Production Server',
    },
    {
      url: 'http://localhost:3000',
      description: 'Local Development',
    },
  ],
  paths: {
    '/api/users': { // ตรงกับไฟล์ users.js ของคุณ
      post: {
        summary: 'Login or Register a User',
        description: 'Checks if user exists. If yes, updates info. If no, creates new user. Returns user data.',
        tags: ['Users'],
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
                    example: 'user@example.com',
                  },
                  provider: {
                    type: 'string',
                    description: 'Login provider e.g., google, facebook, line',
                    example: 'google',
                  },
                  first_name: {
                    type: 'string',
                    example: 'John',
                  },
                  last_name: {
                    type: 'string',
                    example: 'Doe',
                  },
                  access_token: {
                    type: 'string',
                    description: 'Token from the provider',
                    example: 'ya29.a0Aa...',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'User logged in successfully (Updated)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
          '201': {
            description: 'User registered successfully (Created)',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
          '500': {
            description: 'Internal Server Error',
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
          user_id: { type: 'integer' },
          email: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          providers: { 
            type: 'array',
            items: { type: 'string' }
          },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

// CSS fix for Vercel rendering
const CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.0/swagger-ui.min.css";

app.use(
  '/api/doc', // Path ที่จะเข้าใช้งาน
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, { customCssUrl: CSS_URL })
);

module.exports = app;