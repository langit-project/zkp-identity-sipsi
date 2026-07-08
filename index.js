require("dotenv").config();
const express = require("express");
const cors = require("cors"); // <-- jangan lupa ini
// const zkpRoutes = require("./src/routes/zkpRoutes");
const zkpRoutes = require("./src/routes/merkleZkpRoutes");
const app = express();

app.use(cors({ origin: "*" }));

app.use(express.json());

console.log("Starting ZKP backend...");

// Routes
app.use("/", zkpRoutes);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`ZKP Backend running at http://localhost:${PORT}`));
