export interface RecipeStepFixture {
  instruction: string;
  duration?: { amount: number; unit: 'minutes' | 'hours' };
  temperature?: { amount: number; unit: 'F' | 'C' };
}

export interface RecipeDraftFixture {
  name: string;
  baseServings: number;
  dietaryTags: string[];
  ingredients: Array<{
    ingredientId: string;
    displayName: string;
    amount: number;
    unit: string;
  }>;
  instructions: RecipeStepFixture[];
}

export const TEXT_IMPORT_FIXTURE: RecipeDraftFixture = {
  name: 'Fixtured Granola Bowl',
  baseServings: 2,
  dietaryTags: ['Vegetarian'],
  ingredients: [
    { ingredientId: 'oats', displayName: 'Rolled Oats', amount: 2, unit: 'cup' },
    { ingredientId: 'honey', displayName: 'Honey', amount: 2, unit: 'tbsp' },
  ],
  instructions: [
    { instruction: 'Combine oats and honey in a bowl.' },
    {
      instruction: 'Let sit for 5 minutes before serving.',
      duration: { amount: 5, unit: 'minutes' },
    },
  ],
};

export const URL_IMPORT_FIXTURE: RecipeDraftFixture = {
  name: 'Fixtured Blueberry Muffins',
  baseServings: 12,
  dietaryTags: ['Vegetarian'],
  ingredients: [
    { ingredientId: 'flour', displayName: 'All-Purpose Flour', amount: 2, unit: 'cup' },
    { ingredientId: 'blueberries', displayName: 'Fresh Blueberries', amount: 1, unit: 'cup' },
  ],
  instructions: [
    {
      instruction: 'Preheat the oven to 375°F and line a muffin tin.',
      temperature: { amount: 375, unit: 'F' },
    },
    { instruction: 'Fold blueberries into the batter and divide among cups.' },
    {
      instruction: 'Bake for 20 minutes until golden.',
      duration: { amount: 20, unit: 'minutes' },
    },
  ],
};

export const IMAGE_IMPORT_FIXTURE: RecipeDraftFixture = {
  name: 'Fixtured Handwritten Apple Pie',
  baseServings: 8,
  dietaryTags: ['Vegetarian'],
  ingredients: [
    { ingredientId: 'apples', displayName: 'Granny Smith Apples', amount: 6, unit: 'count' },
    { ingredientId: 'cinnamon', displayName: 'Ground Cinnamon', amount: 1, unit: 'tsp' },
  ],
  instructions: [
    { instruction: 'Peel and slice the apples, then toss with cinnamon.' },
    {
      instruction: 'Fill the pie crust and bake at 375°F for 45 minutes.',
      duration: { amount: 45, unit: 'minutes' },
      temperature: { amount: 375, unit: 'F' },
    },
  ],
};

export const CAMERA_IMPORT_FIXTURE: RecipeDraftFixture = {
  name: 'Fixtured Camera Steak Salad',
  baseServings: 2,
  dietaryTags: ['Omnivore'],
  ingredients: [
    { ingredientId: 'steak', displayName: 'Sirloin Steak', amount: 450, unit: 'g' },
    { ingredientId: 'spinach', displayName: 'Baby Spinach', amount: 200, unit: 'g' },
  ],
  instructions: [
    { instruction: 'Sear the steak to desired doneness and let it rest.' },
    { instruction: 'Slice and serve over spinach.' },
  ],
};

export interface GuestGroupFixture {
  totalGuests: number;
  vegetarianCount: number;
  veganCount: number;
}

export const GUEST_GROUP_FIXTURE: GuestGroupFixture = {
  totalGuests: 14,
  vegetarianCount: 5,
  veganCount: 2,
};
