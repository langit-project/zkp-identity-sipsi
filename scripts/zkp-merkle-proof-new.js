/**
 * ./scripts/generateMerkleProofDebugFixed.js
 * ------------------------------------------
 * Generate Merkle proof compatible with IdentityMerkleProof circuit
 * Focus: debug-friendly, leaf calculation, pathElements, flipped pathIndices
 */

const fs = require("fs");
const path = require("path");
const poseidonFactory = require("circomlibjs").buildPoseidon;

class SimpleMerkleTree {
  constructor(leaves, levels = 16) {
    this.leaves = leaves.map(l => BigInt(l));
    this.levels = levels;
    this.tree = [];
    this.poseidonLib = null;
  }

  async initialize(poseidonLib) {
    this.poseidonLib = poseidonLib;
    await this.buildTree();
  }

  async buildTree() {
    if (!this.poseidonLib) throw new Error("Poseidon library not set");

    // Initialize tree
    for (let i = 0; i <= this.levels; i++) this.tree[i] = [];

    this.tree[0] = [...this.leaves];

    // Pad leaves to 2^levels
    const maxLeaves = 2 ** this.levels;
    while (this.tree[0].length < maxLeaves) this.tree[0].push(0n);

    // Build tree bottom-up
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
    const proof = { pathElements: [], pathIndices: [] };
    let currentIndex = leafIndex;

    for (let level = 0; level < this.levels; level++) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
      const sibling = this.tree[level][siblingIndex] || 0n;
      proof.pathElements.push(sibling);

      // Flip pathIndices to match circuit logic (0=left, 1=right)
      proof.pathIndices.push(isRightNode ? 0 : 1);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }
}

// Helper resmi untuk leaf
async function computeLeaf(identityHash, salt) {
  const P = await poseidonFactory();
  return P.F.toObject(P([BigInt(identityHash), BigInt(salt), 1n]));
}

// Build Merkle tree from identities.json
async function buildMerkleTree(usersData) {
  const poseidon = await poseidonFactory();
  const leaves = [];

  for (const userData of usersData) {
    if (!userData.identityHash || !userData.salt) {
      throw new Error(`Missing identityHash or salt for user: ${JSON.stringify(userData)}`);
    }
    const leafHash = await computeLeaf(userData.identityHash, userData.salt);
    leaves.push(leafHash.toString());
  }

  const merkleTree = new SimpleMerkleTree(leaves, 16);
  await merkleTree.initialize(poseidon);

  return {
    tree: merkleTree,
    root: merkleTree.getRoot().toString(),
    leaves
  };
}

// Generate Merkle proof
function generateMerkleProofDebugFixed(tree, leaves, leafIndex) {
  console.log("🔍 [DEBUG] Generate Merkle Proof (Fixed)");

  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(`Leaf index ${leafIndex} tidak valid.`);
  }

  const leaf = leaves[leafIndex];
  const pathElements = [];
  const pathIndices = [];

  let index = leafIndex;
  let currentLevel = leaves.map(v => v);

  while (currentLevel.length > 1) {
    const isRightNode = index % 2;
    const pairIndex = isRightNode ? index - 1 : index + 1;

    const sibling =
      pairIndex < currentLevel.length ? currentLevel[pairIndex] : currentLevel[index];

    pathElements.push(sibling);
    pathIndices.push(isRightNode ? 1 : 0);

    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      const combined = keccak256(
        Buffer.concat([
          Buffer.from(BigInt(left).toString(16).padStart(64, "0"), "hex"),
          Buffer.from(BigInt(right).toString(16).padStart(64, "0"), "hex"),
        ])
      );
      nextLevel.push(BigInt(combined));
    }

    index = Math.floor(index / 2);
    currentLevel = nextLevel;
  }

  return {
    leaf,
    pathElements,
    pathIndices,
    root: currentLevel[0],
  };
}

module.exports = { generateMerkleProofDebugFixed, buildMerkleTree, computeLeaf };