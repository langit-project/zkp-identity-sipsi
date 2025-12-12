const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

/**
 * Utility class for handling Merkle Tree operations
 * using identityHash + salt as leaf.
 */
class MerkleTreeUtils {
  /**
   * Build a Merkle tree from user objects
   * @param {Array} users Array of user objects with {userId, identityHash, salt}
   * @returns {Object} tree, root, leaves, userLeafMap
   */
  static buildTreeFromUsers(users) {
    if (!users || users.length === 0) {
      // empty tree
      const tree = new MerkleTree([], keccak256, { sortPairs: true });
      return {
        tree,
        root: tree.getHexRoot(),
        leaves: [],
        userLeafMap: new Map(),
      };
    }

    const leaves = [];
    const userLeafMap = new Map();

    for (const user of users) {
      const leaf = keccak256(Buffer.from(user.identityHash + user.salt));
      leaves.push(leaf);
      userLeafMap.set(user.userId, { leaf, userData: user });
    }

    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    return {
      tree,
      root: tree.getHexRoot(),
      leaves,
      userLeafMap,
    };
  }

  /**
   * Incrementally add new users to an existing tree
   * @param {MerkleTree} existingTree
   * @param {Map} existingLeafMap
   * @param {Array} newUsers
   * @returns {Object} Updated tree and leaf map
   */
  static buildIncrementalTree(existingTree, existingLeafMap, newUsers) {
    const existingLeaves = existingTree ? existingTree.getLeaves() : [];
    const newLeaves = [];
    const userLeafMap = new Map(existingLeafMap); // clone

    for (const user of newUsers) {
      const leaf = keccak256(Buffer.from(user.identityHash + user.salt));
      newLeaves.push(leaf);
      userLeafMap.set(user.userId, { leaf, userData: user });
    }

    const allLeaves = [...existingLeaves, ...newLeaves];
    const tree = new MerkleTree(allLeaves, keccak256, { sortPairs: true });

    return {
      tree,
      root: tree.getHexRoot(),
      leaves: allLeaves,
      userLeafMap,
      newLeavesCount: newLeaves.length,
    };
  }

  /**
   * Generate Merkle proof for a user
   * @param {MerkleTree} tree
   * @param {Buffer} leaf
   * @returns {Object} proof, root, leaf, isValid
   */
  static generateProof(tree, leaf) {
    const proof = tree.getHexProof(leaf);
    const root = tree.getHexRoot();
    const isValid = tree.verify(proof, leaf, root);
    return { proof, root, leaf: leaf.toString("hex"), isValid };
  }

  /**
   * Verify a Merkle proof
   * @param {Array} proof
   * @param {Buffer} leaf
   * @param {string} root
   * @returns {boolean}
   */
  static verifyProof(proof, leaf, root) {
    return MerkleTree.verify(proof, leaf, root, keccak256);
  }

  /**
   * Serialize tree to JSON for storage
   * @param {MerkleTree} tree
   * @param {Map} userLeafMap
   * @returns {Object} serializable JSON
   */
  static serializeTree(tree, userLeafMap) {
    return {
      root: tree.getHexRoot(),
      leaves: tree.getLeaves().map((leaf) => leaf.toString("hex")),
      userMappings: Array.from(userLeafMap.entries()).map(([userId, data]) => ({
        userId,
        leaf: data.leaf.toString("hex"),
        userData: data.userData,
      })),
      timestamp: Date.now(),
    };
  }

  /**
   * Deserialize tree from JSON
   * @param {Object} treeData
   * @returns {Object} tree, userLeafMap, root
   */
  static deserializeTree(treeData) {
    const leaves = treeData.leaves.map((leafHex) => Buffer.from(leafHex, "hex"));
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

    const userLeafMap = new Map();
    for (const mapping of treeData.userMappings) {
      userLeafMap.set(mapping.userId, {
        leaf: Buffer.from(mapping.leaf, "hex"),
        userData: mapping.userData,
      });
    }

    return { tree, userLeafMap, root: tree.getHexRoot() };
  }

  /**
   * Validate tree integrity
   * @param {MerkleTree} tree
   * @param {Map} userLeafMap
   * @returns {Object} validation results
   */
  static validateTree(tree, userLeafMap) {
    const treeLeaves = tree.getLeaves();
    const mappedLeaves = Array.from(userLeafMap.values()).map((d) => d.leaf);

    const allMappedInTree = mappedLeaves.every((leaf) =>
      treeLeaves.some((treeLeaf) => treeLeaf.equals(leaf))
    );
    const hasExtraLeaves = treeLeaves.length > mappedLeaves.length;

    return {
      isValid: allMappedInTree && !hasExtraLeaves,
      treeLeafCount: treeLeaves.length,
      mappedLeafCount: mappedLeaves.length,
      allMappedInTree,
      hasExtraLeaves,
    };
  }

  /**
   * Find user by userId in tree
   * @param {Map} userLeafMap
   * @param {string} userId
   * @returns {Object|null}
   */
  static findUserInTree(userLeafMap, userId) {
    return userLeafMap.get(userId) || null;
  }
}

module.exports = MerkleTreeUtils;
