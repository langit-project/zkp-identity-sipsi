/**
 * Verify User Debug
 * -----------------
 * Verifikasi manual leaf + path menghasilkan root yang cocok.
 */
const { keccak256 } = require("ethers");

async function verifyUserDebug({ user, proof, root }) {
  console.log(`🧩 [VERIFY DEBUG] Verifying user: ${user.userId}`);

  let computedHash = BigInt(user.identityHash);

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i];
    const isRight = proof.pathIndices[i] === 1;

    const left = isRight ? sibling : computedHash;
    const right = isRight ? computedHash : sibling;

    const combined = keccak256(
      Buffer.concat([
        Buffer.from(BigInt(left).toString(16).padStart(64, "0"), "hex"),
        Buffer.from(BigInt(right).toString(16).padStart(64, "0"), "hex"),
      ])
    );

    computedHash = BigInt(combined);
  }

  console.log("🔗 Computed root:", computedHash.toString());
  console.log("🔗 Expected root:", root.toString());
  console.log(computedHash === BigInt(root) ? "✅ Proof valid!" : "❌ Proof invalid!");
}

module.exports = { verifyUserDebug };
