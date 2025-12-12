const fs = require("fs");
const path = require("path");
const { buildMerkleTree } = require("../zkp-merkle-proof-new");

async function rebuildMerkleTreeDebug(targetUserId = null) {
  console.log("🔄 [DEBUG] Rebuilding Merkle Tree from merkle_users.json ...");

  const usersPath = path.resolve(__dirname, "../data/merkle_users.json");
  if (!fs.existsSync(usersPath)) throw new Error(`File tidak ditemukan: ${usersPath}`);

  const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
  const userArray = Array.isArray(users) ? users : Object.values(users);
  console.log(`📦 Loaded ${userArray.length} entries from merkle_users.json`);

  userArray.sort((a, b) => (BigInt(a.identityHash) > BigInt(b.identityHash) ? 1 : -1));
  const leavesData = userArray.map(u => ({ identityHash: u.identityHash, salt: u.salt }));

  let targetLeafIndex = -1;
  let targetUser = null;
  if (targetUserId) {
    targetLeafIndex = userArray.findIndex(u => u.userId === targetUserId);
    if (targetLeafIndex !== -1) targetUser = userArray[targetLeafIndex];
  }

  const { tree, root, leaves } = await buildMerkleTree(leavesData);
  console.log(`🌿 Root baru: ${root}`);

  const treePath = path.resolve(__dirname, "../data/merkle_tree.json");
  if (fs.existsSync(treePath)) {
    const savedTree = JSON.parse(fs.readFileSync(treePath, "utf8"));
    console.log(root === savedTree.root ? "✅ Root MATCH" : "❌ Root mismatch!");
  }

  const debugOutputPath = path.resolve(__dirname, "../data/merkle_tree_debug.json");
  fs.writeFileSync(debugOutputPath, JSON.stringify({ root, leaves, leavesData }, null, 2));
  console.log(`🧩 Saved debug tree -> ${debugOutputPath}`);

  return { tree, root, leaves, leavesData, targetLeafIndex, targetUser };
}

module.exports = { rebuildMerkleTreeDebug };
