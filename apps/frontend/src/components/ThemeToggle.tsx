import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      id="theme-toggle-btn"
      type="button"
      onClick={toggleTheme}
      className="flex h-8 w-16 items-center rounded-full border border-b-default bg-bg-secondary transition-colors hover:border-b-hover cursor-pointer"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      <div
        className={`flex-1 h-full flex items-center justify-center rounded-full ${
          isDark ? "" : "bg-accent-secondary"
        }`}
      >
        <Sun size={18} color="white" />
      </div>
      <div
        className={`flex-1 h-full flex items-center justify-center rounded-full ${
          isDark ? "bg-accent-secondary" : ""
        }`}
      >
        <Moon size={18} />
      </div>
      {/* Track icons */}
      {/* <span className="absolute left-1.5 text-xs">☀️</span>
      <span className="absolute right-1.5 text-xs">🌙</span> */}

      {/* <Moon className="absolute right-1.5 text-xs" /> */}
      {/* Thumb */}
      {/* <span
        className={`h-6 w-6 rounded-full bg-accent-primary shadow-sm transition-transform duration-300 ${
          isDark ? "translate-x-6" : "translate-x-0"
        }`}
      /> */}
    </button>
  );
}
