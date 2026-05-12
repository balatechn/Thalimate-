export const TZ = 'Asia/Kolkata';
export const CURRENCY = 'INR';
export const TAX_RATE = 0; // GST not applied by default; configurable
export const DEFAULT_DELIVERY_FEE = 3000; // ₹30 in paise
export const FREE_DELIVERY_THRESHOLD = 50000; // ₹500

export const MEAL_PLAN_CODES = ['DAILY_DELIGHT', 'PREMIUM', 'SIGNATURE'] as const;
export type MealPlanCode = (typeof MEAL_PLAN_CODES)[number];

export const MEAL_TIMES = ['LUNCH', 'DINNER'] as const;
export type MealTimeT = (typeof MEAL_TIMES)[number];

export const DIETS = ['REGULAR', 'JAIN'] as const;
export type DietT = (typeof DIETS)[number];

export const MENU_CATEGORIES = [
  'SABZI',
  'DAL',
  'RICE',
  'ROTI',
  'SWEET',
  'FARSAN',
  'ADDON',
] as const;
export type MenuCategoryT = (typeof MENU_CATEGORIES)[number];
