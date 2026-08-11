import { describe, expect, it, beforeEach, vi } from 'vitest';
import request from 'supertest';
import dns from 'dns';
import { app } from './app.js';
import { prisma } from './prisma.js';
import { extractRecipeText, ExtractionError } from './extractRecipeText.js';
import * as geminiModule from './geminiClient.js';

vi.mock('./geminiClient.js', () => ({
  parseRecipeTextWithGemini: vi.fn(),
  parseRecipeTextWithGeminiTimeout: vi.fn(),
}));

describe('POST /api/recipes/import-url & Recipe Extractor Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GEMINI_API_KEY = 'test-gemini-api-key';
  });

  describe('extractRecipeText Module Tests', () => {
    it('extracts recipe text from single JSON-LD object shape', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Recipe",
                "name": "Single Object Pancakes",
                "recipeYield": 4,
                "recipeIngredient": ["2 cups flour", "2 eggs"]
              }
            </script>
          </head>
          <body><h1>Pancakes</h1></body>
        </html>
      `;
      const result = extractRecipeText(html);
      expect(result.extractionMethod).toBe('JSON-LD');
      expect(result.extractedText).toContain('Recipe Name: Single Object Pancakes');
      expect(result.extractedText).toContain('Servings: 4');
      expect(result.extractedText).toContain('- 2 cups flour');
      expect(result.extractedText).toContain('- 2 eggs');
    });

    it('extracts recipe text from @graph JSON-LD array shape', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@graph": [
                  { "@type": "WebPage", "name": "Page Title" },
                  {
                    "@type": ["Recipe", "MenuItem"],
                    "name": "Graph Waffles",
                    "yield": "6 servings",
                    "recipeIngredient": ["3 cups flour", "1 tsp salt"]
                  }
                ]
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      const result = extractRecipeText(html);
      expect(result.extractionMethod).toBe('JSON-LD');
      expect(result.extractedText).toContain('Recipe Name: Graph Waffles');
      expect(result.extractedText).toContain('Servings: 6 servings');
      expect(result.extractedText).toContain('- 3 cups flour');
    });

    it('skips malformed JSON-LD block and extracts from subsequent valid Recipe block', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              { MALFORMED_JSON_SYNTAX_HERE: true
            </script>
            <script type="application/ld+json">
              {
                "@type": "Recipe",
                "name": "Valid Second Block Recipe",
                "recipeIngredient": ["1 cup milk"]
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      const result = extractRecipeText(html);
      expect(result.extractionMethod).toBe('JSON-LD');
      expect(result.extractedText).toContain('Recipe Name: Valid Second Block Recipe');
      expect(result.extractedText).toContain('- 1 cup milk');
    });

    it('falls back to plain HTML text extraction when no JSON-LD is present', () => {
      const html = `
        <html>
          <head><title>Blog Post</title><style>h1 { color: red; }</style></head>
          <body>
            <nav>Nav links</nav>
            <h1>Homemade Pizza</h1>
            <p>Serves 2</p>
            <ul>
              <li>500g flour</li>
              <li>10g yeast</li>
            </ul>
          </body>
        </html>
      `;
      const result = extractRecipeText(html);
      expect(result.extractionMethod).toBe('HTML-Text Fallback');
      expect(result.extractedText).toContain('Homemade Pizza');
      expect(result.extractedText).toContain('500g flour');
      expect(result.extractedText).not.toContain('h1 { color: red; }');
    });

    it('throws ExtractionError (502) when no usable text is found in HTML', () => {
      const html = '<html><body></body></html>';
      expect(() => extractRecipeText(html)).toThrow(ExtractionError);
    });

    it('skips oversized (>500KB) individual JSON-LD block', () => {
      const hugePadding = 'x'.repeat(501 * 1024);
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@type": "Recipe",
                "name": "Oversized Block",
                "padding": "${hugePadding}"
              }
            </script>
            <script type="application/ld+json">
              {
                "@type": "Recipe",
                "name": "Normal Sized Block",
                "recipeIngredient": ["100g sugar"]
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      const result = extractRecipeText(html);
      expect(result.extractionMethod).toBe('JSON-LD');
      expect(result.extractedText).toContain('Recipe Name: Normal Sized Block');
    });
  });

  describe('SSRF & URL Validation Security Tests', () => {
    it('returns 400 when protocol is non-http/https (e.g. ftp:// or file://)', async () => {
      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'file:///etc/passwd' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SsrfValidationError');
      expect(res.body.message).toContain('Disallowed URL protocol');
    });

    it('returns 400 for literal "localhost" hostname before DNS lookup occurs', async () => {
      const dnsSpy = vi.spyOn(dns.promises, 'lookup');

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://localhost:3001/api/recipes' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SsrfValidationError');
      expect(res.body.message).toContain('Access to hostname "localhost" is forbidden');
      expect(dnsSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when URL hostname resolves to a private IP (e.g. 127.0.0.1 or 10.0.0.1)', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '10.0.0.15', family: 4 },
      ] as unknown as dns.LookupAddress);

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://internal.company-server.local/recipe' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SsrfValidationError');
      expect(res.body.message).toContain('Access to private IP address "10.0.0.15" is forbidden');
    });

    it('returns 400 when a redirect chain ends at a private IP target (manual redirect re-validation per hop)', async () => {
      // First hop resolves to public IP 93.184.216.34
      // Second hop (redirect target) resolves to private IP 192.168.1.1
      vi.spyOn(dns.promises, 'lookup').mockImplementation(async (hostname) => {
        if (hostname === 'public-redirector.com') {
          return [{ address: '93.184.216.34', family: 4 }] as unknown as dns.LookupAddress;
        }
        if (hostname === 'internal-router.local') {
          return [{ address: '192.168.1.1', family: 4 }] as unknown as dns.LookupAddress;
        }
        return [{ address: '93.184.216.34', family: 4 }] as unknown as dns.LookupAddress;
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().includes('public-redirector.com')) {
          return {
            status: 302,
            ok: false,
            headers: new Headers({ location: 'http://internal-router.local/admin' }),
          } as Response;
        }
        return { ok: false, status: 500 } as Response;
      });

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-redirector.com/recipe' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SsrfValidationError');
      expect(res.body.message).toContain('Access to private IP address "192.168.1.1" is forbidden');
    });

    it('returns 502 when redirect chain exceeds 5 hops', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as dns.LookupAddress);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const str = url.toString();
        const count = parseInt(str.split('hop=')[1] || '0', 10);
        return {
          status: 302,
          ok: false,
          headers: new Headers({ location: `http://public-redirector.com/hop?hop=${count + 1}` }),
        } as Response;
      });

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-redirector.com/hop?hop=0' });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('FetchError');
      expect(res.body.message).toContain('Exceeded maximum redirect limit of 5 hops');
    });

    it('returns 502 when Content-Type is non-HTML (e.g. application/pdf)', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as dns.LookupAddress);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        text: async () => '%PDF-1.4 PDF content',
      } as Response);

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-recipe.com/recipe.pdf' });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('FetchError');
      expect(res.body.message).toContain('Invalid Content-Type "application/pdf"');
    });

    it('returns 502 when decompressed response size exceeds 2MB limit (incremental streaming check)', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as dns.LookupAddress);

      const oversizedBuffer = Buffer.alloc(2.1 * 1024 * 1024, 'a');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        body: null,
        text: async () => oversizedBuffer.toString('utf8'),
      } as Response);

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-recipe.com/huge-recipe.html' });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('FetchError');
      expect(res.body.message).toContain('Decompressed response size exceeds 2MB limit');
    });

    it('returns 502 on fetch network failure or timeout', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as dns.LookupAddress);

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-recipe.com/down' });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('FetchError');
      expect(res.body.message).toContain('Failed to fetch recipe webpage: Connection refused');
    });
  });

  describe('Gemini Integration & End-to-End Pipeline Tests', () => {
    it('returns 502 when Gemini API request times out past 30 seconds', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as dns.LookupAddress);

      const validHtml = `
        <html>
          <head>
            <script type="application/ld+json">
              { "@type": "Recipe", "name": "Slow Recipe", "recipeIngredient": ["1 egg"] }
            </script>
          </head>
        </html>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        body: null,
        text: async () => validHtml,
      } as Response);

      // Mock Gemini call to reject with a timeout error via parseRecipeTextWithGeminiTimeout
      vi.mocked(geminiModule.parseRecipeTextWithGeminiTimeout).mockRejectedValueOnce(
        new Error('Gemini API request timed out after 30 seconds.')
      );

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-recipe.com/slow' });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('BadGateway');
      expect(res.body.message).toContain('Gemini API request timed out');
    });

    it('executes full pipeline successfully (200 OK) for mocked fetch + valid JSON-LD and invokes parseRecipeTextWithGemini exactly once', async () => {
      const initialCount = await prisma.recipe.count();

      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as dns.LookupAddress);

      const validHtml = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Recipe",
                "name": "Guacamole Dip",
                "recipeYield": "4 servings",
                "recipeIngredient": ["3 avocados", "1 lime", "1 tsp salt"]
              }
            </script>
          </head>
        </html>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        body: null,
        text: async () => validHtml,
      } as Response);

      const mockGeminiJson = JSON.stringify({
        name: 'Guacamole Dip',
        baseServings: 4,
        dietaryTags: ['Vegan'],
        ingredients: [
          { ingredientId: 'avocado', displayName: 'Avocados', amount: 3, unit: 'count' },
          { ingredientId: 'lime', displayName: 'Lime', amount: 1, unit: 'count' },
          { ingredientId: 'salt', displayName: 'Salt', amount: 1, unit: 'tsp' },
        ],
      });

      const geminiSpy = vi
        .mocked(geminiModule.parseRecipeTextWithGeminiTimeout)
        .mockResolvedValue(mockGeminiJson);

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-recipe.com/guacamole' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Guacamole Dip');
      expect(res.body.baseServings).toBe(4);
      expect(res.body.dietaryTags).toEqual(['Vegan']);
      expect(res.body.ingredients).toHaveLength(3);
      expect(res.body.ingredients[0]).toEqual({
        ingredientId: 'avocado',
        displayName: 'Avocados',
        amount: 3,
        unit: 'count',
      });

      // CONFIRM parseRecipeTextWithGemini / parseRecipeTextWithGeminiTimeout is invoked EXACTLY ONCE
      expect(geminiSpy).toHaveBeenCalledTimes(1);

      // CONFIRM ZERO database persistence occurred (Prisma count unchanged)
      const afterCount = await prisma.recipe.count();
      expect(afterCount).toBe(initialCount);
    });

    it('returns 422 when mocked Gemini response contains invalid domain unit (e.g. "pinch")', async () => {
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as dns.LookupAddress);

      const validHtml =
        '<html><head><script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeIngredient":["pinch of pepper"]}</script></head></html>';

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        body: null,
        text: async () => validHtml,
      } as Response);

      const mockInvalidUnitJson = JSON.stringify({
        name: 'Pepper Soup',
        baseServings: 2,
        dietaryTags: [],
        ingredients: [
          { ingredientId: 'pepper', displayName: 'Black Pepper', amount: 1, unit: 'pinch' },
        ],
      });

      vi.mocked(geminiModule.parseRecipeTextWithGeminiTimeout).mockResolvedValue(
        mockInvalidUnitJson
      );

      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'http://public-recipe.com/pepper-soup' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('InvalidUnitError');
      expect(res.body.message).toContain('Invalid or unsupported unit: "pinch"');
    });
  });
});
