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
          isDark ? "" : "bg-roomiebill-primary"
        }`}
      >
        <Sun size={18} color="white" />
      </div>
      <div
        className={`flex-1 h-full flex items-center justify-center rounded-full ${
          isDark ? "bg-roomiebill-primary" : ""
        }`}
      >
        <Moon size={18} />
      </div>
    </button>
  );
}
