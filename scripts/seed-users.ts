import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Seeds N demo accounts (default 99), each a real signup-shaped User + Profile
// + Username row — same fields signup() in src/app/actions/auth.ts writes,
// so seeded accounts work everywhere a normal account does (login, profile
// page, DMs, etc). All share one email domain (SEED_EMAIL_DOMAIN below) so
// they're trivially identifiable and can be cleaned up later with a
// `WHERE email LIKE '%@seed.0dot.local'`-style query — never mixed in with
// real accounts by naming alone.
//
// Usage: npx tsx scripts/seed-users.ts
//    or: COUNT=25 npx tsx scripts/seed-users.ts
//    or: DATABASE_URL="$TURSO_DATABASE_URL" DATABASE_AUTH_TOKEN="$TURSO_AUTH_TOKEN" npx tsx scripts/seed-users.ts

const SEED_EMAIL_DOMAIN = "seed.0dot.local";
const SEED_PASSWORD = "SeedUser!2026"; // same password for every seeded account — printed below

// Indian names grouped by region/community — first and last names are only
// ever paired *within* a group (see randomIndianName below), so a generated
// name always reads as one coherent identity (e.g. "Karthik Reddy", never a
// Punjabi first name with a Bengali surname).
const NAME_GROUPS: { firstNames: string[]; lastNames: string[] }[] = [
  {
    // North Indian Hindu
    firstNames: ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Reyansh","Krishna","Ishaan","Kabir","Rohan","Rahul","Amit","Sanjay","Vikram","Nikhil","Ananya","Diya","Isha","Kavya","Priya","Riya","Saanvi","Neha","Pooja","Anjali","Rekha","Sunita"],
    lastNames: ["Sharma","Verma","Gupta","Kapoor","Malhotra","Khanna","Bhatia","Arora","Sethi","Mishra","Tiwari","Pandey","Dubey","Chauhan","Rathore","Yadav"],
  },
  {
    // Punjabi / Sikh
    firstNames: ["Gurpreet","Harpreet","Jaspreet","Manpreet","Simran","Navdeep","Baljeet","Amarjit"],
    lastNames: ["Singh","Kaur","Chopra","Ahluwalia"],
  },
  {
    // South Indian (Tamil / Telugu / Malayali / Kannada)
    firstNames: ["Karthik","Suresh","Ganesh","Prakash","Manoj","Venkatesh","Srinivas","Ramesh","Lakshmi","Deepika","Divya","Meera","Swati","Anitha","Kavya"],
    lastNames: ["Iyer","Nair","Menon","Pillai","Reddy","Rao","Naidu","Krishnan","Subramaniam","Chandran"],
  },
  {
    // Bengali
    firstNames: ["Anirban","Debashish","Soumya","Ritwik","Sourav","Ipsita","Moumita","Rupa"],
    lastNames: ["Chatterjee","Mukherjee","Banerjee","Bose","Dutta","Sen"],
  },
  {
    // Gujarati / Marathi
    firstNames: ["Nikita","Sanika","Omkar","Sameer","Rutuja","Aniket","Prathamesh","Shreya"],
    lastNames: ["Patel","Shah","Mehta","Desai","Trivedi","Joshi","Deshmukh","Kulkarni","Kelkar","Gaikwad"],
  },
  {
    // Indian Muslim
    firstNames: ["Ayesha","Imran","Zainab","Yusuf","Bilal","Farhan","Sana","Naveed","Rizwan","Salma"],
    lastNames: ["Khan","Ahmed","Sheikh","Qureshi","Siddiqui","Ansari","Farooqui","Baig"],
  },
  {
    // Indian Christian
    firstNames: ["Maria","Anita","John","Susan","Thomas","Elizabeth","Joseph"],
    lastNames: ["Fernandes","DSouza","Pereira","Rodrigues","Thomas","Varghese","George","Abraham"],
  },
];

const BIO_LINES = [
  "Building things one commit at a time.",
  "Coffee, code, and the occasional long walk.",
  "Here to learn, share, and connect.",
  "Product thinker, weekend photographer.",
  "Trying to make the internet a little kinder.",
  "Always up for a good conversation.",
  "Design nerd with a soft spot for typography.",
  "Reading, running, repeat.",
  "Full-stack curious, backend at heart.",
  "Sharing notes from the journey.",
  "",
  "",
];

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)];
}

function randomIndianName(): { firstName: string; lastName: string } {
  const group = pick(NAME_GROUPS);
  return { firstName: pick(group.firstNames), lastName: pick(group.lastNames) };
}

function randomDateOfBirth(): Date {
  const now = new Date();
  const minAge = 18;
  const maxAge = 55;
  const years = minAge + randomInt(maxAge - minAge);
  const dob = new Date(now.getFullYear() - years, randomInt(12), 1 + randomInt(28));
  return dob;
}

function randomIndianPhoneDigits(): string {
  // Indian mobile numbers start with 6-9, 10 digits total.
  const first = 6 + randomInt(4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += randomInt(10);
  return `${first}${rest}`;
}

async function main() {
  const count = Number(process.env.COUNT ?? 99);
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  console.log(`Seeding ${count} demo user(s) at: ${url}`);

  const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const prisma = new PrismaClient({ adapter });

  // One shared bcrypt hash for every seeded account (cost 12, same as
  // signup()) — hashing once instead of per-user keeps this fast without
  // weakening anything, since all seeded accounts intentionally share one
  // known password.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const usedHandles = new Set<string>();
  const usedPhones = new Set<string>();
  let created = 0;
  let skipped = 0;

  try {
    for (let i = 0; i < count; i++) {
      const { firstName, lastName } = randomIndianName();
      const displayName = `${firstName} ${lastName}`;

      let handle = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        const suffix = attempt === 0 ? "" : String(randomInt(10000));
        const candidate = `${firstName}${lastName}${suffix}`.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (candidate.length < 3 || candidate.length > 30) continue;
        if (usedHandles.has(candidate)) continue;
        handle = candidate;
        break;
      }
      if (!handle) {
        console.log(`  skip: could not derive a unique handle for "${displayName}"`);
        skipped++;
        continue;
      }

      let phone = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = `+91${randomIndianPhoneDigits()}`;
        if (usedPhones.has(candidate)) continue;
        phone = candidate;
        break;
      }
      if (!phone) {
        console.log(`  skip: could not derive a unique phone for "${handle}"`);
        skipped++;
        continue;
      }

      const email = `${handle}@${SEED_EMAIL_DOMAIN}`;

      try {
        await prisma.user.create({
          data: {
            email,
            phone,
            passwordHash,
            status: "active",
            emailVerifiedAt: new Date(),
            dateOfBirth: randomDateOfBirth(),
            username: { create: { handle } },
            profile: { create: { displayName, bio: pick(BIO_LINES) } },
          },
        });
        usedHandles.add(handle);
        usedPhones.add(phone);
        created++;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          console.log(`  skip: "${email}" collided with an existing account, retrying next index`);
          skipped++;
          continue;
        }
        throw err;
      }
    }

    console.log(`\nDone: created ${created}, skipped ${skipped}.`);
    console.log(`All seeded accounts share the password: ${SEED_PASSWORD}`);
    console.log(`All seeded accounts use the @${SEED_EMAIL_DOMAIN} email domain for easy identification/cleanup.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
