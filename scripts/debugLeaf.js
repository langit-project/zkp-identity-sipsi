/**
 * debugLeaf.js
 * Hitung leaf hash dari data mentah agar sesuai dengan circuit.
 */
const { buildPoseidon } = require("circomlibjs");

const userData = {
  userId: '12345678901234',
  nik: '12345678901234',
  nama: 'Bella Anggraini Pratama',
  ttl: '20000101',
  key: 'keybel',
  salt: '133705226350890688225606823547446713642'
};

async function computeIdentityHash(P, data) {
  return P.F.toObject(
    P([
      BigInt(data.userId),
      BigInt(data.nik),
      BigInt(data.ttl),
      BigInt('0x' + Buffer.from(data.key).toString('hex')) // ubah string key ke bigint
    ])
  );
}

async function computeLeaf(data) {
  const P = await buildPoseidon();

  const identityHash = await computeIdentityHash(P, data);
  const leaf = P.F.toObject(
    P([identityHash, BigInt(data.salt), 1n]) // status=1
  );

  console.log("🧩 IdentityHash :", identityHash.toString());
  console.log("🌿 Leaf (Poseidon output) :", leaf.toString());
}

computeLeaf(userData);
