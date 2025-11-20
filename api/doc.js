// api/doc.js
import express from 'express';
import swaggerUi from 'swagger-ui-express';

const app = express();

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'City Data API',
    version: '1.0.0',
    description: 'API Documentation for City Data System',
  },
  servers: [
    {
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
      description: 'Current Server',
    },
  ],
  paths: {
    '/api/users': {
      post: {
        summary: 'Login or Register User',
        description: 'Handle user login. Creates a new user if email does not exist, otherwise updates the existing user.',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'provider', 'first_name', 'last_name', 'access_token'],
                properties: {
                  email: { type: 'string', example: 'somchai@example.com' },
                  provider: { type: 'string', example: 'google', description: 'e.g. google, facebook, line' },
                  first_name: { type: 'string', example: 'Somchai' },
                  last_name: { type: 'string', example: 'Jai-dee' },
                  access_token: { type: 'string', example: 'ya29.a0Aa...' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login Successful (User Updated)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          '201': {
            description: 'Registration Successful (New User Created)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          '500': {
            description: 'Server Error',
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
          providers: { type: 'array', items: { type: 'string' } },
          access_token: { type: 'string' },
        },
      },
    },
  },
};

const CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.0/swagger-ui.min.css";

app.use('/api/doc', swaggerUi.serve, swaggerUi.setup(swaggerDocument, { customCssUrl: CSS_URL }));

// เปลี่ยนจาก module.exports เป็น export default สำหรับ Vercel + ES Modules
export default app;