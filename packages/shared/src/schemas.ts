import { z } from 'zod';
import { DIETS, MEAL_TIMES, MENU_CATEGORIES } from './constants';

export const phoneSchema = z
  .string()
  .min(10)
  .regex(/^\+?[0-9 \-()]+$/, 'Invalid phone');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const customerSchema = z.object({
  phone: phoneSchema,
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export const addressSchema = z.object({
  label: z.string().max(50).optional(),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  landmark: z.string().max(100).optional(),
  city: z.string().min(1).max(80),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  mapsUrl: z.string().url().optional(),
  isDefault: z.boolean().optional(),
});

export const menuItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(MENU_CATEGORIES),
  diet: z.enum(DIETS),
  price: z.number().int().min(0),
  imageUrl: z.string().url().optional(),
  active: z.boolean().optional(),
});

export const dailyMenuSchema = z.object({
  date: z.coerce.date(),
  mealTime: z.enum(MEAL_TIMES),
  diet: z.enum(DIETS),
  active: z.boolean().optional(),
  itemIds: z.array(z.string()).min(1),
  soldOut: z.record(z.string(), z.boolean()).optional(),
});

export const mealPlanSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Z_]+$/),
  name: z.string().min(1).max(80),
  description: z.string().optional(),
  basePrice: z.number().int().min(0),
  rules: z.object({
    sabzi: z.number().int().min(0),
    dal: z.number().int().min(0),
    rice: z.number().int().min(0),
    roti: z.number().int().min(0),
    sweet: z.number().int().min(0),
    farsan: z.number().int().min(0),
  }),
  active: z.boolean().optional(),
});

export const orderLineSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(0).max(50),
  isAddOn: z.boolean().optional(),
});

export const createOrderSchema = z.object({
  customerId: z.string(),
  addressId: z.string().optional(),
  planId: z.string(),
  mealTime: z.enum(MEAL_TIMES),
  diet: z.enum(DIETS),
  lines: z.array(orderLineSchema).min(1),
  couponCode: z.string().optional(),
  notes: z.string().max(500).optional(),
  scheduledFor: z.coerce.date().optional(),
});

export const evolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string().optional(),
  data: z.record(z.any()),
});

export const razorpayWebhookSchema = z.object({
  event: z.string(),
  payload: z.record(z.any()),
});

export const campaignSchema = z.object({
  name: z.string().min(1),
  template: z.string().min(1),
  segment: z.record(z.any()).optional(),
  scheduledAt: z.coerce.date().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type MenuItemInput = z.infer<typeof menuItemSchema>;
export type DailyMenuInput = z.infer<typeof dailyMenuSchema>;
export type MealPlanInput = z.infer<typeof mealPlanSchema>;
