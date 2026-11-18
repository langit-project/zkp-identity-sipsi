const merkleZkpService = require("../services/merkleZkpService");

class MerkleZKPController {
  async getStatus(req, res) {
    try {
      const contractAddress = await merkleZkpService.getContractAddress();
      const merkleInfo = await merkleZkpService.getMerkleTreeInfo();
      const payload = {
        service: "zkp-identity-backend",
        status: "healthy",
        uptime: `${Math.round(process.uptime())}s`,
        timestamp: new Date().toISOString(),
        contract: {
          address: contractAddress,
          currentMerkleRoot: merkleInfo.currentRoot,
          totalApprovedOnChain: merkleInfo.totalApprovedOnChain,
        },
        merkleTree: {
          totalApprovedUsers: merkleInfo.totalApprovedUsers,
          treeHeight: merkleInfo.treeHeight,
          maxCapacity: merkleInfo.maxUsers,
        }
      };

      if (req.accepts('html') && !req.xhr && req.query.format !== 'json') {
        return res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZKP Identity Backend - Health Status</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="bg-white max-w-md w-full rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
    <div class="flex items-center justify-between pb-3 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
        <h1 class="text-base font-bold text-slate-900">ZKP Identity Backend</h1>
      </div>
      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">● Operational</span>
    </div>
    
    <div class="text-xs space-y-2 text-slate-600">
      <div class="flex justify-between py-1 border-b border-slate-50"><span class="text-slate-400">Service:</span><span class="font-mono font-medium">${payload.service}</span></div>
      <div class="flex justify-between py-1 border-b border-slate-50"><span class="text-slate-400">Contract:</span><span class="font-mono text-slate-700 truncate max-w-[200px]" title="${payload.contract.address}">${payload.contract.address || 'Local/Test'}</span></div>
      <div class="flex justify-between py-1 border-b border-slate-50"><span class="text-slate-400">Merkle Root:</span><span class="font-mono text-slate-700 truncate max-w-[200px]" title="${payload.contract.currentMerkleRoot}">${payload.contract.currentMerkleRoot || '0x0'}</span></div>
      <div class="flex justify-between py-1 border-b border-slate-50"><span class="text-slate-400">Approved Users:</span><span class="font-mono font-medium">${payload.merkleTree.totalApprovedUsers}</span></div>
      <div class="flex justify-between py-1 border-b border-slate-50"><span class="text-slate-400">Uptime:</span><span class="font-mono font-medium">${payload.uptime}</span></div>
      <div class="flex justify-between py-1"><span class="text-slate-400">Timestamp:</span><span class="font-mono text-slate-500">${payload.timestamp}</span></div>
    </div>

    <div class="pt-2 flex gap-3">
      <a href="/api-docs" class="flex-1 text-center bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-2 px-4 rounded-xl transition shadow-sm">
        Buka Swagger UI (/api-docs) &rarr;
      </a>
      <a href="?format=json" class="text-center bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium py-2 px-3 rounded-xl transition border border-slate-200">
        JSON
      </a>
    </div>
  </div>
</body>
</html>
        `);
      }

      res.json(payload);
    } catch (e) {
      if (req.accepts('html') && !req.xhr && req.query.format !== 'json') {
        return res.status(500).send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>ZKP Identity Backend - Degraded</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex items-center justify-center p-4">
  <div class="bg-white max-w-md w-full rounded-2xl shadow-sm border border-rose-200 p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-base font-bold text-slate-900">ZKP Identity Backend</h1>
      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">▲ Degraded</span>
    </div>
    <p class="text-xs text-rose-600">${e.message}</p>
    <div class="pt-2">
      <a href="/api-docs" class="block text-center bg-indigo-600 text-white text-xs font-medium py-2 rounded-xl">Buka Swagger UI (/api-docs)</a>
    </div>
  </div>
</body>
</html>
        `);
      }
      res.status(500).json({
        service: "zkp-identity-backend",
        status: "degraded",
        error: "Contract connection failed",
        message: e.message
      });
    }
  }

  async submitHash(req, res) {
    try {
      const { userId, nik, nama, ttl, key } = req.body;
      if (!userId || !nik || !nama || !ttl || !key) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      // Store only identity hash, not raw data
      const result = await merkleZkpService.submitUserData(userId, nik, nama, ttl, key);

      return res.json({
        success: true,
        message: "Identity hash submitted and pending approval.",
        userId,
        identityHash: result.identityHash,
      });
    } catch (err) {
      console.error("Submit hash error:", err);
      res.status(500).json({ error: "Failed to submit data", message: err.message });
    }
  }

  async approveHash(req, res) {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "Missing userId" });

      // This will add user to approved list, update Merkle tree, and update on-chain status
      const result = await merkleZkpService.approveUser(userId);

      return res.json({
        success: true,
        message: "User approved, added to Merkle tree, and registered on-chain.",
        userId,
        identityHash: result.identityHash,
        newMerkleRoot: result.newMerkleRoot,
        leafIndex: result.leafIndex,
      });
    } catch (err) {
      console.error("Approval error:", err);
      return res.status(500).json({ error: "Failed to approve user", message: err.message });
    }
  }

  async verify(req, res) {
    try {
      const { userId, nik, nama, ttl, key } = req.body;
      console.log('Data untuk verifikasi:', { userId, nik, nama, ttl, key });
      if (!userId || !nik || !nama || !ttl || !key) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      // Generate Merkle proof and submit to contract
      const result = await merkleZkpService.verifyUser(userId, nik, nama, ttl, key);

      return res.json({
        success: true,
        message: "Identity verified on-chain with Merkle proof.",
        transactionHash: result.transactionHash,
      });
    } catch (err) {
      console.error("Verification error:", err);
      return res.status(500).json({ error: "Verification failed", message: err.message });
    }
  }

  async checkVerification(req, res) {
    try {
      const { userId } = req.params;
      const verified = await merkleZkpService.isVerified(userId);
      return res.json({ userId, verified });
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Failed to check verification status", message: err.message });
    }
  }

  async checkApproval(req, res) {
    try {
      const { userId } = req.params;
      const approved = await merkleZkpService.isApproved(userId);
      return res.json({ userId, approved });
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Failed to check approval status", message: err.message });
    }
  }

  async checkSubmission(req, res) {
    try {
      const { userId } = req.params;
      const submitted = await merkleZkpService.hasSubmitted(userId);
      return res.json({ userId, submitted });
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Failed to check submission status", message: err.message });
    }
  }

  async getMerkleInfo(req, res) {
    try {
      const info = await merkleZkpService.getMerkleTreeInfo();
      return res.json(info);
    } catch (err) {
      return res.status(500).json({ error: "Failed to get Merkle info", message: err.message });
    }
  }

  async getContractInfo(req, res) {
    try {
      const info = await merkleZkpService.getContractInfo();
      res.json(info);
    } catch (e) {
      console.error("Contract info error:", e);
      res.status(500).json({ error: "Failed to get contract info" });
    }
  }

  // Check if an identity (not userId) is approved on-chain
  async checkIdentityApproval(req, res) {
    try {
      const { nik, nama, ttl, key } = req.body;
      if (!nik || !nama || !ttl || !key) {
        return res.status(400).json({ error: "Missing required identity fields" });
      }

      const approved = await merkleZkpService.checkIdentityApproval(nik, nama, ttl, key);

      return res.json({
        success: true,
        approved,
        message: approved ? "Identity is approved on-chain" : "Identity not approved",
      });
    } catch (err) {
      console.error("Check identity approval error:", err);
      res.status(500).json({ error: "Failed to check identity approval", message: err.message });
    }
  }

  async getPendingUsers(req, res) {
    try {
      const pendingUsers = await merkleZkpService.getPendingUsers();
      res.json({
        success: true,
        pendingUsers,
        count: pendingUsers.length,
      });
    } catch (err) {
      console.error("Get pending users error:", err);
      res.status(500).json({ error: "Failed to get pending users", message: err.message });
    }
  }

  async buildAndUpdateTree(req, res) {
    try {
      // Manual tree rebuild - useful for batch operations
      const result = await merkleZkpService.rebuildAndUpdateTree();
      res.json({
        success: true,
        message: "Merkle tree rebuilt and updated with all identity hashes",
        ...result,
      });
    } catch (err) {
      console.error("Build tree error:", err);
      res.status(500).json({ error: "Failed to build and update tree", message: err.message });
    }
  }

  async getCurrentRoot(req, res) {
    try {
      const currentRoot = await merkleZkpService.getCurrentRoot();
      res.json({
        success: true,
        currentRoot,
      });
    } catch (err) {
      console.error("Get current root error:", err);
      res.status(500).json({ error: "Failed to get current root", message: err.message });
    }
  }
}

module.exports = new MerkleZKPController();
