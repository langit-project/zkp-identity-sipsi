const { generateMerkleProof, buildMerkleTree, computeLeaf, toBytes32Hex } = require("../../scripts/zkp-merkle-proof");
const merkleZkpContract = require("../contracts/merkleZkpContract");
const { generateUserHash } = require("../utils/hash");
const userMerkleModel = require("../models/userMerkleModel");
const crypto = require("crypto");

let currentMerkleTree = null;

class MerkleZKPService {
  constructor() {
    // Initialize with empty Merkle tree
    this.initializeMerkleTree();
  }

  async initializeMerkleTree() {
    try {
      // Coba load tree dari file
      const savedTree = await userMerkleModel.getMerkleTree();
      if (savedTree?.leavesData?.length) {
        currentMerkleTree = { ...savedTree, leavesData: savedTree.leavesData };
        console.log("✅ Loaded Merkle tree from file:", savedTree.root);
      } else {
        // Jika tidak ada file, rebuild dari user
        console.log("⚠️ No saved tree found, rebuilding from approved users...");
        const { tree, root, leaves, userLeafMap } = await userMerkleModel.rebuildMerkleTreeFromUsers();
        currentMerkleTree = { tree, root, leaves, userLeafMap, leavesData: leaves };
        console.log("✅ Rebuilt Merkle tree, root:", root);
      }
    } catch (err) {
      console.error("❌ Error initializing Merkle tree:", err);

      // fallback: rebuild dari user agar tetap bisa jalan
      try {
        const { tree, root, leaves, userLeafMap } = await userMerkleModel.rebuildMerkleTreeFromUsers();
        currentMerkleTree = { tree, root, leaves, userLeafMap, leavesData: leaves };
        console.log("⚠️ Rebuilt Merkle tree after error, root:", root);
      } catch (rebuildErr) {
        console.error("❌ Failed to rebuild Merkle tree:", rebuildErr);
        // Initialize empty tree sebagai last resort
        currentMerkleTree = { tree: null, root: null, leaves: [], userLeafMap: new Map(), leavesData: [] };
        console.log("⚠️ Initialized empty Merkle tree as fallback");
      }
    }
  }

  async getContractAddress() {
    return await merkleZkpContract.getAddress();
  }


  async submitUserData(userId, nik, nama, ttl, key) {
    console.group("🌱 submitUserData started for userId:", userId);

    const userHash = generateUserHash(userId);
    console.log("🔹 Generated userHash:", userHash);

    const salt = crypto.randomBytes(16).toString("hex");
    const saltBigInt = BigInt("0x" + salt);
    console.log("🔹 Generated saltBigInt:", saltBigInt);

    const { identityHash } = await this.calculateIdentityHash(nik, nama, ttl, key);
    console.log("🔹 Calculated identityHash:", identityHash.toString());

    const userData = {
      userId,
      userHash,
      identityHash: identityHash.toString(),
      salt: saltBigInt.toString(),
      status: "pending",
      submittedAt: Date.now(),
    };

    try {
      await userMerkleModel.saveUser(userId, userData);
      console.log("✅ User data saved successfully.");
    } catch (error) {
      console.error("❌ Failed to save user data:", error);
      throw error; // Tidak lanjut jika gagal
    }
    console.groupEnd();
    
    return {
      userHash,
      identityHash: identityHash.toString(),
      status: "pending",
    };
  }

