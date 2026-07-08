const fs = require("fs").promises;
const path = require("path");
const MerkleTreeUtils = require("../utils/merkleUtils"); // pastikan path utils sesuai

const DATA_DIR = "./data";
const USERS_FILE = path.join(DATA_DIR, "merkle_users.json");
const TREE_FILE = path.join(DATA_DIR, "merkle_tree.json");

class UserMerkleModel {
  constructor() {
    this.ensureDataDir();
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (err) {
      console.error("❌ Error creating data directory:", err);
    }
  }

  // ======================
  // User data operations
  // ======================

  async saveUser(userId, userData) {
    const users = await this.getAllUsers();
    users[userId] = userData;
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  }

  async getUser(userId) {
    const users = await this.getAllUsers();
    return users[userId];
  }

  async getAllUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, "utf8");
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }

  async getApprovedUsers() {
    const users = await this.getAllUsers();
    const approved = [];

    for (const userData of Object.values(users)) {
      if (userData.status === "approved" || userData.status === "verified") {
        approved.push(userData);
      }
    }

    // Urutkan identityHash secara deterministik menggunakan BigInt-safe comparison
    approved.sort((a, b) => {
      const aHash = BigInt(a.identityHash);
      const bHash = BigInt(b.identityHash);
      if (aHash > bHash) return 1;
      if (aHash < bHash) return -1;
      return 0;
    });

    return approved;
  }

  // ======================
  // Merkle tree operations
  // ======================

  async saveMerkleTree(treeData) {
    await fs.writeFile(
      TREE_FILE,
      JSON.stringify(
        {
          root: treeData.root,
          leaves: treeData.leaves,
          timestamp: Date.now(),
        },
        null,
        2
      )
    );
  }

  async getMerkleTree() {
    try {
      const data = await fs.readFile(TREE_FILE, "utf8");
      const tree = JSON.parse(data);
      tree.leavesData = tree.leaves || [];
      return tree;
    } catch (err) {
      return null;
    }
  }

  async rebuildMerkleTreeFromUsers() {
    const approvedUsers = await this.getApprovedUsers();

    // Build Merkle tree menggunakan MerkleTreeUtils
    const { tree, root, leaves, userLeafMap } = MerkleTreeUtils.buildTreeFromUsers(
      approvedUsers.map(u => ({ userId: u.userId, identityHash: u.identityHash, salt: u.salt }))
    );

    // Simpan ke file
    await this.saveMerkleTree({ root, leaves });

    // Tambahkan properti leavesData untuk kompatibilitas lama
    tree.leavesData = leaves;

    return { tree, root, leaves, userLeafMap };
  }

  // ======================
  // User status checks
  // ======================

  async isSubmitted(userId) {
    const user = await this.getUser(userId);
    return !!user;
  }

  async isApproved(userId) {
    const user = await this.getUser(userId);
    return user && (user.status === "approved" || user.status === "verified");
  }

  async isVerified(userId) {
    const user = await this.getUser(userId);
    return user && user.status === "verified";
  }
}

module.exports = new UserMerkleModel();
