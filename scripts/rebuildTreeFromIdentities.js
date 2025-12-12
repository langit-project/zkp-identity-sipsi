/**
 * rebuildTreeFromIdentities.js
 * ------------------------------------
 * Rebuilds the Merkle tree from /data/identities.json
 * Saves the new root and hashed leaves to /data/merkle_tree.json
 * Optionally updates the Merkle root on-chain with `--onchain`
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { buildMerkleTree, toBytes32Hex } = require("./zkp-merkle-proof");
const merkleZkpContract = require("../src/contracts/merkleZkpContract");

const IDENTITIES_FILE = path.resolve(__dirname, "../data/identities.json");
const TREE_FILE = path.resolve(__dirname, "../data/merkle_tree.json");

(async () => {
  try {
    console.log("🌱 Starting Merkle tree rebuild process...\n");

    if (!fs.existsSync(IDENTITIES_FILE)) {
      throw new Error("❌ identities.json not found. Please add user identities first.");
    }

    const identities = JSON.parse(fs.readFileSync(IDENTITIES_FILE, "utf8"));
    if (!Array.isArray(identities) || identities.length === 0) {
      throw new Error("❌ identities.json is empty or invalid.");
    }

    console.log(`📦 Loaded ${identities.length} identities from ${IDENTITIES_FILE}`);

    console.log("\n🧩 Building Merkle Tree...");
    const { root, leaves } = await buildMerkleTree(identities);
    console.log(`✅ Merkle tree built successfully.`);
    console.log(`   ├─ Root: ${root}`);
    console.log(`   └─ Leaves: ${leaves.length}`);

    const treeData = {
      root: root.toString(),
      leaves: leaves.map((l) => l.toString()),
      timestamp: Date.now(),
    };

    fs.writeFileSync(TREE_FILE, JSON.stringify(treeData, null, 2));
    console.log(`\n💾 Saved new Merkle tree to ${TREE_FILE}`);

    // Optional: Update on-chain
    const shouldUpdate = process.argv.includes("--onchain");
    if (shouldUpdate) {
      const hexRoot = toBytes32Hex(root);
      console.log("\n🚀 Updating Merkle root on-chain...");
      console.log(`   Hex root: ${hexRoot}`);
      const tx = await merkleZkpContract.updateMerkleRoot(hexRoot);
      await tx.wait();
      console.log(`✅ On-chain update successful. Tx hash: ${tx.hash}`);
    } else {
      console.log("\n⚙️  Skipping on-chain update (run with --onchain to push root).");
    }

    console.log("\n🎉 Merkle tree rebuild process complete!\n");
  } catch (error) {
    console.error("❌ Error rebuilding Merkle tree:", error.message);
    process.exit(1);
  }
})();
