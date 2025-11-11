'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // Only render UI after first mount to avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null; // Return null on first render to avoid hydration mismatch
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'lofi' : 'dark')}
      className="btn btn-ghost btn-circle"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </button>
  );
}