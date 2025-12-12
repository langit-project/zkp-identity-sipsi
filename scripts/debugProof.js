/**
 * debugProof.js
 *
 * Jalankan proof berdasarkan circuit IdentityMerkleProof
 * tanpa verifikasi eksternal (vkey), tapi dengan log internal
 * agar bisa dibandingkan dengan hasil debugLeaf dan debugMerkle.
 */

const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");

// Konfigurasi dasar
const CIRCUIT_NAME = "IdentityMerkleProof";
const BUILD_DIR = "./proof";
const WASM_FILE = path.join(BUILD_DIR, `${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm`);
const ZKEY_FILE = path.join(BUILD_DIR, `${CIRCUIT_NAME}_final.zkey`);

async function main() {
  console.log("🌱 ===== DEBUG PROOF START =====");

  // --- Input mentah sesuai dengan debugMerkle & debugLeafFromCircuit ---
    const input = {
        // 🌳 Merkle root hasil debugMerkle.js
        merkleRoot: "2714951287474471521919649261523442984585596758066340426402680700273415625290",

        // 👤 Data identitas mentah (belum di-hash, sesuai circuit Poseidon(4))
        nik: "12345678901234",                       
        nama: "Bella Anggraini Pratama",             
        ttl: "20000101",                             
        key: "keybel",                               

        // 🧂 Salt sesuai debugMerkle
        salt: "133705226350890688225606823547446713642",

        // 🪜 Bukti merkle path (dari debugMerkle)
        pathElements: [
            "19279013947509501699373079893655052631053218109824950988363238743926396606067",
            "0","0","0","0","0","0","0","0","0","0","0","0","0","0","0"
        ],
        pathIndices: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    };


  fs.writeFileSync("input.json", JSON.stringify(input, null, 2));
  console.log("📝 input.json berhasil disimpan.");

  // --- Pastikan file circuit tersedia ---
  if (!fs.existsSync(WASM_FILE) || !fs.existsSync(ZKEY_FILE)) {
    console.error("❌ File circuit tidak ditemukan di ./proof/. Pastikan .wasm dan .zkey tersedia.");
    process.exit(1);
  }

  // --- Generate proof dari input mentah ---
  console.log("⚙️  Generating proof dari input.json ...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_FILE, ZKEY_FILE);

  console.log("✅ Proof berhasil dibuat!");
  console.log("----------------------------------");
  console.log("📄 Public Signals:");
  console.log(publicSignals);
  console.log("----------------------------------");

  // --- Debug tambahan ---
  console.log("🧩 Debug Internal Values:");
  console.log(`   Merkle Root (public): ${publicSignals[0]}`);
  console.log("   (Bandingkan dengan hasil dari debugMerkle.js)");
  console.log("   Seharusnya sama dengan:");
  console.log("   2714951287474471521919649261523442984585596758066340426402680700273415625290");
  console.log("----------------------------------");

  console.log("🧾 Proof Object:");
  console.log(JSON.stringify(proof, null, 2));

  console.log("🌱 ===== DEBUG PROOF END =====");
}

// Jalankan
main().catch((err) => {
  console.error("❌ Terjadi error saat membuat proof:");
  console.error(err);
});