  async approveUser(userId) {
    console.group("🌱 [approveUser] Started for userId:", userId);

    const originalUserData = await userMerkleModel.getUser(userId);
    if (!originalUserData) throw new Error("❌ User data not found");

    // Backup for rollback
    const userBackup = { ...originalUserData };
    const merkleBackup = await userMerkleModel.getMerkleTree();

    try {
      // 1️⃣ Update status user menjadi approved
      console.log("🔹 Updating user status to 'approved'");
      originalUserData.status = "approved";
      originalUserData.approvedAt = Date.now();
      originalUserData.leafIndex = null;
      await userMerkleModel.saveUser(userId, originalUserData);

      // 2️⃣ Rebuild Merkle tree dari semua user approved/verified
      console.log("🔹 Rebuilding Merkle tree with approved users...");
      const { newRoot, leaves } = await this.rebuildMerkleTree();

      console.log("   └─ New Merkle root (BigInt):", newRoot.toString());

      // 3️⃣ Compute leaf untuk user yang baru di-approve
      const leafBigInt = BigInt(await computeLeaf(originalUserData.identityHash, originalUserData.salt));
      const leafIndex = leaves.findIndex(l => BigInt(l) === leafBigInt);

      console.log("🔹 Computed leaf (BigInt):", leafBigInt.toString());
      console.log("🔹 All leaves (BigInt):", leaves.map(l => l.toString()));
      console.log("🔹 Computed leafIndex:", leafIndex);

      if (leafIndex < 0) throw new Error("❌ Leaf not found in rebuilt Merkle tree");

      // 4️⃣ Update leafIndex user di database
      originalUserData.leafIndex = leafIndex;
      await userMerkleModel.saveUser(userId, originalUserData);
      console.log("✅ User leafIndex updated in database:", leafIndex);

      // 5️⃣ Simpan snapshot Merkle tree ke local storage
      await userMerkleModel.saveMerkleTree({
        root: newRoot,
        leaves,
        timestamp: Date.now(),
      });
      console.log("✅ Merkle tree snapshot saved locally.");

      // 6️⃣ Siapkan data untuk on-chain
      console.log("🔹 Preparing on-chain data...");
      const rootBytes32 = toBytes32Hex(newRoot);
      const leavesBytes32 = leaves.map((l, idx) => {
        const hex = toBytes32Hex(l);
        console.log(`   └─ Leaf[${idx}] bytes32:`, hex);
        return hex;
      });
      console.log("   ├─ Root (bytes32):", rootBytes32);
      console.log("   └─ Total leaves:", leavesBytes32.length);

      // 7️⃣ Kirim update ke on-chain
      console.log("🔹 Sending on-chain transaction (updateMerkleRootWithIdentities)...");
      const tx = await merkleZkpContract.updateMerkleRootWithIdentities(rootBytes32, leavesBytes32);
      const receipt = await tx.wait();
      console.log("🔔 TX receipt:", {
        transactionHash: receipt.hash,
        status: receipt.status,
        logsCount: receipt.logs?.length
      });

      // 8️⃣ Verifikasi hasil di on-chain
      const onChainRoot = await merkleZkpContract.currentMerkleRoot();
      console.log("🔹 On-chain root after tx:", onChainRoot);

      for (let i = 0; i < leavesBytes32.length; i++) {
        const leafHex = leavesBytes32[i];
        try {
          const approved = await merkleZkpContract.isIdentityApproved(leafHex);
          console.log(`   └─ isIdentityApproved[${i}] ${leafHex}:`, approved);
        } catch (err) {
          console.error(`   └─ ⚠️ Error checking isIdentityApproved[${i}]`, err);
        }
      }

      console.log("✅ [approveUser] Completed successfully. On-chain root:", onChainRoot);
      console.groupEnd();
      return onChainRoot;

    } catch (error) {
      console.error("❌ [approveUser] Failed:", error);

      // Rollback
      if (userBackup) {
        await userMerkleModel.saveUser(userId, userBackup);
        console.log("↩️ Rolled back user data to original state");
      }
      if (merkleBackup) {
        await userMerkleModel.saveMerkleTree(merkleBackup);
        console.log("↩️ Rolled back Merkle tree to previous state");
      }
      console.groupEnd();
      throw new Error("Approval failed and rollback completed");
    }
  }

  async rebuildMerkleTree() {
    console.group("🔄 Rebuilding Merkle Tree (approved users only)...");

    const approvedUsersMap = await userMerkleModel.getApprovedUsers();
    let approvedUsersList = Object.values(approvedUsersMap);

    // Urutkan secara deterministik
    approvedUsersList.sort((a, b) => (BigInt(a.identityHash) > BigInt(b.identityHash) ? 1 : -1));
    console.log(`📦 Total approved/verified users: ${approvedUsersList.length}`);
    console.log("📦 Identity Hashes:", approvedUsersList.map(u => u.identityHash));

    const leavesData = approvedUsersList.map(u => ({ identityHash: u.identityHash, salt: u.salt }));
    console.log("📦 Leaves Data (raw objects):", JSON.stringify(leavesData, null, 2));

    // Build Merkle tree
    console.log("🧩 Building Merkle Tree...");
    const { tree, root, leaves } = await buildMerkleTree(leavesData);

    this.currentMerkleTree = { tree, root, leaves, leavesData };
    console.log("✅ Merkle Tree built successfully");
    console.log(`   ├─ Root: ${root}`);
    console.log(`   └─ Leaves count: ${leavesData.length}`);

    // Simpan snapshot Merkle tree
    await userMerkleModel.saveMerkleTree({ root, leaves, timestamp: Date.now() });

    // Update leafIndex setiap user
    for (let i = 0; i < approvedUsersList.length; i++) {
      const user = approvedUsersList[i];
      user.leafIndex = i;
      await userMerkleModel.saveUser(user.userId, user);
      console.log(`📝 Updated leafIndex for user ${user.userId}: ${i}, identityHash: ${user.identityHash}`);
    }

    console.log("🧮 Semua leafIndex diperbarui & disimpan ulang setelah rebuild.");
    console.groupEnd();

    return { merkleTree: tree, newRoot: root, leavesData, leaves };
  }

