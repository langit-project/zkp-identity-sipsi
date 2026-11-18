require("dotenv").config();
const express = require("express");
const cors = require("cors");
const zkpRoutes = require("./src/routes/merkleZkpRoutes");
const swaggerRoutes = require("./src/routes/swaggerRoutes");
const app = express();

app.use(cors({ origin: "*" }));

app.use(express.json());

console.log("Starting ZKP backend...");

// Swagger UI Documentation
app.use("/api-docs", swaggerRoutes);

// Routes
app.use("/", zkpRoutes);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`ZKP Backend running at http://localhost:${PORT}`));
