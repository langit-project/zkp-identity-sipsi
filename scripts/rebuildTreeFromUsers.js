/**
 * rebuildTreeFromUsers.js
 * ------------------------------------
 * Rebuilds:
 *  - merkle_tree.json (Merkle root & leaves)
 *
 * Based on /data/merkle_users.json
 * Optionally updates the Merkle root on-chain with `--onchain`
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { buildMerkleTree } = require("./zkp-merkle-proof");
const merkleZkpContract = require("../src/contracts/merkleZkpContract");

// 📁 Path files
const USERS_FILE = path.resolve(__dirname, "../data/merkle_users.json");
const TREE_FILE = path.resolve(__dirname, "../data/merkle_tree.json");

(async () => {
  try {
    console.log("🌱 Starting Merkle rebuild from merkle_users.json...\n");

    if (!fs.existsSync(USERS_FILE)) {
      throw new Error("❌ merkle_users.json not found. Please add user data first.");
    }

    // 1️⃣ Load users
    const usersObj = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    let users = Object.values(usersObj);

    if (!Array.isArray(users) || users.length === 0) {
      throw new Error("❌ merkle_users.json is empty or invalid.");
    }

    // Sort by leafIndex to maintain tree consistency
    users = users.sort((a, b) => a.leafIndex - b.leafIndex);

    // Validate identityHash & salt
    for (const user of users) {
      if (!user.identityHash || !user.salt) {
        throw new Error(
          `Missing identityHash or salt for userId: "${user.userId}"`
        );
      }
    }

    console.log(`📦 Loaded ${users.length} users from ${USERS_FILE}\n`);

    // 2️⃣ Build Merkle Tree
    console.log("🧩 Building Merkle Tree...");
    // Extract only identityHash + salt for hashing
    const leafData = users.map(u => ({
      identityHash: u.identityHash,
      salt: u.salt,
    }));
    const { root, leaves } = await buildMerkleTree(leafData);
    console.log(`✅ Merkle tree built successfully.`);
    console.log(`   ├─ Root: ${root}`);
    console.log(`   └─ Total Leaves: ${leaves.length}`);

    // 3️⃣ Save merkle_tree.json
    const treeData = {
      root: root.toString(),
      leaves: leaves.map(l => l.toString()),
      timestamp: Date.now(),
    };
    fs.writeFileSync(TREE_FILE, JSON.stringify(treeData, null, 2));
    console.log(`💾 Saved new Merkle tree to ${TREE_FILE}`);

    // 4️⃣ Optionally update on-chain
    const shouldUpdate = process.argv.includes("--onchain");
    if (shouldUpdate) {
    let hexRoot;

    if (typeof root === "string" && root.startsWith("0x")) {
        hexRoot = root;
    } else {
        const hex = BigInt(root).toString(16);
        hexRoot = "0x" + hex.padStart(64, "0");
    }

    console.log("\n🚀 Updating Merkle root on-chain...");
    console.log(`   Hex root: ${hexRoot}`);

    const tx = await merkleZkpContract.updateMerkleRoot(hexRoot);
    await tx.wait();
    console.log(`✅ On-chain update successful. Tx hash: ${tx.hash}`);
    } else {
    console.log("\n⚙️ Skipping on-chain update (run with --onchain to push root).");
    }


    console.log("\n🎉 Merkle tree rebuild complete!\n");
  } catch (error) {
    console.error("❌ Error rebuilding Merkle data:", error.message);
    process.exit(1);
  }
})();