  async verifyUser(userId, nik, nama, ttl, key, debug = true) {
    console.group(`🔍 VERIFY USER: ${userId}`);

    // 1️⃣ Ambil data user
    const userData = await userMerkleModel.getUser(userId);
    if (!userData) throw new Error("User data not found");
    if (!["approved", "verified"].includes(userData.status))
        throw new Error("User not approved yet");

    // 2️⃣ Hitung identityHash dari input baru
    const { identityHash: inputHash } = await this.calculateIdentityHash(nik, nama, ttl, key);
    if (debug) {
        console.log("🔹 inputHash:", inputHash.toString());
        console.log("🔹 storedHash:", userData.identityHash);
    }
    if (inputHash.toString() !== userData.identityHash)
        throw new Error("Identity mismatch — input data doesn't match stored hash");

    // 3️⃣ Pastikan Merkle tree siap
    if (!this.currentMerkleTree?.leaves?.length) {
        const { merkleTree, newRoot, leaves } = await this.rebuildMerkleTree();
        this.currentMerkleTree = { tree: merkleTree, root: newRoot, leaves };
        if (debug) console.log("🔄 Rebuilt Merkle tree root:", newRoot);
    }

    // 4️⃣ Hitung ulang leaf dan cari index
    const leafCompute = await computeLeaf(userData.identityHash, userData.salt);
    const leavesBigInt = this.currentMerkleTree.leaves.map((l) => BigInt(l));
    const leafIndex = leavesBigInt.findIndex((l) => l === BigInt(leafCompute));
    if (leafIndex < 0) throw new Error("Identity not found in current Merkle tree");
    if (debug) console.log("🔹 leafIndex:", leafIndex);

    // 4a️⃣ Debug: print semua leaves lokal
    if (debug) {
        console.log("🌳 Local Merkle tree leaves (BigInt):");
        leavesBigInt.forEach((l, idx) => console.log(`  [${idx}]: ${l.toString()}`));
        console.log("🔹 Computed leaf:", leafCompute.toString());
    }

    // 5️⃣ Generate Merkle proof
    const proofData = {
        nik, nama, ttl, key,
        salt: userData.salt,
        leafIndex,
        merkleTree: this.currentMerkleTree.tree,
        zkpService: this,
    };
    const { proof, publicSignals, merkleRoot } = await generateMerkleProof(proofData);

    if (debug) {
        console.log("🌳 Local Merkle root:", merkleRoot.toString());
        console.log("🧩 Proof:", JSON.stringify(proof, null, 2));
    }

    // 5a️⃣ Ambil root kontrak
    const contractRootBig = BigInt(await merkleZkpContract.currentMerkleRoot());
    if (debug) console.log("🔹 Contract Merkle root:", contractRootBig.toString());

    if (contractRootBig !== BigInt(publicSignals[0])) {
        console.error("❌ Merkle root mismatch between circuit and contract");
        throw new Error("Merkle root mismatch (check on-chain vs local)");
    }

    // 5b️⃣ Debug: ambil leaf kontrak jika tersedia (opsional)
    // Kalau kontrak punya fungsi viewLeaf(index), kita bisa bandingkan
    if (debug && merkleZkpContract.viewLeaf) {
        try {
            const onChainLeaf = await merkleZkpContract.viewLeaf(leafIndex);
            console.log("🔹 On-chain leaf at index:", leafIndex, BigInt(onChainLeaf).toString());
        } catch (err) {
            console.warn("⚠️ Could not fetch on-chain leaf:", err.message);
        }
    }

    // 6️⃣ Kirim ke kontrak
    const leafHex = toBytes32Hex(leafCompute);
    if (debug) console.log("🔹 leafHex to send:", leafHex);
    console.log("Contract object:", merkleZkpContract);
    console.log("Available contract methods:", Object.keys(merkleZkpContract));
    console.log("Type of contract:", typeof merkleZkpContract);

    try {
        const tx = await merkleZkpContract.verifyIdentity(
          proof.a, 
          proof.b, 
          proof.c, 
          leafHex
        );
        const receipt = await tx.wait();

        // Update status user
        userData.status = "verified";
        userData.verifiedAt = Date.now();
        userData.verificationTx = receipt.hash;
        await userMerkleModel.saveUser(userId, userData);

        console.log("✅ Verification success — Tx:", receipt.hash);
        console.groupEnd();
        return { transactionHash: receipt.hash, merkleRoot: contractRootBig.toString() };
    } catch (err) {
        console.error("❌ On-chain verification failed:", err);
        userData.status = "approved";
        userData.verifiedAt = null;
        userData.verificationTx = null;
        await userMerkleModel.saveUser(userId, userData);
        console.groupEnd();
        throw new Error("Failed to verify identity on-chain");
    }
  }



