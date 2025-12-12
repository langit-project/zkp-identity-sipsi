/**
 * Sync local Merkle tree root (from merkle_tree.json) to on-chain contract
 * ------------------------------------------------------------------------
 * Usage: node scripts/syncOnChainRoot.js
 */

const fs = require("fs");
const path = require("path");

// Pastikan path relatif terhadap /usr/src/app
const treeFilePath = path.resolve(__dirname, "../data/merkle_tree.json");

// Import service dan contract
const { buildMerkleTreeFromHashes } = require("../src/services/merkleZkpService");
const merkleZkpContract = require("../src/contracts/merkleZkpContract");

(async () => {
  try {
    console.log("🔍 Membaca file:", treeFilePath);
    const treeFile = JSON.parse(fs.readFileSync(treeFilePath, "utf8"));

    if (!treeFile.leaves || !treeFile.leaves.length) {
      throw new Error("❌ File merkle_tree.json tidak memiliki leaves valid!");
    }

    console.log(`📦 Ditemukan ${treeFile.leaves.length} leaves. Membangun ulang tree...`);
    const { root: localRoot, leaves } = await buildMerkleTreeFromHashes(treeFile.leaves);

    console.log("🌳 Local Merkle Root (dec):", localRoot);
    const rootHex = "0x" + BigInt(localRoot).toString(16).padStart(64, "0");
    console.log("🌳 Local Merkle Root (hex):", rootHex);

    // Konversi semua leaves ke format bytes32
    const identityHashesBytes32 = leaves.map((h) =>
      "0x" + BigInt(h).toString(16).padStart(64, "0")
    );

    console.log(`⛓️  Mengirim transaksi ke kontrak... (${identityHashesBytes32.length} identities)`);

    // Update Merkle root di kontrak
    const tx = await merkleZkpContract.updateMerkleRootWithIdentities(
      rootHex,
      identityHashesBytes32
    );
    console.log("📤 TX terkirim:", tx.hash);

    await tx.wait();
    console.log("✅ TX dikonfirmasi di blockchain");

    // Ambil root on-chain setelah update
    const contractRoot = await merkleZkpContract.currentMerkleRoot();
    console.log("🧩 Root di kontrak sekarang :", BigInt(contractRoot).toString());

    // Validasi cocok atau tidak
    if (BigInt(contractRoot).toString() === BigInt(localRoot).toString()) {
      console.log("🎯 Sinkronisasi berhasil! Root lokal dan kontrak sudah sama.");
    } else {
      console.log("⚠️  Root masih berbeda! Harap cek konfigurasi provider/wallet yang digunakan.");
    }

    console.log("Selesai ✅");
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  }
})();
