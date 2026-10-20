import { createApiClient } from '@nutripals/api-client';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

async function observableFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (response.status === 401 && !url.includes('/api/auth/')) {
    window.dispatchEvent(new CustomEvent('nutripals:unauthorized'));
  }
  return response;
}

export const api = createApiClient({ baseUrl, fetchImpl: observableFetch });
