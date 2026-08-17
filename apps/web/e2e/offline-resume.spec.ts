import { test, expect } from '@playwright/test';

/**
 * Regression coverage for a real bug found during a production-stack acceptance test: the
 * shopping-list checkbox toggle correctly paused while offline and correctly survived a page
 * reload via the localStorage persister, but never resumed automatically once the browser came
 * back online *later in the same session* — only a fresh manual click reached the server.
 * `PersistQueryClientProvider`'s `onSuccess` in App.tsx only calls `resumePausedMutations()`
 * once, at boot; it doesn't re-fire on a later offline->online transition. Fixed by also
 * subscribing to `onlineManager` and calling the same `resumePausedMutations()` on every
 * offline->online transition, not just at mount — see App.tsx's doc comment above `persister`.
 *
 * Deliberately does NOT use Playwright's `context.setOffline()` or `page.route` blocking: this
 * app has no service worker, so a genuine full network block also fails the "reload while
 * offline" step itself (`net::ERR_INTERNET_DISCONNECTED` on the document request — confirmed
 * empirically while writing this test), and blocking all `/api/**` traffic also breaks
 * `GET /api/auth/me` on the reload, logging the session out client-side for a reason unrelated
 * to the bug — confirmed empirically too. Instead this drives only the signal the app's offline
 * detection actually keys on. TanStack Query's `onlineManager` (query-core's `onlineManager.js`)
 * does *not* read `navigator.onLine` at startup — it starts optimistically `online: true` and
 * only updates via real `window` 'online'/'offline' events, subscribed the moment the first
 * consumer (the app's `MutationCache`) subscribes to it, which happens on the very first render
 * — too early for a separate Playwright command issued after `page.reload()` resolves to
 * reliably race (confirmed empirically: the boot-time resume can complete for real before that
 * command even runs). So `addInitScript` below patches `addEventListener` itself: the instant
 * `onlineManager` registers its listener, a synthetic 'offline' event fires synchronously,
 * right after — deterministic, no timing race, and re-applied on every new document including
 * the reload via `addInitScript`'s own semantics.
 */
