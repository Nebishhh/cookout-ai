import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { RecipeSourceReference } from './RecipeSourceReference';

describe('RecipeSourceReference', () => {
  it.each(['https://www.allrecipes.com/recipe/10813/', 'http://example.com/pancakes'])(
    'links an %s URL in a new tab without passing the opener or referrer',
    (url) => {
      render(<RecipeSourceReference url={url} />);

      const link = screen.getByRole('link', { name: url });
      expect(link).toHaveAttribute('href', url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByText(/recipe from:/i)).toBeInTheDocument();
    }
  );

  it('shows a javascript: URL as plain text, never as a link', () => {
    const url = 'javascript:alert(document.cookie)';
    const { container } = render(<RecipeSourceReference url={url} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText(url)).toBeInTheDocument();
  });

  it.each(['data:text/html,<b>hi</b>', 'ftp://example.com/recipe', 'not a url'])(
    'shows %s as plain text',
    (url) => {
      const { container } = render(<RecipeSourceReference url={url} />);
      expect(container.querySelector('a')).toBeNull();
      expect(screen.getByText(url)).toBeInTheDocument();
    }
  );
});