  // async approveUser(userId) {
  //   console.log("🌱 approveUser started for userId:", userId);

  //   const originalUserData = await userMerkleModel.getUser(userId);
  //   if (!originalUserData) throw new Error("❌ User data not found");

  //   // Backup for rollback
  //   const userBackup = { ...originalUserData };
  //   const merkleBackup = await userMerkleModel.getMerkleTree();

  //   try {
  //     console.log("🔹 Updating user status to 'approved'");
  //     originalUserData.status = "approved";
  //     originalUserData.approvedAt = Date.now();
  //     await userMerkleModel.saveUser(userId, originalUserData);

  //     console.log("🔹 Rebuilding Merkle tree with approved users...");
  //     const { merkleTree, newRoot, leafIndex, identityHashes } = await this.rebuildMerkleTree(userId);

  //     if (leafIndex < 0) throw new Error("❌ Leaf index not found after rebuild");

  //     console.log("🔹 Saving Merkle tree to userMerkleModel...");
  //     await userMerkleModel.saveMerkleTree({ root: newRoot, leaves: merkleTree.leavesData, timestamp: new Date().toISOString() });

  //     originalUserData.leafIndex = leafIndex;
  //     await userMerkleModel.saveUser(userId, originalUserData);

  //     console.log("🔹 Preparing data for on-chain update...");
  //     const rootBytes32 = "0x" + BigInt(newRoot).toString(16).padStart(64, "0");
  //     const identityHashesBytes32 = identityHashes.map(h => "0x" + BigInt(h).toString(16).padStart(64, "0"));

  //     console.log("🔹 Sending on-chain transaction to update Merkle root...");
  //     const tx = await merkleZkpContract.updateMerkleRootWithIdentities(rootBytes32, identityHashesBytes32);
  //     await tx.wait();

  //     const updatedRoot = await merkleZkpContract.currentMerkleRoot();
  //     console.log("✅ On-chain Merkle root updated successfully:", updatedRoot);

  //     return updatedRoot;
  //   } catch (error) {
  //     console.error("❌ Approve process failed, rolling back changes:", error);

  //     // Rollback user data
  //     if (userBackup) {
  //       await userMerkleModel.saveUser(userId, userBackup);
  //       console.log("↩️ User data rolled back to original state");
  //     }

  //     // Rollback Merkle tree
  //     if (merkleBackup) {
  //       await userMerkleModel.saveMerkleTree(merkleBackup);
  //       console.log("↩️ Merkle tree rolled back to original state");
  //     }

  //     throw new Error("Approval failed and rollback completed");
  //   }
  // }

  // async rebuildMerkleTree(targetUserId = null) {
  //   console.log("🔄 Rebuilding Merkle Tree (approved users only)...");

  //   // 1️⃣ Ambil semua approved users
  //   const approvedUsersMap = await userMerkleModel.getApprovedUsers();
  //   let approvedUsersList = Object.values(approvedUsersMap);

  //   // 2️⃣ Urutkan berdasarkan identityHash (deterministik)
  //   approvedUsersList = approvedUsersList.sort((a, b) => {
  //     return (BigInt(a.identityHash) > BigInt(b.identityHash)) ? 1 : -1;
  //   });