test.describe('Offline mutation resume E2E', () => {
  test('a pending mutation reloaded while offline resumes automatically once back online', async ({
    page,
    request,
  }) => {
    const uniqueSuffix = Date.now();
    const recipeName = `Offline Resume Recipe ${uniqueSuffix}`;
    const listName = `Offline Resume List ${uniqueSuffix}`;

    // 1. Seed a recipe + a saved shopping list with one unchecked item directly via the API.
    const recipeRes = await request.post('http://localhost:3011/api/recipes', {
      data: {
        name: recipeName,
        baseServings: 2,
        dietaryTags: [],
        ingredients: [{ ingredientId: 'kale', displayName: 'Kale', amount: 200, unit: 'g' }],
      },
    });
    expect(recipeRes.status()).toBe(201);
    const recipeId = (await recipeRes.json()).id as string;

    const listRes = await request.post('http://localhost:3011/api/shopping-lists', {
      data: {
        name: listName,
        sourceItems: [{ recipeId, targetServings: 2 }],
      },
    });
    expect(listRes.status()).toBe(201);
    const savedList = await listRes.json();
    const listId = savedList.id as string;
    const itemId = savedList.items[0].id as string;
    expect(savedList.items[0].checked).toBe(false);

    // 2. Make navigator.onLine controllable via a localStorage flag (persists across the
    // reload below, unlike a plain `window` property), and force-feed onlineManager the same
    // signal the instant it subscribes — see the file-level doc comment for why that has to
    // happen inside the page itself rather than via a separate Playwright command.
    await page.addInitScript(() => {
      const isForcedOffline = () => window.localStorage.getItem('__e2eForceOffline') === 'true';
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => !isForcedOffline(),
      });

      const originalAddEventListener = window.addEventListener.bind(window);
      window.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) => {
        originalAddEventListener(type, listener, options);
        if ((type === 'online' || type === 'offline') && isForcedOffline()) {
          window.dispatchEvent(new Event('offline'));
        }
      }) as typeof window.addEventListener;
    });

    // 3. Open the saved list in the UI, while still online. The checkbox's accessible name is
    // dynamic ("Mark Kale as purchased" <-> "...as not purchased" once checked), so the locator
    // must match both states rather than going stale the moment it toggles.
    await page.goto('/#shopping-list');
    await page.getByText(listName).click();
    const itemCheckbox = page.getByRole('checkbox', { name: /mark kale as (not )?purchased/i });
    await expect(itemCheckbox).toBeVisible();

    // 4. Go offline: flip the flag + fire a real event (covers listeners already subscribed
    // before this point, same as the addInitScript patch covers listeners subscribed after).
    await page.evaluate(() => {
      window.localStorage.setItem('__e2eForceOffline', 'true');
      window.dispatchEvent(new Event('offline'));
    });

    // 5. Toggle the item. Optimistic update flips the UI; the mutation pauses — no PATCH
    // reaches the server.
    await itemCheckbox.click();
    await expect(itemCheckbox).toBeChecked();

    const stillUnchecked = await request.get(`http://localhost:3011/api/shopping-lists/${listId}`);
    expect((await stillUnchecked.json()).items[0].checked).toBe(false);

    // The persister writes to localStorage on a throttle (default 1s) — wait for the paused
    // mutation to actually flush to storage before reloading, or the reload can race ahead of
    // it and wipe out a mutation that was paused only in memory so far.
    await expect(async () => {
      const cacheRaw = await page.evaluate(() => localStorage.getItem('cookout-ai-query-cache'));
      expect(cacheRaw ?? '').toContain('toggleShoppingListItemChecked');
    }).toPass({ timeout: 3000 });

    // 6. Reload while still offline. The paused mutation must come back via the persister, not
    // just in-memory state, and the reload itself must not resume it since we're still offline
    // — genuinely offline also means the saved-lists *query* stays paused too (queries default
    // to `networkMode: 'online'` same as mutations, and `shouldDehydrateQuery: () => false`
    // means no cached list data survives the reload either), so a real user's list wouldn't
    // render yet either; this deliberately doesn't try to select it via the UI here, only
    // localStorage and the server (both independent of what's rendered) are checked until back
    // online.
    await page.reload();

    const stillUncheckedAfterReload = await request.get(
      `http://localhost:3011/api/shopping-lists/${listId}`
    );
    expect((await stillUncheckedAfterReload.json()).items[0].checked).toBe(false);

    const pendingAfterReload = await page.evaluate(() =>
      localStorage.getItem('cookout-ai-query-cache')
    );
    expect(pendingAfterReload).toContain('toggleShoppingListItemChecked');

    // 7. Come back online — this is the exact transition the bug was in: nothing re-called
    // resumePausedMutations() after boot, so the mutation used to stay paused forever.
    const patchResponse = page.waitForResponse(
      (res) => res.url().includes(`/items/${itemId}`) && res.request().method() === 'PATCH'
    );
    await page.evaluate(() => {
      window.localStorage.setItem('__e2eForceOffline', 'false');
      window.dispatchEvent(new Event('online'));
    });
    await patchResponse;

    // 8. Now that queries can fetch again too, select the list and confirm the UI reflects the
    // resumed mutation's result; server state is updated, and the pending mutation is cleared
    // from the persisted cache.
    await page.getByText(listName).click();
    await expect(
      page.getByRole('checkbox', { name: /mark kale as (not )?purchased/i })
    ).toBeChecked();
    await expect(async () => {
      const res = await request.get(`http://localhost:3011/api/shopping-lists/${listId}`);
      expect((await res.json()).items[0].checked).toBe(true);
    }).toPass({ timeout: 5000 });

    await expect(async () => {
      const cacheRaw = await page.evaluate(() => localStorage.getItem('cookout-ai-query-cache'));
      const cache = cacheRaw ? JSON.parse(cacheRaw) : null;
      const pendingMutations = cache?.clientState?.mutations ?? [];
      expect(pendingMutations).toHaveLength(0);
    }).toPass({ timeout: 5000 });
  });
});
