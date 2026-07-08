const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

(async () => {
  const poseidon = await buildPoseidon();

  const data = JSON.parse(fs.readFileSync("./data/merkle_tree.json", "utf8"));
  const leaf = 6640021462419492929287766964070784809670409236444048993804742677807148890777n;
  const pathElements = [
    19279013947509501699373079893655052631053218109824950988363238743926396606067n,
    0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n
  ];
  const pathIndices = [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

  let current = leaf;
  for (let i = 0; i < 16; i++) {
    const sibling = pathElements[i];
    current = pathIndices[i] === 0
      ? poseidon.F.toObject(poseidon([current, sibling])) // current kiri
      : poseidon.F.toObject(poseidon([sibling, current])); // current kanan
  }

  console.log("✅ Computed Root:", current.toString());
  console.log("📄 JSON Root:", data.root);
  console.log("Match?", current.toString() === data.root.toString());
})();