  //   console.log(`📦 Total approved users: ${approvedUsersList.length}`);

  //   const leavesData = [];
  //   const identityHashes = [];

  //   // 3️⃣ Siapkan leavesData dari identityHash + salt yang tersimpan
  //   for (const user of approvedUsersList) {
  //     console.log(`🔹 User: ${user.userId}, identityHash: ${user.identityHash}, salt: ${user.salt}`);
  //     leavesData.push({
  //       identityHash: user.identityHash,
  //       salt: user.salt,
  //     });
  //     identityHashes.push(user.identityHash);
  //   }

  //   // 4️⃣ Hitung index leaf target
  //   const targetHash = targetUserId && approvedUsersMap[targetUserId]
  //     ? approvedUsersMap[targetUserId].identityHash
  //     : null;
  //   const targetLeafIndex = targetHash ? identityHashes.findIndex(h => h === targetHash) : -1;
  //   console.log(`🔍 Target leaf index for user ${targetUserId}: ${targetLeafIndex}`);

  //   // 5️⃣ Build Merkle tree
  //   console.log("\n🧩 Building Merkle Tree...");
  //   const { tree, root } = await buildMerkleTreeFromHashes(leavesData);
  //   this.currentMerkleTree = tree;
  //   this.currentMerkleTree.leavesData = leavesData;

  //   console.log(`✅ Merkle Tree built successfully`);
  //   console.log(`   ├─ Root: ${root}`);
  //   console.log(`   └─ Leaves count: ${leavesData.length}`);

  //   // 6️⃣ Persist ke userMerkleModel (bukan file)
  //   await userMerkleModel.saveMerkleTree({
  //     root,
  //     leaves: leavesData,
  //     timestamp: Date.now(),
  //   });
  //   console.log("💾 Saved Merkle tree to userMerkleModel");

  //   return {
  //     merkleTree: tree,
  //     newRoot: root,
  //     leafIndex: targetLeafIndex,
  //     identityHashes,
  //   };
  // }

  // async verifyUser(userId, nik, nama, ttl, key) {
  //   console.log("🔹 Starting verification for userId:", userId);

  //   const userData = await userMerkleModel.getUser(userId);
  //   if (!userData) throw new Error("User data not found");
  //   if (userData.status !== "approved" && userData.status !== "verified") {
  //     throw new Error("User not approved yet");
  //   }

  //   // 1️⃣ Hitung identityHash berdasarkan data input
  //   const { identityHash: inputHash } = await this.calculateIdentityHash(nik, nama, ttl, key);
  //   console.log("🔹 Calculated identityHash from input:", inputHash.toString());

  //   // 2️⃣ Cocokkan dengan identityHash yang tersimpan
  //   if (inputHash.toString() !== userData.identityHash) {
  //     throw new Error("Identity data mismatch");
  //   }

  //   // 3️⃣ Pastikan Merkle Tree lokal ada
  //   if (!currentMerkleTree || !currentMerkleTree.leavesData?.length) {
  //     const rebuilt = await this.rebuildMerkleTree();
  //     currentMerkleTree = rebuilt.merkleTree;
  //   }

  //   // 4️⃣ Ambil leavesData dari model atau currentMerkleTree
  //   const savedTree = await userMerkleModel.getMerkleTree();
  //   let leavesData = currentMerkleTree.leavesData?.length
  //     ? currentMerkleTree.leavesData
  //     : (savedTree?.leaves || []);

  //   // 5️⃣ Sinkronisasi root lokal vs kontrak
  //   const contractRootHex = await merkleZkpContract.currentMerkleRoot();
  //   const contractRootBig = BigInt(contractRootHex);

  //   const { root: localRootStr } = await buildMerkleTreeFromHashes(leavesData);
  //   if (BigInt(localRootStr) !== contractRootBig) {
  //     console.log("🔄 Local root mismatch. Rebuilding Merkle Tree...");
  //     const rebuiltFull = await this.rebuildMerkleTree();
  //     currentMerkleTree = rebuiltFull.merkleTree;
  //     leavesData = currentMerkleTree.leavesData?.length
  //       ? currentMerkleTree.leavesData
  //       : (savedTree?.leaves || []);

  //     const { root: localRootStr2 } = await buildMerkleTreeFromHashes(leavesData);
  //     if (BigInt(localRootStr2) !== contractRootBig) {
  //       throw new Error("Merkle root mismatch - tree may be outdated");
  //     }
  //   }

