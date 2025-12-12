// const { ethers } = require("ethers");
const { keccak256, toUtf8Bytes } = require("ethers");
const { MerkleTree } = require("merkletreejs");

// =======================
// Generate user hash
// =======================
const generateUserHash = (userId) => {
  return keccak256(toUtf8Bytes(userId));
};

// =======================
// HELPER: hash function
// =======================
function hashFn(hexData) {
  // hexData harus string hex valid: "0x..."
  if (typeof hexData !== "string") {
    throw new Error("hashFn expects string hex data");
  }
  // ethers v6: keccak256 di ethers.hashes
  return keccak256(hexData);
}

// =======================
// HELPER: computeLeafHash
// =======================
function computeLeafHash(identityHash, salt) {
  // identityHash dan salt bisa BigInt atau string
  const identityHex = typeof identityHash === "bigint"
    ? "0x" + identityHash.toString(16)
    : identityHash.startsWith("0x") ? identityHash : "0x" + identityHash;

  const saltHex = typeof salt === "bigint"
    ? "0x" + salt.toString(16)
    : salt.startsWith("0x") ? salt : "0x" + salt;

  // Gabungkan identity + salt (hilangkan 0x di salt)
  const leafHex = identityHex + saltHex.slice(2);
  return hashFn(leafHex);
}

module.exports = {
  generateUserHash,
  hashFn,
  computeLeafHash,
};
