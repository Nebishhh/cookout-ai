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
  instructions: string[];
}

export const TEXT_IMPORT_FIXTURE: RecipeDraftFixture = {
  name: 'Fixtured Granola Bowl',
  baseServings: 2,
  dietaryTags: ['Vegetarian'],
  ingredients: [
    { ingredientId: 'oats', displayName: 'Rolled Oats', amount: 2, unit: 'cup' },
    { ingredientId: 'honey', displayName: 'Honey', amount: 2, unit: 'tbsp' },
  ],
  instructions: ['Combine oats and honey in a bowl.', 'Let sit for 5 minutes before serving.'],
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
    'Preheat the oven to 375°F and line a muffin tin.',
    'Fold blueberries into the batter and divide among cups.',
    'Bake for 20 minutes until golden.',
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
    'Peel and slice the apples, then toss with cinnamon.',
    'Fill the pie crust and bake at 375°F for 45 minutes.',
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
    'Sear the steak to desired doneness and let it rest.',
    'Slice and serve over spinach.',
  ],
};
