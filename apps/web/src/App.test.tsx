import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('App Component', () => {
  it('renders CookOut AI title correctly', async () => {
    // Mock global fetch for health check
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        status: 'ok',
        app: 'CookOut AI Backend API',
        domainPackage: '@cookout-ai/domain',
        timestamp: new Date().toISOString(),
      }),
    } as Response);

    render(<App />);

    expect(screen.getAllByText(/CookOut AI/i).length).toBeGreaterThan(0);

    // Wait for async fetch state update to complete
    await waitFor(() => {
      expect(screen.getByText(/Connected/i)).toBeDefined();
    });
  });
});