  //   // 6️⃣ Recompute leafIndex berdasarkan identityHash dari merkleUsers
  //   const identityHashesNow = leavesData.map(l => l.identityHash);
  //   const liveLeafIndex = identityHashesNow.findIndex(h => h === userData.identityHash);
  //   if (liveLeafIndex < 0) throw new Error("Identity not in current Merkle set");

  //   console.log("✅ CONTRACT ROOT:", contractRootBig.toString());
  //   console.log("✅ LOCAL ROOT   :", localRootStr);
  //   console.log("✅ NUMBER OF LEAVES:", leavesData.length);
  //   leavesData.forEach((leaf, i) => console.log(`[${i}]`, leaf.identityHash));

  //   // 7️⃣ Generate proof menggunakan identityHash + salt dari merkleUsers
  //   const proofData = {
  //     nik,
  //     nama,
  //     ttl,
  //     key,
  //     salt: userData.salt,
  //     leafIndex: liveLeafIndex,
  //     merkleTree: currentMerkleTree,
  //   };

  //   console.log("🔹 Generating Merkle proof with leafIndex:", liveLeafIndex);
  //   let proof, publicSignals;
  //   try {
  //     ({ proof, publicSignals } = await generateMerkleProof(proofData));
  //   } catch (err) {
  //     console.error("❌ Failed to generate Merkle proof:", err);
  //     throw new Error("Merkle proof generation failed");
  //   }

  //   // 8️⃣ Validasi root proof vs kontrak
  //   const proofRootBigInt = BigInt(publicSignals[0]);
  //   if (contractRootBig !== proofRootBigInt) {
  //     console.error("❌ Root mismatch:", {
  //       contractRootDec: contractRootBig.toString(),
  //       proofRootDec: proofRootBigInt.toString(),
  //       leafIndex: liveLeafIndex,
  //     });
  //     throw new Error("Merkle root mismatch - tree may be outdated");
  //   }

  //   // 9️⃣ Submit ke kontrak
  //   try {
  //     const identityHashBytes32 = "0x" + BigInt(userData.identityHash).toString(16).padStart(64, "0");
  //     const tx = await merkleZkpContract.verifyIdentity(proof.a, proof.b, proof.c, identityHashBytes32);
  //     const receipt = await tx.wait();

  //     // 10️⃣ Update status user di local model
  //     userData.status = "verified";
  //     userData.verifiedAt = new Date().toISOString();
  //     userData.verificationTx = receipt.hash;
  //     await userMerkleModel.saveUser(userId, userData);

  //     console.log("✅ User verified successfully. Tx hash:", receipt.hash);
  //     return { transactionHash: receipt.hash, merkleRoot: contractRootHex };
  //   } catch (err) {
  //     console.error("❌ Failed to submit verification transaction:", err);
  //     // Rollback status tetap approved
  //     userData.status = "approved";
  //     userData.verifiedAt = null;
  //     userData.verificationTx = null;
  //     await userMerkleModel.saveUser(userId, userData);
  //     throw new Error("Failed to verify identity on-chain");
  //   }
  // }

  async isVerified(userId) {
    const userData = await userMerkleModel.getUser(userId);
    if (!userData) return false;
    return userData.status === "verified";
  }

  async isApproved(userId) {
    const userData = await userMerkleModel.getUser(userId);
    if (!userData) return false;

    if (userData.status !== "approved" && userData.status !== "verified") return false;

    try {
      console.log("🧾 [isApproved] Checking on-chain approval...");
      const leafBigInt = BigInt(await computeLeaf(userData.identityHash, userData.salt));
      const leafBytes32 = toBytes32Hex(leafBigInt);


      console.log("   ├─ userId:", userId);
      console.log("   ├─ identityHash:", userData.identityHash);
      console.log("   ├─ salt:", userData.salt);
      console.log("   ├─ computedLeaf (BigInt):", leafBigInt.toString());
      console.log("   └─ leafBytes32:", leafBytes32);

      const approved = await merkleZkpContract.isIdentityApproved(leafBytes32);
      console.log("✅ [isApproved] On-chain result:", approved);
      return approved;
    } catch (err) {
      console.error("⚠️ [isApproved] Error while checking approval:", err);
      return false;
    }
  }


  async hasSubmitted(userId) {
    return await userMerkleModel.isSubmitted(userId);
  }

