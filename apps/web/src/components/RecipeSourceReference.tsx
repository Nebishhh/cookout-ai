import React from 'react';

/** True only for http: and https: URLs, the only kinds safe to render as a clickable link. */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * "Recipe from: <url>" above the Paste Text box, after a URL import was blocked by the site, so the
 * user can open the original page and copy the recipe. Anything other than an http(s) URL (for
 * example `javascript:`) is shown as plain text and never becomes a link.
 */
export const RecipeSourceReference: React.FC<{ url: string }> = ({ url }) => (
  <p className="break-all text-xs text-ink-muted">
    <span className="font-semibold">Recipe from: </span>
    {isWebUrl(url) ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-clay-hover underline underline-offset-2 hover:text-clay"
      >
        {url}
      </a>
    ) : (
      <span>{url}</span>
    )}
  </p>
);
