import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  // Get the first user's API key
  const rows = await sql`SELECT id, api_key FROM users LIMIT 1`;
  if (rows.length === 0) {
    console.error("No users found in database");
    process.exit(1);
  }

  const { api_key } = rows[0];
  console.log(`Using API key: ${api_key.slice(0, 10)}...`);

  // Test the ingest endpoint
  const transcript = `I just met Sarah Chen at the TechCrunch conference in San Francisco. 
She's a senior product manager at Stripe. Really interesting person - she mentioned 
she has two kids and is really into rock climbing. She used to work at Google on the 
payments team. We talked about the future of embedded finance and she had some great 
insights about API design. She offered to introduce me to her colleague who runs 
developer relations there.`;

  console.log("\nSending transcript to /api/ingest...");

  const res = await fetch("http://localhost:3000/api/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": api_key,
    },
    body: JSON.stringify({ transcript }),
  });

  console.log(`Status: ${res.status}`);
  const data = await res.json();
  console.log("\nResponse:", JSON.stringify(data, null, 2));

  if (data.reviewUrl) {
    console.log(`\nOpen this URL to review: ${data.reviewUrl}`);
  }

  await sql.end();
}

main().catch(console.error);
