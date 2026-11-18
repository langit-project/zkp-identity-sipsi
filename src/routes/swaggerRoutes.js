const express = require("express");
const router = express.Router();

const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "ZKP Identity Backend API",
    version: "1.0.0",
    description: "API microservice untuk ZKP Identity verification, Merkle Tree generation, dan integrasi smart contract on-chain."
  },
  paths: {
    "/health": {
      get: {
        summary: "Cek status operasional ZKP microservice",
        responses: {
          "200": { description: "Service sehat dan terhubung" }
        }
      }
    },
    "/submit-hash": {
      post: {
        summary: "Kirim hash identitas pengguna",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["userId", "nik", "nama", "ttl", "key"],
                properties: {
                  userId: { type: "string" },
                  nik: { type: "string" },
                  nama: { type: "string" },
                  ttl: { type: "string" },
                  key: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Hash berhasil dikirim dan menunggu approval" }
        }
      }
    },
    "/approve": {
      post: {
        summary: "Approve identitas pengguna dan update Merkle Tree",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["userId"],
                properties: {
                  userId: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Pengguna berhasil di-approve" }
        }
      }
    },
    "/verify": {
      post: {
        summary: "Verifikasi Zero-Knowledge Proof identitas",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["proof", "publicSignals"],
                properties: {
                  proof: { type: "object" },
                  publicSignals: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Status keabsahan proof ZKP" }
        }
      }
    },
    "/merkle-info": {
      get: {
        summary: "Mendapatkan informasi pohon Merkle (root, tree height, capacity)",
        responses: {
          "200": { description: "Data Merkle Tree" }
        }
      }
    },
    "/is-verified/{userId}": {
      get: {
        summary: "Cek apakah identitas user sudah terverifikasi",
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Status verifikasi user" }
        }
      }
    }
  }
};

router.get("/openapi.json", (req, res) => {
  res.json(openApiSpec);
});

router.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ZKP Identity API - Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" />
  <style>
    body { margin: 0; padding: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api-docs/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>
  `);
});

module.exports = router;
