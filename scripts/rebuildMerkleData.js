/**
 * rebuildMerkleData.js
 * ------------------------------------
 * Rebuilds both:
 *  - merkle_tree.json (Merkle root & leaves)
 *  - merkle_users.json (user list with leafIndex)
 *
 * Based on /data/identities.json (manual data file)
 * Optionally updates the Merkle root on-chain with `--onchain`
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { buildMerkleTree } = require("./zkp-merkle-proof");
const merkleZkpContract = require("../src/contracts/merkleZkpContract");

// 📁 Path files
const IDENTITIES_FILE = path.resolve(__dirname, "../data/identities.json");
const TREE_FILE = path.resolve(__dirname, "../data/merkle_tree.json");
const USERS_FILE = path.resolve(__dirname, "../data/merkle_users.json");

(async () => {
  try {
    console.log("🌱 Starting full Merkle rebuild (users + tree)...\n");

    // 1️⃣ Load identities.json
    if (!fs.existsSync(IDENTITIES_FILE)) {
      throw new Error("❌ identities.json not found. Please add user identities first.");
    }

    const identities = JSON.parse(fs.readFileSync(IDENTITIES_FILE, "utf8"));
    if (!Array.isArray(identities) || identities.length === 0) {
      throw new Error("❌ identities.json is empty or invalid.");
    }

    console.log(`📦 Loaded ${identities.length} identities from ${IDENTITIES_FILE}`);

    // 2️⃣ Build Merkle Tree
    console.log("\n🧩 Building Merkle Tree...");
    const { root, leaves } = await buildMerkleTree(identities);
    console.log(`✅ Merkle tree built successfully.`);
    console.log(`   ├─ Root: ${root}`);
    console.log(`   └─ Total Leaves: ${leaves.length}`);

    // 3️⃣ Build merkle_users.json data
    const usersData = identities.map((item, index) => ({
      userId: item.userId || `user-${index + 1}`,
      identityHash: item.identityHash,
      salt: item.salt,
      leafIndex: index,
      status: "approved",
      approvedAt: Date.now(),
    }));

    fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
    console.log(`💾 Updated merkle_users.json (${usersData.length} users)`);

    // 4️⃣ Save merkle_tree.json
    const treeData = {
      root: root.toString(),
      leaves: leaves.map((l) => l.toString()),
      timestamp: Date.now(),
    };
    fs.writeFileSync(TREE_FILE, JSON.stringify(treeData, null, 2));
    console.log(`💾 Saved new Merkle tree to ${TREE_FILE}`);

    // 5️⃣ Optionally update on-chain
    const shouldUpdate = process.argv.includes("--onchain");
    if (shouldUpdate) {
      const hexRoot = "0x" + BigInt(root).toString(16).padStart(64, "0");
      console.log("\n🚀 Updating Merkle root on-chain...");
      console.log(`   Hex root: ${hexRoot}`);

      const tx = await merkleZkpContract.updateMerkleRoot(hexRoot);
      await tx.wait();
      console.log(`✅ On-chain update successful. Tx hash: ${tx.hash}`);
    } else {
      console.log("\n⚙️ Skipping on-chain update (run with --onchain to push root).");
    }

    console.log("\n🎉 Merkle users and tree rebuild complete!\n");
  } catch (error) {
    console.error("❌ Error rebuilding Merkle data:", error.message);
    process.exit(1);
  }
})();