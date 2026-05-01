const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcrypt');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const username = process.env.SEED_ADMIN_USERNAME || 'Admin';

  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingAdmin = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingAdmin) {
    console.log(`Admin ${normalizedEmail} already exists`);
    return;
  }

  const passwordHash = await bcrypt.hash(
    password,
    Number(process.env.PASSWORD_SALT_ROUNDS || 12),
  );

  await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      role: UserRole.admin,
      username,
    },
  });

  console.log(`Admin ${normalizedEmail} created`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
