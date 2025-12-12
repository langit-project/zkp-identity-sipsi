const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");
const poseidonFactory = require("circomlibjs").buildPoseidon;

const CIRCUIT_NAME = "IdentityMerkleProof";
const BUILD_DIR = "./proof";
const WASM_FILE = path.join(BUILD_DIR, `${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm`);
const ZKEY_FILE = path.join(BUILD_DIR, `${CIRCUIT_NAME}_final.zkey`);


// Simple Merkle Tree implementation
class SimpleMerkleTree {
  constructor(leaves, levels = 16) {
    this.leaves = leaves.map((l) => BigInt(l));
    this.levels = levels;
    this.tree = [];
    this.poseidonLib = null;
  }

  async initialize(poseidonLib) {
    this.poseidonLib = poseidonLib;
    await this.buildTree();
  }

  async buildTree() {
    if (!this.poseidonLib) {
      throw new Error("Poseidon library not set");
    }

    // Initialize tree array
    for (let i = 0; i <= this.levels; i++) {
      this.tree[i] = [];
    }

    // Set leaves at level 0
    this.tree[0] = [...this.leaves];

    // Pad leaves to power of 2
    const maxLeaves = 2 ** this.levels;
    while (this.tree[0].length < maxLeaves) {
      this.tree[0].push(0n);
    }

    // Build tree from bottom to top
    for (let level = 0; level < this.levels; level++) {
      const currentLevel = this.tree[level];
      const nextLevel = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || 0n;
        const parent = this.poseidonHash(left, right);
        nextLevel.push(parent);
      }

      this.tree[level + 1] = nextLevel;
    }
  }

  poseidonHash(left, right) {
    return this.poseidonLib.F.toObject(this.poseidonLib([BigInt(left), BigInt(right)]));
  }

  getRoot() {
    return this.tree[this.levels][0];
  }

  getProof(leafIndex) {
    const proof = {
      pathElements: [],
      pathIndices: [],
    };

    let currentIndex = leafIndex;

    for (let level = 0; level < this.levels; level++) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      const sibling = this.tree[level][siblingIndex] || 0n;
      proof.pathElements.push(sibling);

      // 0 = sibling is on left, 1 = sibling is on right
      proof.pathIndices.push(isRightNode ? 0 : 1);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  getProofBackup(leafIndex) {
    const proof = {
      pathElements: [],
      pathIndices: [],
    };

    let currentIndex = leafIndex;

    for (let level = 0; level < this.levels; level++) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      const sibling = this.tree[level][siblingIndex] || 0n;
      proof.pathElements.push(sibling);

      // pathIndices mengikuti posisi CURRENT node: 0=left, 1=right
      proof.pathIndices.push(isRightNode ? 1 : 0);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }
}

/**
 * Hitung leaf Merkle sesuai logika Circom
 * leaf = Poseidon([identityHash, salt, 1])
 */
async function computeLeaf(identityHash, salt) {
  const P = await poseidonFactory();
  return P.F.toObject(P([ BigInt(identityHash), BigInt(salt), 1n ]));
}

/**
 * Ubah BigInt ke bytes32 hex dengan prefix 0x
 */
function toBytes32Hex(value) {
  return "0x" + BigInt(value).toString(16).padStart(64, "0");
}


// Build Merkle tree from user data that contains identityHash and salt
async function buildMerkleTree(usersData) {
  const poseidon = await poseidonFactory();
  const leaves = [];

  console.log("Building Merkle tree with", usersData.length, "users");

  // Generate leaves from identity hashes
  for (const userData of usersData) {
    if (!userData.identityHash || !userData.salt) {
      throw new Error(`Missing identityHash or salt for user data: ${JSON.stringify(userData)}`);
    }
    const leafHash = await computeLeaf(userData.identityHash, userData.salt);
    leaves.push(leafHash.toString());
  }

  // Create and build Merkle tree
  const merkleTree = new SimpleMerkleTree(leaves, 16);
  await merkleTree.initialize(poseidon);

  const root = merkleTree.getRoot().toString();

  console.log("Merkle tree built. Root:", root);
  console.log("Number of leaves:", leaves.length);

  return { tree: merkleTree, root, leaves };
}

// Generate Merkle proof for verification
/**
 * Generate Merkle proof for user verification
 */
