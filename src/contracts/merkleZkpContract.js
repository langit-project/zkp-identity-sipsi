// merkleZkpContract.js
const { ethers } = require("ethers");
require("dotenv").config();

// Import the contract ABI - IdentityMerkleZKP (v0.5 leaf model)
const contract = require("./IdentityMerkleZKP.json");
const abi = contract.abi;

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_MAINNET_RPC_URL || "https://polygon-bor-rpc.publicnode.com");
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const merkleZkpContract = new ethers.Contract(process.env.MERKLE_ZKP_CONTRACT_ADDRESS, abi, signer);

module.exports = {
  // Contract info
  getAddress: () => merkleZkpContract.getAddress(),

  // Admin functions
  updateMerkleRoot: (newRoot) => merkleZkpContract.updateMerkleRoot(newRoot),
  updateMerkleRootWithIdentities: (newRoot, identityHashes) =>
    merkleZkpContract.updateMerkleRootWithIdentities(newRoot, identityHashes),
  approveIdentity: (identityHash) => merkleZkpContract.approveIdentity(identityHash),
  revokeIdentity: (identityHash) => merkleZkpContract.revokeIdentity(identityHash),
  transferAdmin: (newAdminAddress) => merkleZkpContract.transferAdmin(newAdminAddress),

  // User verification (mengirim leaf bytes32)
  verifyIdentity: (a, b, c, leaf) =>
    merkleZkpContract.verifyIdentity(a, b, c, leaf),

  // View functions
  isIdentityApproved: (identityHash) => merkleZkpContract.isIdentityApproved(identityHash),
  viewLeaf: (index) => merkleZkpContract.viewLeaf(index),
  identityLeaves: (index) => merkleZkpContract.identityLeaves(index),

  // Public variables
  currentMerkleRoot: () => merkleZkpContract.currentMerkleRoot(),
  totalApprovedIdentities: () => merkleZkpContract.totalApprovedIdentities(),
  totalLeaves: () => merkleZkpContract.totalLeaves(),
  admin: () => merkleZkpContract.admin(),
  approvedIdentities: (identityHash) => merkleZkpContract.approvedIdentities(identityHash),
  identityApprovalBlock: (identityHash) => merkleZkpContract.identityApprovalBlock(identityHash),
};
