/**
 * ./scripts/compareMerkleDebug.js
 * --------------------------------
 * Compare Merkle tree rebuild vs generateMerkleProofNew
 * Purpose: check for mismatched leaf, pathElements, pathIndices
 */

const fs = require("fs");
const path = require("path");
const { buildMerkleTree } = require("./zkp-merkle-proof");
const merkleZkpService = require("../src/services/merkleZkpService");
const { generateMerkleProofNew } = require("./zkp-merkle-proof-new"); 

const IDENTITIES_FILE = path.resolve(__dirname, "../data/identities.json");
const TREE_FILE = path.resolve(__dirname, "../data/merkle_tree.json");

const raw = {
    userId: "12345678901234",
    nik: "12345678901234",
    nama: "Bella Anggraini Pratama",
    ttl: "20000101",
    key: "keybel",
};

(async () => {
  try {
    console.log("🌱 Starting Merkle debug comparison for Bella...");

    const identities = JSON.parse(fs.readFileSync(IDENTITIES_FILE, "utf8"));
    console.log(`🔹 Loaded ${identities.length} identities`);

    // Rebuild Merkle tree
    const { root: rebuiltRoot, leaves: rebuiltLeaves } = await buildMerkleTree(identities);
    console.log("🔹 Rebuilt Merkle root:", rebuiltRoot.toString());

    const treeData = JSON.parse(fs.readFileSync(TREE_FILE, "utf8"));
    console.log("🔹 Stored Merkle root from file:", treeData.root);

    if (rebuiltRoot.toString() !== treeData.root) {
      console.warn("⚠️ Rebuilt root does NOT match stored root!");
    } else {
      console.log("✅ Rebuilt root matches stored root");
    }
    const { identityHash } = await merkleZkpService.calculateIdentityHash(
      raw.nik,
      raw.nama,
      raw.ttl,
      raw.key
    );
    console.log("🔹 Calculated identityHash:", identityHash.toString());

    const identityEntry = identities.find(i => i.identityHash === identityHash.toString());

    if (!identityEntry) throw new Error("⚠️ Bella tidak ditemukan di identities.json");

    // Generate Merkle proof
    const debugResult = await generateMerkleProofNew({
      nik: raw.nik,
      nama: raw.nama,
      ttl: raw.ttl,
      key: raw.key,
      salt: identityEntry.salt
    });

    console.log("\n--- Debug Merkle proof for Bella ---");
    console.log("Leaf hash:", debugResult.leafHash.toString());
    console.log("Leaf index:", debugResult.leafIndex);
    console.log("Path elements length:", debugResult.pathElements.length);
    console.log("Path indices length:", debugResult.pathIndices.length);
    console.log("Circuit input:", debugResult.circuitInput);

  } catch (err) {
    console.error("❌ Error during Merkle debug comparison:", err);
  }
})();