async function generateMerkleProof({ nik, nama, ttl, key, salt, leafIndex, merkleTree, zkpService }) {
  console.group(`🧩 Generating Merkle proof for leaf index ${leafIndex}`);
  
  console.log("🌱 Tree leaves count:", merkleTree.leaves?.length || 0);
  const { identityHash, namaBigInt, keyBigInt } = await zkpService.calculateIdentityHash(nik, nama, ttl, key);

  console.log("🔹 identityHash:", identityHash.toString());
  console.log("🔹 namaBigInt:", namaBigInt.toString());
  console.log("🔹 keyBigInt:", keyBigInt.toString());

  if (typeof merkleTree.getProof !== "function") {
    console.error("❌ Invalid MerkleTree object — missing getProof()");
    throw new Error("Invalid MerkleTree object - missing getProof()");
  }

  // Dapatkan proof dan root dari tree
  const merkleProof = merkleTree.getProof(leafIndex);
  const merkleRoot = merkleTree.getRoot().toString();

  // Validasi leaf konsisten dengan input
  const leafFromInputs = await computeLeaf(identityHash, salt);
  const leafInTree = merkleTree.leaves[leafIndex];
  console.log("🔹 leafFromInputs:", leafFromInputs.toString());
  console.log("🔹 leafInTree:", leafInTree.toString());

  if (leafFromInputs.toString() !== leafInTree.toString()) {
    throw new Error("❌ Leaf mismatch: computed leaf from inputs != leaf in Merkle tree");
  }

  // Siapkan input untuk circuit
  const input = {
    merkleRoot,
    nik: String(nik).replace(/\D/g, ""),
    ttl: String(ttl).replace(/\D/g, ""),
    nama: namaBigInt.toString(),
    key: keyBigInt.toString(),
    pathElements: merkleProof.pathElements.map((p) => p.toString()),
    pathIndices: merkleProof.pathIndices,
    salt: salt.toString(),
  };

  console.log("🔸 Circuit input:", input);

  try {
    console.log("⚙️ Generating witness...");
    const wasmBuffer = fs.readFileSync(WASM_FILE);
    const witnessCalculatorBuilder = require(`../${BUILD_DIR}/${CIRCUIT_NAME}_js/witness_calculator.js`);
    const wc = await witnessCalculatorBuilder(wasmBuffer);
    const witness = await wc.calculateWTNSBin(input, 0);

    console.log("⚙️ Generating Groth16 proof...");
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY_FILE, witness);

    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ];
    const c = [proof.pi_c[0], proof.pi_c[1]];

    console.log("✅ Proof generated successfully");
    console.groupEnd();

    return {
      proof: { a, b, c },
      publicSignals,
      merkleRoot,
      leaf: leafFromInputs.toString(),
    };
  } catch (err) {
    console.groupEnd();
    console.error("❌ Proof generation failed:", err);
    throw new Error("Failed to generate Merkle proof");
  }
}


// // Generate Merkle proof for verification
// async function generateMerkleProof({ nik, nama, ttl, key, salt, leafIndex, merkleTree }) {
//   console.log("Generating Merkle proof for user at index:", leafIndex);
//   console.log("Tree has", merkleTree.leaves.length, "leaves");

//   // const poseidon = await poseidonFactory();

//   // Convert nama and key to BigInt
//   // const namaHex = Buffer.from(nama, "utf8").toString("hex");
//   // const namaBigInt = BigInt("0x" + namaHex);
//   // const keyHex = Buffer.from(key, "utf8").toString("hex");
//   // const keyBigInt = BigInt("0x" + keyHex);

//   // === NORMALISASI HARUS SAMA DENGAN calculateIdentityHash ===
//   const nikNorm  = String(nik).replace(/\D/g, "");
//   const ttlNorm  = String(ttl).replace(/\D/g, "");
//   const namaNorm = String(nama).trim();      // pakai .toLowerCase() bila circuit pakai lowercase
//   const keyNorm  = String(key).trim();
  
//   const namaHex = Buffer.from(namaNorm, "utf8").toString("hex");
//   const keyHex  = Buffer.from(keyNorm,  "utf8").toString("hex");
//   const namaBigInt = BigInt("0x" + namaHex);
//   const keyBigInt  = BigInt("0x" + keyHex);

//   // Verify the tree has the getProof method
//   if (typeof merkleTree.getProof !== "function") {
//     console.error("MerkleTree object:", merkleTree);
//     throw new Error("Invalid merkleTree object - missing getProof method");
//   }

//   // Get Merkle proof
//   const merkleProof = merkleTree.getProof(leafIndex);
//   const merkleRoot = merkleTree.getRoot().toString();

//   // Create input for circuit
//   const input = {
//     // Public input
//     merkleRoot: merkleRoot,

//     // Private inputs - Identity
//     // nik: nik.toString(),
//     // nama: namaBigInt.toString(),
//     // ttl: ttl.toString(),
//     // key: keyBigInt.toString(),
  
//     merkleRoot: merkleRoot,
//     nik: nikNorm,                 // sudah digits-only
//     nama: namaBigInt.toString(),  // BigInt dari UTF-8 namaNorm
//     ttl: ttlNorm,                 // sudah digits-only
//     key: keyBigInt.toString(),    // BigInt dari UTF-8 keyNorm

//     // Private inputs - Merkle proof
//     pathElements: merkleProof.pathElements.map((p) => p.toString()),
//     pathIndices: merkleProof.pathIndices,
//     salt: salt.toString(),
//   };

//   console.log("Circuit input prepared, generating proof...");

//   // Generate witness
//   const wasmBuffer = fs.readFileSync(WASM_FILE);
//   const witnessCalculatorBuilder = require(`../${BUILD_DIR}/${CIRCUIT_NAME}_js/witness_calculator.js`);
//   const wc = await witnessCalculatorBuilder(wasmBuffer);
//   const witness = await wc.calculateWTNSBin(input, 0);

//   // Generate proof
//   const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY_FILE, witness);

//   // Format proof for smart contract
//   const a = [proof.pi_a[0], proof.pi_a[1]];
//   const b = [
//     [proof.pi_b[0][1], proof.pi_b[0][0]],
//     [proof.pi_b[1][1], proof.pi_b[1][0]],
//   ];
//   const c = [proof.pi_c[0], proof.pi_c[1]];

//   return {
//     proof: { a, b, c },
//     publicSignals,
//     merkleRoot,
//   };
// }

module.exports = {
  computeLeaf,
  generateMerkleProof,
  buildMerkleTree,
  toBytes32Hex, // 🔹 tambahkan export baru
};