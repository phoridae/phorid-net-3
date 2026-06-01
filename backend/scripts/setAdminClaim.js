require("dotenv").config();

const admin = require("../services/firebaseAdmin");

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: node scripts/setAdminClaim.js your-email@example.com");
    process.exit(1);
  }

  const user = await admin.auth().getUserByEmail(email);

  await admin.auth().setCustomUserClaims(user.uid, {
    admin: true,
  });

  console.log(`Admin claim set for ${email}`);
  console.log("Sign out and sign back in to refresh your token.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});