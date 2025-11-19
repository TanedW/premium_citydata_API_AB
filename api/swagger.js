import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
    },
  },
  apis: ["./api/*.js", "./api/**/*.js"], // ใช้ path ของโปรเจคจริง
};

const spec = swaggerJsdoc(options);

export default function handler(req, res) {
  res.status(200).json(spec);
}
