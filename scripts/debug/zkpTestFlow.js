#!/usr/bin/env node
/**
 * zkpTestFlow.js
 * End-to-end test menggunakan service merkleZkpService.
 * 
 * Hardcoded user: Zahra Anggraini Dewi
 * Jalankan dengan:
 *   node src/tests/zkpTestFlow.js [--dry]
 */

require("dotenv").config();
const chalk = require("chalk");

const userMerkleModel = require("../../src/models/userMerkleModel");
const merkleZkpService = require("../../src/services/merkleZkpService");
const merkleZkpContract = require("../../src/contracts/merkleZkpContract");

async function main() {
  const isDry = process.argv.includes("--dry");

  // 🧩 Hardcoded test user
  const testUser = {
    userId: "3201010102980100",
    nik: "3201010102980100",
    nama: "Zahra Anggraini Dewi",
    ttl: "20000101",
    key: "Zahra0"
  };

  console.log(chalk.cyan.bold(`\n🚀 ZKP Test Flow for user: ${testUser.nama} (${testUser.userId})`));
  console.log(chalk.gray(`Mode: ${isDry ? "DRY-RUN (no tx sent)" : "LIVE (on-chain txs)"}`));

  // --- 1️⃣ Ambil data user
  const user = await userMerkleModel.getUser(testUser.userId);
  if (!user) {
    console.error(chalk.red(`❌ User ${testUser.userId} not found in merkle_users.json`));
    process.exit(1);
  }

  console.log(chalk.gray("User snapshot:"), {
    status: user.status,
    identityHash: user.identityHash,
    salt: user.salt,
    leafIndex: user.leafIndex ?? "N/A",
  });

  if (user.status === "verified") {
    console.log(chalk.yellow("⚠️ User already verified — skipping approval."));
  }

  try {
    // --- 2️⃣ Approve user (update root + on-chain update)
    console.log(chalk.blue("\n[STEP 1] Approving user and updating Merkle root..."));

    if (isDry) {
      console.log(chalk.yellow("🔸 DRY-RUN: calling rebuildMerkleTree only (no tx sent)"));
      const { newRoot } = await merkleZkpService.rebuildMerkleTree();
      console.log(chalk.green("✅ Local Merkle root updated (simulation):"), newRoot.toString());
    } else {
      const onChainRoot = await merkleZkpService.approveUser(testUser.userId);
      console.log(chalk.green("✅ approveUser finished. On-chain root:"), onChainRoot.toString());
    }

    // --- 3️⃣ Pastikan Merkle tree local sudah diperbarui
    console.log(chalk.blue("\n[STEP 2] Refreshing local Merkle tree..."));
    const rebuilt = await merkleZkpService.rebuildMerkleTree();
    console.log(chalk.green("✅ Local tree root:"), rebuilt.newRoot.toString());

    // --- 4️⃣ Verifikasi identitas (ZKP)
    console.log(chalk.blue("\n[STEP 3] Generating proof and verifying identity..."));

    if (isDry) {
      console.log(chalk.yellow("🔸 DRY-RUN: simulate proof generation and callStatic only"));
      try {
        await merkleZkpService.verifyUser(
          testUser.userId,
          testUser.nik,
          testUser.nama,
          testUser.ttl,
          testUser.key,
          true // simulate
        );
        console.log(chalk.green("✅ Simulation passed (proof valid and verified locally)"));
      } catch (err) {
        console.error(chalk.red("❌ Simulation failed:"), err.message || err);
      }
    } else {
      const result = await merkleZkpService.verifyUser(
        testUser.userId,
        testUser.nik,
        testUser.nama,
        testUser.ttl,
        testUser.key,
        false // actually send tx
      );

      console.log(chalk.green("\n✅ Verification success!"));
      console.log(chalk.gray("Transaction hash:"), chalk.yellow(result.hash));
      console.log(chalk.gray("Merkle root (on-chain):"), chalk.yellow(result.merkleRoot));
    }

    // --- 5️⃣ Cek final root di on-chain
    const finalRoot = await merkleZkpContract.currentMerkleRoot();
    console.log(chalk.blue("\n[FINAL] On-chain Merkle root:"), finalRoot.toString());

    console.log(chalk.green.bold(`\n🎉 ${isDry ? "DRY TEST" : "LIVE TX"} flow completed successfully!\n`));
    process.exit(0);
  } catch (err) {
    console.error(chalk.red("\n❌ Test failed:"), err.message || err);
    process.exit(1);
  }
}

main();
