// ./scripts/rebuildMerkle.js
const userMerkleModel = require("../src/models/userMerkleModel");
const merkleZkpService = require("../src/services/merkleZkpService");

const merkleZkpContract = require("../src/contracts/merkleZkpContract");

(async () => {
  try {
    console.log("🔄 Starting Merkle tree rebuild from users...");

    // Ambil semua approved users
    const approvedUsersMap = await userMerkleModel.getApprovedUsers();
    console.log(`📦 Approved users count: ${Object.keys(approvedUsersMap).length}`);

    // Rebuild Merkle tree via service
    const { merkleTree, newRoot, leafIndex, identityHashes } = await merkleZkpService.rebuildMerkleTree();
    console.log("✅ Merkle tree rebuilt successfully", newRoot);

    console.log("\n🎯 Rebuilt Merkle Tree:");
    console.log(`   Total leaves: ${merkleTree.leavesData.length}`);
    console.log(`   Root: ${newRoot}`);

    // Simpan ke userMerkleModel
    await userMerkleModel.saveMerkleTree({
      root: newRoot,
      leaves: merkleTree.leavesData,
      timestamp: Date.now(),
    });
    console.log("💾 Merkle tree saved to userMerkleModel");

    // Push ke contract jika ada flag --onchain
    if (process.argv.includes("--onchain")) {
      console.log("\n⚙️  Updating on-chain Merkle root...");
      const rootBytes32 = "0x" + BigInt(newRoot).toString(16).padStart(64, "0");
      const identityHashesBytes32 = identityHashes.map(h =>
        "0x" + BigInt(h).toString(16).padStart(64, "0")
      );

      const tx = await merkleZkpContract.updateMerkleRootWithIdentities(
        rootBytes32,
        identityHashesBytes32
      );
      await tx.wait();
      console.log(`✅ On-chain update successful. Tx hash: ${tx.hash}`);
    } else {
      console.log("\n⚙️  Skipping on-chain update (run with --onchain to push root).");
    }

    console.log("\n🎉 Merkle tree rebuild process complete!\n");
  } catch (error) {
    console.error("❌ Error rebuilding Merkle tree:", error);
    process.exit(1);
  }
})();
