'use client';

import { useEffect, useState } from 'react';

const FALLBACK_PATH = '/agent-club/agents';
const WORKSPACE_SLUG = 'agent-club';
const LOCAL_EMAIL = 'agent-club@local.agentclub';

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:18330').replace(/\/$/, '');
}

function getSafePath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return FALLBACK_PATH;
  }

  return value;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

function setWorkspaceCookies(): void {
  const oneYear = 60 * 60 * 24 * 365;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `multica_logged_in=1; path=/; max-age=${oneYear}; SameSite=Lax${secure}`;
  document.cookie = `last_workspace_slug=${WORKSPACE_SLUG}; path=/; max-age=${oneYear}; SameSite=Lax${secure}`;
}

export default function AgentClubBootPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function openWorkspace() {
      const params = new URLSearchParams(window.location.search);
      const next = getSafePath(params.get('next'));

      try {
        window.localStorage.removeItem('multica_token');
        const response = await fetch(`${apiBaseUrl()}/auth/agent-club`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: LOCAL_EMAIL }),
        });

        if (!response.ok) {
          throw new Error(await readError(response));
        }

        setWorkspaceCookies();
        if (!cancelled) {
          window.location.replace(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void openWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className='flex min-h-screen items-center justify-center bg-background px-6 text-foreground'>
      <p className='max-w-md text-center text-sm text-muted-foreground'>
        {error ? `Local Agent Manager could not open: ${error}` : 'Opening Local Agent Manager...'}
      </p>
    </main>
  );
}
