/**
 * Jalankan debug pipeline lengkap:
 * 1. Rebuild Merkle Tree
 * 2. Generate Merkle Proof (Fixed)
 * 3. Verify manual
 */

const { rebuildMerkleTreeDebug } = require("./rebuildMerkleTreeDebug");
const { generateMerkleProofDebugFixed } = require("../zkp-merkle-proof-new");
const { verifyUserDebug } = require("./verifyUserDebug");

(async () => {
  const targetUserId = process.argv[2] || "12345678901234";
  console.log(`🚀 [RUN] Starting full debug for userId: ${targetUserId}\n`);

  const { tree, root, leaves, targetLeafIndex, targetUser } =
    await rebuildMerkleTreeDebug(targetUserId);

  if (!targetUser || targetLeafIndex === -1) {
    console.error("❌ Target user tidak ditemukan di merkle_users.json");
    process.exit(1);
  }

  const proof = generateMerkleProofDebugFixed(tree, leaves, targetLeafIndex);

  console.log("\n🧠 Proof details:");
  console.log(JSON.stringify(proof, null, 2));

  await verifyUserDebug({
    user: targetUser,
    proof,
    root,
  });

  console.log("\n✅ [DONE] Full debug completed.\n");
})();
