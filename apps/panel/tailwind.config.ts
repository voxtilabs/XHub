import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["selector", '[data-tema="oscuro"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
      border: "hsl(var(--border))", input: "hsl(var(--input))", ring: "hsl(var(--ring))",
      background: "hsl(var(--background))", foreground: "hsl(var(--foreground))",
      primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
      secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
      muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
      accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
      card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      senal: "hsl(var(--senal))", exito: "hsl(var(--exito))",
    },
    borderRadius: { lg: "1rem", md: "0.75rem", sm: "0.5rem", pill: "9999px" },
    fontFamily: { sans: ["Inter","system-ui","sans-serif"] },
  } },
  plugins: [],
};
export default config;
