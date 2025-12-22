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
    version: '1.6.0',
    description: 'Complete API Documentation (Inputs & Outputs Defined)',
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
      // ==========================================
      // 1. USERS
      // ==========================================
      User_Input: {
        type: 'object',
        required: ['email', 'provider', 'first_name', 'last_name'],
        properties: {
          email: { type: 'string', example: 'user@example.com' },
          provider: { type: 'string', example: 'google' },
          first_name: { type: 'string', example: 'Somchai' },
          last_name: { type: 'string', example: 'Jaidee' },
          access_token: { type: 'string' },
        },
      },
      User_Output: { // สิ่งที่ได้กลับมา
        type: 'object',
        properties: {
          user_id: { type: 'integer', example: 101 },
          email: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          providers: { type: 'array', items: { type: 'string' } },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      User_Log_Input: {
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

      // ==========================================
      // 2. ORGANIZATIONS
      // ==========================================
      Organization_Input: {
        type: 'object',
        required: ['organization_code', 'organization_name', 'admin_code'],
        properties: {
          organization_code: { type: 'string', example: 'BKK01' },
          organization_name: { type: 'string', example: 'Bangkok City Hall' },
          admin_code: { type: 'string', example: 'ADM-009' },
          org_type_id: { type: 'integer' },
          usage_type_id: { type: 'integer' },
          url_logo: { type: 'string' },
          province: { type: 'string' },
          district: { type: 'string' },
          sub_district: { type: 'string' },
          contact_phone: { type: 'string' },
        },
      },
      Organization_Output: {
        allOf: [
          { $ref: '#/components/schemas/Organization_Input' },
          {
            type: 'object',
            properties: {
              organization_id: { type: 'integer', example: 5 },
              created_at: { type: 'string', format: 'date-time' }
            }
          }
        ]
      },
      Join_Org_Input: {
        type: 'object',
        required: ['user_id', 'organization_code'],
        properties: {
          user_id: { type: 'integer' },
          organization_code: { type: 'string' },
        },
      },

      // ==========================================
      // 3. ISSUE CASES
      // ==========================================
      IssueCase_Input: {
        type: 'object',
        required: ['title', 'issue_type_id', 'latitude', 'longitude'],
        properties: {
          title: { type: 'string', example: 'Found a pothole' },
          description: { type: 'string' },
          cover_image_url: { type: 'string' },
          issue_type_id: { type: 'integer', example: 1 },
          latitude: { type: 'number', example: 13.7563 },
          longitude: { type: 'number', example: 100.5018 },
          tags: { type: 'array', items: { type: 'string' } },
          user_id: { type: 'integer' },
          organization_ids: { type: 'array', items: { type: 'integer' } },
          media_files: {
            type: 'array',
            items: {
              type: 'object',
              properties: { media_type: { type: 'string' }, url: { type: 'string' } }
            }
          }
        }
      },
      IssueCase_Output: {
        type: 'object',
        properties: {
          issue_cases_id: { type: 'string', format: 'uuid' },
          case_code: { type: 'string', example: '2024-XXX' },
          title: { type: 'string' },
          status: { type: 'string', example: 'รอรับเรื่อง' },
          organizations: { 
            type: 'array', 
            items: { 
              type: 'object',
              properties: { orgid: { type: 'integer' }, responsible_unit: { type: 'string' } }
            } 
          },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      ViewCase_Input: {
        type: 'object',
        required: ['organization_id', 'user_id'],
        properties: {
          organization_id: { type: 'integer' },
          user_id: { type: 'integer' },
        }
      },

      // ==========================================
      // 4. SCORING
      // ==========================================
      Score_Input: {
        type: 'object',
        required: ['issue_case_id', 'score'],
        properties: {
          issue_case_id: { type: 'integer' },
          score: { type: 'number' },
          comment: { type: 'string' },
        },
      },

      // ==========================================
      // 5. DETAILED STATS (เพิ่มใหม่ให้ครบ)
      // ==========================================
      Stat_OverallRating: {
        type: 'object',
        properties: {
          overall_average: { type: 'number', example: 4.2 },
          total_count: { type: 'integer', example: 150 },
          breakdown: { 
            type: 'array', 
            items: { 
              type: 'object', 
              properties: { score: { type: 'integer' }, count: { type: 'integer' } } 
            } 
          }
        }
      },
      Stat_Overview: { // Status Counts
        type: 'array',
        items: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'เสร็จสิ้น' },
            count: { type: 'string', example: "15" }
          }
        }
      },
      Stat_CountByType: { // Issue Types
        type: 'array',
        items: {
          type: 'object',
          properties: {
            issue_type_name: { type: 'string', example: 'Electricity' },
            count: { type: 'string', example: "42" }
          }
        }
      },
      Stat_StaffActivity: { // Leaderboard
        type: 'array',
        items: {
          type: 'object',
          properties: {
            staff_name: { type: 'string', example: 'Somchai Jai-dee' },
            new_status: { type: 'string', example: 'กำลังดำเนินการ' },
            count: { type: 'integer', example: 10 }
          }
        }
      },
      Stat_StaffCount: {
        type: 'object',
        properties: {
          staff_count: { type: 'string', example: "12" }
        }
      },
      
      // ==========================================
      // 6. UTILS
      // ==========================================
      GPS_Address: {
        type: 'object',
        properties: {
          province: { type: 'string' },
          district: { type: 'string' },
          sub_district: { type: 'string' }
        }
      }
    },
  },
  paths: {
    // --- 1. Users ---
    '/api/users': {
      post: {
        summary: 'Login / Register',
        tags: ['Users'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User_Input' } } } },
        responses: { 
          '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User_Output' } } } },
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User_Output' } } } }
        }
      }
    },
    '/api/logout': {
      post: {
        summary: 'Logout',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' } }
      }
    },
    '/api/user_logs': {
      post: {
        summary: 'Save Log',
        tags: ['Users'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User_Log_Input' } } } },
        responses: { '201': { description: 'Saved' } }
      }
    },

    // --- 2. Organizations ---
    '/api/organizations': {
      post: {
        summary: 'Create Org',
        tags: ['Organizations'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Organization_Input' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Organization_Output' } } } } }
      }
    },
    '/api/users_organizations': {
      get: {
        summary: 'Get Members/Orgs',
        tags: ['Organizations'],
        parameters: [
          { name: 'user_id', in: 'query', schema: { type: 'integer' } },
          { name: 'organization_code', in: 'query', schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Success' } }
      },
      post: {
        summary: 'Join Org',
        tags: ['Organizations'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Join_Org_Input' } } } },
        responses: { '201': { description: 'Joined' } }
      }
    },
    '/api/organization-types': {
        get: { 
            summary: 'Get Types', 
            tags: ['Organizations'],
            responses: { '200': { description: 'OK' } } 
        } 
    },
    '/api/usage-types': {
        get: { 
            summary: 'Get Usage Types', 
            tags: ['Organizations'],
            responses: { '200': { description: 'OK' } } 
        } 
    },

    // --- 3. Cases ---
    '/api/cases/issue_cases': {
      get: {
        summary: 'Get Cases',
        tags: ['Cases'],
        parameters: [{ name: 'organization_id', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IssueCase_Output' } } } } } }
      },
      post: {
        summary: 'Create Case',
        tags: ['Cases'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/IssueCase_Input' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/IssueCase_Output' } } } } }
      }
    },
    '/api/cases/{id}/view': {
      patch: {
        summary: 'Mark Viewed',
        tags: ['Cases'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ViewCase_Input' } } } },
        responses: { '200': { description: 'Updated' } }
      }
    },
    '/api/crud_case_detail': {
      get: {
        summary: 'Get Case Details & Timeline',
        tags: ['Cases'],
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'Case details and timeline',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    info: {
                      type: 'object',
                      properties: {
                        issue_cases_id: { type: 'string', format: 'uuid' },
                        case_code: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        cover_image_url: { type: 'string' },
                        issue_type_id: { type: 'integer' },
                        status: { type: 'string' },
                        latitude: { type: 'number' },
                        longitude: { type: 'number' },
                        tags: { type: 'array', items: { type: 'string' } },
                        created_at: { type: 'string', format: 'date-time' },
                        updated_at: { type: 'string', format: 'date-time' },
                        agency_name: { type: 'string' },
                        issue_category_name: { type: 'string' },
                        rating: { type: 'number' }
                      }
                    },
                    timeline: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          detail: { type: 'string' },
                          created_at: { type: 'string', format: 'date-time' },
                          changed_by: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Update Case Details',
        tags: ['Cases'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['update_status', 'update_category'] },
                  case_id: { type: 'string', format: 'uuid' },
                  user_id: { type: 'integer' },
                  data: {
                    type: 'object',
                    oneOf: [
                      {
                        properties: {
                          new_status: { type: 'string' },
                          comment: { type: 'string' },
                          image_url: { type: 'string' }
                        }
                      },
                      {
                        properties: {
                          new_type_id: { type: 'integer' },
                          new_type_name: { type: 'string' },
                          old_type_name: { type: 'string' }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Update successful' }
        }
      }
    },

    // --- 4. Scoring ---
    '/api/score': {
      get: {
        summary: 'Get Rating',
        tags: ['Scoring'],
        parameters: [{ name: 'case_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stat_OverallRating' } } } } }
      },
      post: {
        summary: 'Submit Rating',
        tags: ['Scoring'],
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Score_Input' } } } },
        responses: { '201': { description: 'Created' } }
      }
    },

    // --- 5. Stats ---
    '/api/stats/overview': {
      get: {
        summary: 'Overview Status',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stat_Overview' } } } } }
      }
    },
    '/api/stats/overall-rating': {
      get: {
        summary: 'Overall Rating',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stat_OverallRating' } } } } }
      }
    },
    '/api/stats/count-by-type': {
      get: {
        summary: 'Count By Type',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stat_CountByType' } } } } }
      }
    },
    '/api/stats/staff-activities': {
      get: {
        summary: 'Staff Activities',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stat_StaffActivity' } } } } }
      }
    },
    '/api/stats/staff-count': {
      get: {
        summary: 'Staff Count',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stat_StaffCount' } } } } }
      }
    },
    '/api/stats/efficiency': {
      get: {
        summary: 'Get Efficiency Stats',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'Efficiency statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    avg_days_to_close: { type: 'number' },
                    avg_days_to_view: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/stats/org-count-issue-type': {
      get: {
        summary: 'Get Issue Type Counts for an Org and its Sub-Orgs',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'org_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'An array of issue type counts',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' },
                      count: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/stats/org-stats': {
      get: {
        summary: 'Get Operational Stats for an Org and its Sub-Orgs',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'org_id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'An array of operational stats for each organization',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' },
                      total: { type: 'integer' },
                      pending: { type: 'integer' },
                      inProgress: { type: 'integer' },
                      completed: { type: 'integer' },
                      forwarded: { type: 'integer' },
                      rejected: { type: 'integer' },
                      invited: { type: 'integer' },
                      satisfaction: { type: 'number' },
                      reviews: { type: 'integer' },
                      avgTime: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/stats/trend': {
      get: {
        summary: 'Get Case Trend Stats',
        tags: ['Stats'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'organization_id', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'range', in: 'query', schema: { type: 'string', enum: ['1w', '2w', '3w', '1m', '3m', '1y', '5y'], default: '1m' } }
        ],
        responses: {
          '200': {
            description: 'An array of case trend statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string' },
                      total: { type: 'integer' },
                      pending: { type: 'integer' },
                      action: { type: 'integer' },
                      forward: { type: 'integer' },
                      invite: { type: 'integer' },
                      rejecte: { type: 'integer' },
                      completed: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    // --- 6. Utils ---
    '/api/GPS': {
      get: {
        summary: 'Reverse Geocode',
        tags: ['Utilities'],
        parameters: [{ name: 'lat', in: 'query', required: true }, { name: 'lon', in: 'query', required: true }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/GPS_Address' } } } } }
      }
    },
    '/api/get_issue_status': {
      get: {
        summary: 'Get Issue Statuses',
        tags: ['Utilities'],
        responses: {
          '200': {
            description: 'A list of issue statuses',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/get_issue_types': {
      get: {
        summary: 'Get Issue Types',
        tags: ['Utilities'],
        responses: {
          '200': {
            description: 'A list of issue types',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      issue_id: { type: 'integer' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      icon_url: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// ============================================================================
// 2. HTML TEMPLATE
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