/**
 * debugMerkle.js (versi integrasi)
 *
 * 🔹 Hitung identityHash & leafHash dari input mentah
 * 🔹 Bangun Merkle proof (pathElements, pathIndices)
 * 🔹 Simpan hasil lengkap ke proof/debug_merkle_output.json
 */

const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

// ============================
// 📦 Load Merkle Tree JSON
// ============================
const MERKLE_JSON = path.join(__dirname, "../data/merkle_tree.json");
if (!fs.existsSync(MERKLE_JSON)) {
  console.error(`❌ File Merkle tree tidak ditemukan di: ${MERKLE_JSON}`);
  process.exit(1);
}

const merkleData = JSON.parse(fs.readFileSync(MERKLE_JSON, "utf8"));

// ============================
// 📋 Data User (input mentah)
// ============================
const userData = {
  userId: "12345678901234",
  nik: "12345678901234",
  nama: "Bella Anggraini Pratama",
  ttl: "20000101",
  key: "keybel",
  salt: "133705226350890688225606823547446713642",
};

// ============================
// ⚙️ Fungsi bantu Poseidon
// ============================
async function computeLeaf(identityHash, salt) {
  const P = await buildPoseidon();
  const leaf = P.F.toObject(P([BigInt(identityHash), BigInt(salt), 1n])); // status = 1
  return leaf;
}

(async () => {
  const P = await buildPoseidon();

  console.log("🌱 ===== DEBUG MERKLE START =====");
  console.log("👤 User Data (mentah):", userData);
  console.log("--------------------------------");

  // 1️⃣ Hitung identity hash langsung dari input mentah
  const nik = BigInt(userData.nik);
  const namaRaw = BigInt("0x" + Buffer.from(userData.nama, "utf8").toString("hex"));
  const ttl = BigInt(userData.ttl);
  const keyRaw = BigInt("0x" + Buffer.from(userData.key, "utf8").toString("hex"));

  const identityHash = P.F.toObject(P([nik, namaRaw, ttl, keyRaw]));
  console.log("🔹 Step 1: Identity Hash =", identityHash.toString());

  // 2️⃣ Hitung leaf hash (identity + salt + status)
  const leafHash = await computeLeaf(identityHash, userData.salt);
  console.log("🔹 Step 2: Leaf Hash =", leafHash.toString());

  // 3️⃣ Ambil semua daun dari Merkle Tree
  const leaves = merkleData.leaves.map((l) => BigInt(l));
  console.log("🔹 Step 3: Jumlah daun =", leaves.length);
  console.log("   ➜ Contoh daun pertama:", leaves[0].toString());

  // 4️⃣ Cari posisi leaf user di Merkle Tree
  const leafIndex = leaves.findIndex((l) => l === BigInt(leafHash));
  if (leafIndex === -1) {
    console.error("❌ Leaf tidak ditemukan di Merkle Tree!");
    console.error("   ➜ Cek kombinasi identityHash atau salt.");
    process.exit(1);
  }

  console.log("✅ Leaf ditemukan pada index:", leafIndex);

  // 5️⃣ Bangun Merkle proof
  const levels = 16; // sesuai circuit
  let currentIndex = leafIndex;
  let nodes = leaves.slice();
  const pathElements = [];
  const pathIndices = [];

  for (let i = 0; i < levels; i++) {
    const pairIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    const sibling = nodes[pairIndex] !== undefined ? nodes[pairIndex] : 0n;
    pathElements.push(sibling.toString());
    pathIndices.push(currentIndex % 2);

    // Bangun level berikutnya
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

  // 6️⃣ Simpan hasil akhir
  const merkleRoot = nodes[0].toString();
  console.log("--------------------------------");
  console.log("🌿 Step 4: Path Elements =", pathElements);
  console.log("🌿 Step 5: Path Indices =", pathIndices);
  console.log("🌳 Root (top hash):", merkleRoot);
  console.log("🌱 ===== DEBUG MERKLE END =====");

  // ============================
  // 💾 Simpan hasil ke JSON
  // ============================
  const outputDir = path.join(__dirname, "../proof");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputData = {
    merkleRoot,
    nik: userData.nik,
    nama: namaRaw.toString(),
    ttl: userData.ttl,
    key: keyRaw.toString(),
    salt: userData.salt,
    pathElements,
    pathIndices,
  };

  const outputPath = path.join(outputDir, "debug_merkle_output.json");
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`💾 Hasil disimpan ke: ${outputPath}`);
})();
