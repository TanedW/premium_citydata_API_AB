import swaggerUi from 'swagger-ui-dist';

export default function handler(req, res) {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: "/api/openapi",
        dom_id: "#swagger"
      });
    </script>
  </body>
  </html>
  `;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
}
