import type { MenuCategoryT, DietT, MealTimeT } from './constants';

export interface MenuItemLite {
  id: string;
  name: string;
  category: MenuCategoryT;
  diet: DietT;
  price: number; // paise
}

export interface MealPlanRules {
  sabzi: number;
  dal: number;
  rice: number;
  roti: number;
  sweet: number;
  farsan: number;
}

export interface MealPlanLite {
  id: string;
  code: string;
  name: string;
  basePrice: number;
  rules: MealPlanRules;
}

export interface OrderLineInput {
  menuItemId: string;
  quantity: number;
  isAddOn?: boolean;
}

export interface PriceBreakdown {
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

export interface ConversationContext {
  mealTime?: MealTimeT;
  diet?: DietT;
  planCode?: string;
  selections?: Record<string, number>; // menuItemId -> qty
  addressId?: string;
  notes?: string;
  draftOrderId?: string;
  couponCode?: string;
  /** Ordered list of saved address IDs shown during AWAITING_ADDRESS_CHOICE */
  savedAddressIds?: string[];
}

export interface SavedAddressLite {
  id: string;
  label?: string | null;
  line1: string;
  city: string;
  pincode: string;
}
