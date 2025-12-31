import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="w-10 h-10 rounded-xl">
        <Sun className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-10 h-10 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:bg-card transition-all duration-300 ease-out hover:scale-105 active:scale-95"
    >
      <Sun className="w-5 h-5 rotate-0 scale-100 transition-all duration-500 ease-out dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute w-5 h-5 rotate-90 scale-0 transition-all duration-500 ease-out dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}