  async getMerkleTreeInfo() {
    const currentRoot = await merkleZkpContract.currentMerkleRoot();
    const contractInfo = await merkleZkpContract.getContractInfo();
    const allUsers = await userMerkleModel.getAllUsers();
    const approvedUsers = await userMerkleModel.getApprovedUsers();

    return {
      currentRoot: currentRoot.toString(),
      totalApprovedUsers: Object.keys(approvedUsers).length,
      totalSubmittedUsers: Object.keys(allUsers).length,
      totalApprovedOnChain: contractInfo.totalIdentities.toString(),
      treeHeight: 16,
      maxUsers: 65536,
      contractInfo: {
        merkleRoot: contractInfo.merkleRoot,
        admin: contractInfo.contractAdmin,
      },
    };
  }

  async calculateIdentityHash(nik, nama, ttl, key) {
    // This is used internally - matches the circuit logic
    const poseidon = await require("circomlibjs").buildPoseidon();

    const nikNorm  = String(nik).replace(/\D/g, "");       // hanya digit
    const ttlNorm  = String(ttl).replace(/\D/g, "");       // YYYYMMDD 8 digit
    const namaNorm = String(nama).trim();                  // tambahkan .toLowerCase() jika circuit lowercase
    const keyNorm  = String(key).trim();                   // idem

    const namaHex = Buffer.from(namaNorm, "utf8").toString("hex");
    const namaBigInt = BigInt("0x" + namaHex);
    const keyHex = Buffer.from(keyNorm, "utf8").toString("hex");
    const keyBigInt = BigInt("0x" + keyHex);

    const inputArray = [BigInt(nikNorm), namaBigInt, BigInt(ttlNorm), keyBigInt];

    const identityHash = poseidon.F.toObject(poseidon(inputArray));

    console.log("Calculated Identity Hash:", identityHash.toString()); // Log untuk debugging


    return { identityHash, namaBigInt, keyBigInt };
  }

  // Additional helper methods
  async getContractInfo() {
    const contractInfo = await merkleZkpContract.getContractInfo();
    return {
      currentRoot: contractInfo.merkleRoot,
      totalIdentities: contractInfo.totalIdentities.toString(),
      admin: contractInfo.contractAdmin,
    };
  }

  async getPendingUsers() {
    const allUsers = await userMerkleModel.getAllUsers();
    const pendingUsers = [];

    for (const [userId, userData] of Object.entries(allUsers)) {
      if (userData.status === "pending") {
        // Don't expose raw data that we no longer store
        pendingUsers.push({
          userId: userData.userId,
          identityHash: userData.identityHash,
          submittedAt: userData.submittedAt,
          status: userData.status,
        });
      }
    }

    return pendingUsers;
  }

  async getCurrentRoot() {
    const root = await merkleZkpContract.currentMerkleRoot();
    return root.toString();
  }

  async rebuildAndUpdateTree() {
    const { merkleTree, newRoot, identityHashes } = await this.rebuildMerkleTree();

    const rootBytes32 = "0x" + BigInt(newRoot).toString(16).padStart(64, "0");
    const identityHashesBytes32 = identityHashes.map(
      (h) => "0x" + BigInt(h).toString(16).padStart(64, "0")
    );

    try {
      const tx = await merkleZkpContract.updateMerkleRootWithIdentities(
        rootBytes32,
        identityHashesBytes32
      );
      const receipt = await tx.wait();
      const updatedRoot = await merkleZkpContract.currentMerkleRoot();

      // simpan tree terbaru untuk sinkron instance lain
      await userMerkleModel.saveMerkleTree({ root: newRoot, leaves: merkleTree.leaves });

      return {
        updatedRoot,
        newRoot,
        totalUsers: identityHashes.length,
        transactionHash: receipt.transactionHash ?? receipt.hash,
      };
    } catch (error) {
      console.error("Error updating Merkle root in contract:", error);
      throw new Error("Failed to update Merkle root in contract");
    }
  }


  // Check identity approval on-chain
  async checkIdentityApproval(nik, nama, ttl, key) {
    const { identityHash } = await this.calculateIdentityHash(nik, nama, ttl, key);
    const identityHashBytes32 = "0x" + BigInt(identityHash).toString(16).padStart(64, "0");
    return await merkleZkpContract.isIdentityApproved(identityHashBytes32);
  }
}

module.exports = new MerkleZKPService();
