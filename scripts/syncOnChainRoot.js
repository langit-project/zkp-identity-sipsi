/**
 * Sinkronisasi Merkle Root ke Blockchain
 * --------------------------------------
 * Membaca data dari /data/merkle_users.json
 * Membangun Merkle Tree menggunakan identityHash + salt
 * Kemudian mengirim update ke kontrak (updateMerkleRootWithIdentities)
 *
 * Jalankan:
 *   node scripts/syncOnChainRoot.js
 */

const fs = require("fs");
const path = require("path");

// Karena buildMerkleTree.js ada di folder yang sama:
const { buildMerkleTree } = require("./zkp-merkle-proof");
const merkleZkpContract = require("../src/contracts/merkleZkpContract");

(async () => {
  try {
    const dataPath = path.resolve(__dirname, "../data/merkle_users.json");
    console.log("🔍 Membaca file:", dataPath);

    if (!fs.existsSync(dataPath)) {
      throw new Error("File merkle_users.json tidak ditemukan!");
    }

    const fileData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const users = Object.values(fileData);

    if (!users.length) {
      throw new Error("❌ Tidak ada data user di merkle_users.json");
    }

    console.log(`📦 Ditemukan ${users.length} pengguna, memproses...`);

    // Validasi isi data sebelum lanjut
    for (const user of users) {
      if (!user.identityHash || !user.salt) {
        throw new Error(
          `❌ Data tidak lengkap untuk user ${user.userId || "(tanpa ID)"} — identityHash/salt hilang.`
        );
      }
    }

    // Format sesuai kebutuhan buildMerkleTree()
    const formattedUsers = users.map((u) => ({
      identityHash: u.identityHash,
      salt: u.salt,
    }));

    console.log("🌳 Membangun ulang Merkle Tree...");
    const { root: localRoot, leaves } = await buildMerkleTree(formattedUsers);

    const rootHex = "0x" + BigInt(localRoot).toString(16).padStart(64, "0");
    console.log("🌱 Root Lokal (hex):", rootHex);

    // Konversi daun ke bytes32
    const identityHashesBytes32 = leaves.map((h) =>
      "0x" + BigInt(h).toString(16).padStart(64, "0")
    );

    console.log(`⛓️  Mengirim transaksi updateMerkleRootWithIdentities...`);
    const tx = await merkleZkpContract.updateMerkleRootWithIdentities(
      rootHex,
      identityHashesBytes32
    );

    console.log("📤 TX dikirim:", tx.hash);
    await tx.wait();
    console.log("✅ TX dikonfirmasi di blockchain");

    // Validasi hasil di kontrak
    const onChainRoot = await merkleZkpContract.currentMerkleRoot();
    console.log("🧩 Root di kontrak :", onChainRoot);

    if (BigInt(onChainRoot) === BigInt(localRoot)) {
      console.log("🎯 Sinkronisasi sukses — root lokal dan on-chain sudah cocok!");
    } else {
      console.warn("⚠️  Root masih berbeda, cek kembali jaringan atau wallet yang digunakan.");
    }

    console.log("Selesai ✅");
  } catch (err) {
    console.error("\n❌ Terjadi kesalahan:");
    console.error(err.message);
    process.exit(1);
  }
})();