// scripts/debugMerkle.js

const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

/**
 * Debug script lengkap untuk Merkle proof:
 * 1️⃣ Hitung identity hash
 * 2️⃣ Hitung leaf hash
 * 3️⃣ Cari leaf index di Merkle tree
 * 4️⃣ Tampilkan pathElements & pathIndices
 * 
 * Jalankan: node scripts/debugMerkle.js
 */

// =======================
// Load Merkle Tree JSON
// =======================
const MERKLE_JSON = path.join(__dirname, "../data/merkle_tree.json");
const merkleData = JSON.parse(fs.readFileSync(MERKLE_JSON, "utf8"));

// =======================
// Fungsi bantu Poseidon
// =======================
async function computeLeaf(identityHash, salt) {
  const P = await buildPoseidon();
  return P.F.toObject(P([BigInt(identityHash), BigInt(salt), 1n])); // status = 1
}

// =======================
// Debug user data
// =======================
const userData = {
  nik: "12345678901234",
  nama: "6359491153320436495584211473910032090137307489107012961", // BigInt representation
  ttl: "20000101",
  key: "118083572360556",
  salt: "133705226350890688225606823547446713642",
};

(async () => {
  const P = await buildPoseidon();

  console.log("🌱 Starting Merkle debug...");

  // 1️⃣ Identity hash
  const identityHash = P.F.toObject(
    P([
      BigInt(userData.nik),
      BigInt(userData.nama),
      BigInt(userData.ttl),
      BigInt(userData.key),
    ])
  );
  console.log("🔹 Identity Hash:", identityHash);

  // 2️⃣ Leaf hash
  const leafHash = await computeLeaf(identityHash, userData.salt);
  console.log("🔹 Computed Leaf Hash:", leafHash);

  // 3️⃣ Daftar leaves dari Merkle tree
  const leavesBigInt = merkleData.leaves.map((l) => BigInt(l));
  console.log("📦 Leaves in Merkle Tree:", leavesBigInt);

  // 4️⃣ Cari leaf index
  const leafIndex = leavesBigInt.findIndex((l) => l === BigInt(leafHash));
  console.log("📌 Leaf Index for user:", leafIndex);

  if (leafIndex === -1) {
    console.log("❌ Leaf not found in Merkle tree! Check identityHash or salt.");
    return;
  }

  // 5️⃣ PathElements & PathIndices
  const levels = 16; // sesuai circuit
  let currentIndex = leafIndex;
  const pathElements = [];
  const pathIndices = [];

  let nodes = leavesBigInt.slice();

  for (let i = 0; i < levels; i++) {
    const pairIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    const sibling = nodes[pairIndex] !== undefined ? nodes[pairIndex] : 0n;
    pathElements.push(sibling.toString());
    pathIndices.push(currentIndex % 2); // 0 = left, 1 = right

    // Build next level
    const nextLevel = [];
    for (let j = 0; j < nodes.length; j += 2) {
      const left = nodes[j] || 0n;
      const right = nodes[j + 1] || 0n;
      const parent = P.F.toObject(P([left, right]));
      nextLevel.push(parent);
    }

    nodes = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  console.log("🌿 Path Elements:", pathElements);
  console.log("🌿 Path Indices:", pathIndices);

  console.log("✅ Debug complete. You can use these values for circuit input.");
})();
