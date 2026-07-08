/**
 * debugLeafFromCircuit.js
 *
 * Hitung leaf hash persis seperti circuit IdentityMerkleProof.circom:
 * 
 * identityHash = Poseidon([nik, nama, ttl, key])
 * leaf = Poseidon([identityHash, salt, 1])
 */

const { buildPoseidon } = require("circomlibjs");

// Fungsi konversi string → BigInt (ascii ke field element)
function asciiToBigInt(str) {
  const bytes = Buffer.from(str, "utf8");
  let hex = "0x" + bytes.toString("hex");
  return BigInt(hex);
}

// Data user mentah
const userData = {
  nik: "12345678901234",
  nama: "Bella Anggraini Pratama",
  ttl: "20000101",
  key: "keybel",
  salt: "133705226350890688225606823547446713642",
};

async function computeLeaf(data) {
  const P = await buildPoseidon();

  // Step 1: identityHash = Poseidon([nik, nama, ttl, key])
  const identityInputs = [
    BigInt(data.nik),
    asciiToBigInt(data.nama),
    BigInt(data.ttl),
    asciiToBigInt(data.key),
  ];

  const identityHash = P.F.toObject(P(identityInputs));

  // Step 2: leaf = Poseidon([identityHash, salt, 1])
  const leafInputs = [identityHash, BigInt(data.salt), 1n];
  const leaf = P.F.toObject(P(leafInputs));

  console.log("🌱 Debug Leaf from Circuit Logic:");
  console.log("----------------------------------");
  console.log("🧩 Identity inputs :", identityInputs);
  console.log("🔹 Identity Hash   :", identityHash.toString());
  console.log("🍃 Leaf inputs     :", leafInputs);
  console.log("🌿 Leaf Hash       :", leaf.toString());
  console.log("----------------------------------");

  return { identityHash, leaf };
}

computeLeaf(userData).catch(console.error);
