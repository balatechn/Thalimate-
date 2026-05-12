import { PrismaClient, MenuCategory, DietType, MealTime, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ---- Admin user ----
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@thalimate.local';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'ChangeMe!123';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Admin', passwordHash, role: Role.ADMIN },
  });

  // ---- Meal Plans ----
  const plans = [
    {
      code: 'DAILY_DELIGHT',
      name: 'Daily Delight',
      basePrice: 14900,
      description: '1 Sabzi + 1 Dal + Rice + 4 Roti',
      rules: { sabzi: 1, dal: 1, rice: 1, roti: 4, sweet: 0, farsan: 0 },
    },
    {
      code: 'PREMIUM',
      name: 'Premium',
      basePrice: 19900,
      description: '2 Sabzi + 1 Dal + Rice + 4 Roti + Sweet',
      rules: { sabzi: 2, dal: 1, rice: 1, roti: 4, sweet: 1, farsan: 0 },
    },
    {
      code: 'SIGNATURE',
      name: 'Signature',
      basePrice: 26900,
      description: '2 Sabzi + 2 Dal + Rice + 5 Roti + Sweet + Farsan',
      rules: { sabzi: 2, dal: 2, rice: 1, roti: 5, sweet: 1, farsan: 1 },
    },
  ];

  for (const p of plans) {
    await prisma.mealPlan.upsert({
      where: { code: p.code },
      update: { name: p.name, basePrice: p.basePrice, description: p.description, rules: p.rules },
      create: p,
    });
  }

  // ---- Sample menu items ----
  const items = [
    { name: 'Paneer Butter Masala', category: MenuCategory.SABZI, diet: DietType.REGULAR, price: 0 },
    { name: 'Aloo Gobi', category: MenuCategory.SABZI, diet: DietType.JAIN, price: 0 },
    { name: 'Bhindi Masala', category: MenuCategory.SABZI, diet: DietType.REGULAR, price: 0 },
    { name: 'Mix Veg', category: MenuCategory.SABZI, diet: DietType.JAIN, price: 0 },
    { name: 'Dal Fry', category: MenuCategory.DAL, diet: DietType.REGULAR, price: 0 },
    { name: 'Dal Tadka', category: MenuCategory.DAL, diet: DietType.JAIN, price: 0 },
    { name: 'Dal Makhani', category: MenuCategory.DAL, diet: DietType.REGULAR, price: 0 },
    { name: 'Jeera Rice', category: MenuCategory.RICE, diet: DietType.JAIN, price: 0 },
    { name: 'Steamed Rice', category: MenuCategory.RICE, diet: DietType.JAIN, price: 0 },
    { name: 'Veg Pulao', category: MenuCategory.RICE, diet: DietType.JAIN, price: 0 },
    { name: 'Roti', category: MenuCategory.ROTI, diet: DietType.JAIN, price: 1500 },
    { name: 'Gulab Jamun', category: MenuCategory.SWEET, diet: DietType.JAIN, price: 4000 },
    { name: 'Rasgulla', category: MenuCategory.SWEET, diet: DietType.JAIN, price: 4000 },
    { name: 'Khaman', category: MenuCategory.FARSAN, diet: DietType.JAIN, price: 3000 },
    { name: 'Extra Papad', category: MenuCategory.ADDON, diet: DietType.JAIN, price: 1000 },
  ];

  for (const it of items) {
    const existing = await prisma.menuItem.findFirst({ where: { name: it.name } });
    if (!existing) await prisma.menuItem.create({ data: it });
  }

  // ---- Today's daily menu (Lunch / Regular) ----
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const menuItems = await prisma.menuItem.findMany();
  const todayMenu = await prisma.dailyMenu.upsert({
    where: { date_mealTime_diet: { date: today, mealTime: MealTime.LUNCH, diet: DietType.REGULAR } },
    update: {},
    create: { date: today, mealTime: MealTime.LUNCH, diet: DietType.REGULAR, active: true },
  });

  for (const mi of menuItems.slice(0, 10)) {
    await prisma.dailyMenuItem.upsert({
      where: { dailyMenuId_menuItemId: { dailyMenuId: todayMenu.id, menuItemId: mi.id } },
      update: {},
      create: { dailyMenuId: todayMenu.id, menuItemId: mi.id },
    });
  }

  console.log('✅ Seed complete. Admin:', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
