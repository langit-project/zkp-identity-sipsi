/**
 * ./scripts/verifyUserProofDebug.js
 * ---------------------------------
 * Debug script to verify a user's Merkle proof off-chain.
 * Only generates proof and compares Merkle root, no on-chain update.
 */

const fs = require("fs");
const path = require("path");
const { buildMerkleTree, computeLeaf } = require("./zkp-merkle-proof");
const merkleZkpService = require("../src/services/merkleZkpService");

const IDENTITIES_FILE = path.resolve(__dirname, "../data/identities.json");
const TREE_FILE = path.resolve(__dirname, "../data/merkle_tree.json");

// === User raw data ===
const userData = {
  userId: "12345678901234",
  nik: "12345678901234",
  nama: "Bella Anggraini Pratama",
  ttl: "20000101",
  key: "keybel",
};

(async () => {
  try {
    console.log("🌱 Starting debug verification using MerkleZKPService...\n");

    if (!fs.existsSync(IDENTITIES_FILE)) {
      throw new Error("❌ identities.json not found.");
    }

    const identities = JSON.parse(fs.readFileSync(IDENTITIES_FILE, "utf8"));
    if (!Array.isArray(identities) || identities.length === 0) {
      throw new Error("❌ identities.json is empty or invalid.");
    }

    console.log(`🔹 Loaded ${identities.length} identities from identities.json`);

    // 1️⃣ Hitung identityHash user
    const { identityHash } = await merkleZkpService.calculateIdentityHash(
      userData.nik,
      userData.nama,
      userData.ttl,
      userData.key
    );

    console.log("🔹 Calculated identityHash:", identityHash.toString());

    // 2️⃣ Cari salt dari identities.json sesuai identityHash
    const identityEntry = identities.find((i) => BigInt(i.identityHash) === BigInt(identityHash));
    if (!identityEntry) throw new Error("❌ Identity not found in identities.json");

    console.log("🔹 Found identity in identities.json:", identityEntry);

    // 3️⃣ Hitung leaf hash
    const leafHash = await computeLeaf(identityHash, identityEntry.salt);
    console.log("🔹 Computed leaf hash:", leafHash.toString());

    // 4️⃣ Bangun Merkle tree
    const { root, leaves, tree } = await buildMerkleTree(identities);
    console.log("🔹 Rebuilt Merkle root:", root);

    // 5️⃣ Cari leafIndex
    const leavesBigInt = leaves.map((l) => BigInt(l));
    const leafIndex = leavesBigInt.findIndex((l) => l === BigInt(leafHash));
    if (leafIndex < 0) throw new Error("❌ Leaf not found in Merkle tree");

    console.log("🔹 Leaf index for user:", leafIndex);

    // 6️⃣ Generate Merkle proof
    const proofData = {
      nik: userData.nik,
      nama: userData.nama,
      ttl: userData.ttl,
      key: userData.key,
      salt: identityEntry.salt,
      leafIndex,
      merkleTree: tree,
      zkpService: merkleZkpService, // pakai langsung instance
    };

    const { proof, publicSignals, merkleRoot } = await require("./zkp-merkle-proof").generateMerkleProof(proofData);

    console.log("✅ Merkle proof generated successfully");
    console.log("🔹 Proof:", proof);
    console.log("🔹 Public signals:", publicSignals);
    console.log("🔹 Merkle root from proof:", merkleRoot);
    console.log("🔹 Merkle root from tree.json:", root.toString());

    if (BigInt(publicSignals[0]) === BigInt(root)) {
      console.log("🎉 Proof root matches Merkle tree root. Debug verification success!");
    } else {
      console.error("❌ Proof root does NOT match Merkle tree root!");
    }

  } catch (err) {
    console.error("❌ Debug verification failed:", err);
    process.exit(1);
  }
})();
