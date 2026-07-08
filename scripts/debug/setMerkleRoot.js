#!/usr/bin/env node
/**
 * setMerkleRoot.js
 * Sinkronisasi Merkle root lokal ke kontrak MerkleZKP di jaringan blockchain.
 *
 * Usage:
 *   node scripts/debug/setMerkleRoot.js [--dry]
 *
 * Options:
 *   --dry : Hanya menampilkan root lokal tanpa mengirim transaksi.
 */

require("dotenv").config();
const chalk = require("chalk");
const merkleZkpContract = require("../../src/contracts/merkleZkpContract");
const userMerkleModel = require("../../src/models/userMerkleModel");
const { toBytes32Hex } = require("../zkp-merkle-proof.js")

async function main() {
  const isDry = process.argv.includes("--dry");
  console.log(chalk.cyan.bold("\n🚀 Set/Update Merkle Root Script"));
  console.log(chalk.gray(`Mode: ${isDry ? "DRY-RUN (no tx sent)" : "LIVE (on-chain tx)"}`));

  // 1️⃣ Ambil tree dari file lokal
  const tree = await userMerkleModel.getMerkleTree();
  if (!tree || !tree.root) {
    console.error(chalk.red("❌ Merkle tree not found or invalid. Please run rebuildTreeFromUsers.js first."));
    process.exit(1);
  }

  const localRoot = tree.root.toString();
  console.log(chalk.green("📦 Local Merkle Root:"), localRoot);

  try {
    // 2️⃣ Ambil root on-chain
    const onChainRoot = await merkleZkpContract.currentMerkleRoot();
    console.log(chalk.yellow("🔹 On-chain Merkle Root:"), onChainRoot.toString());

    // 3️⃣ Bandingkan
    if (onChainRoot.toString() === localRoot.toString()) {
      console.log(chalk.green("✅ Root already up-to-date on-chain."));
      process.exit(0);
    }

    if (isDry) {
      console.log(chalk.yellow("🔸 DRY-RUN: will not send transaction."));
      console.log(chalk.gray("Would set on-chain root to:"), localRoot);
      process.exit(0);
    }

    // 4️⃣ Kirim transaksi update root
    console.log(chalk.blue("\n📤 Sending transaction to update on-chain Merkle root..."));

    // Convert decimal root ke bytes32
    const rootBigInt = BigInt(localRoot);
    const rootBytes32 = toBytes32Hex(rootBigInt);

    console.log(chalk.gray("🧩 Converted to bytes32:"), rootBytes32);
    const tx = await merkleZkpContract.updateMerkleRoot(rootBytes32);

    console.log(chalk.gray("⏳ Waiting for confirmation..."));
    const receipt = await tx.wait();

    console.log(chalk.green("\n✅ Merkle root updated successfully!"));
    console.log(chalk.gray("📄 Tx hash:"), chalk.yellow(receipt.hash));
    console.log(chalk.gray("🌳 New root:"), chalk.yellow(localRoot));

  } catch (err) {
    console.error(chalk.red("\n❌ Failed to update Merkle root:"), err.message || err);
    process.exit(1);
  }
}

main();