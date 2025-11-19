/**
 * @swagger
 * /api/swagger:
 *   get:
 *     summary: Get overview statistics for a specific organization
 *     description: >
 *       Return the number of issue cases grouped by status for a given organization.
 *       Requires Bearer token authentication.
 *     parameters:
 *       - in: query
 *         name: organization_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The organization ID used to filter the statistics.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved statistics.
 *         content:
 *           application/json:
 *             example:
 *               - status: "pending"
 *                 count: 12
 *               - status: "done"
 *                 count: 5
 *       400:
 *         description: Missing required query parameter.
 *       401:
 *         description: Missing or invalid access token.
 *       405:
 *         description: Method not allowed.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */


import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
    },
  },
  apis: ["./pages/api/**/*.js"], 
};

const spec = swaggerJsdoc(options);

export default function handler(req, res) {
  res.status(200).json(spec);
}
