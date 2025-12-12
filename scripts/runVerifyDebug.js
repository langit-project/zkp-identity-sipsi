// ./scripts/runVerifyDebug.js
const { verifyUserDebug } = require("./debug/verifyUserDebug");

(async () => {
  await verifyUserDebug({
    userId: "12345678901234",
    nik: "12345678901234",
    nama: "Bella Anggraini Pratama",
    ttl: "20000101",
    key: "keybel"
  });
})();
