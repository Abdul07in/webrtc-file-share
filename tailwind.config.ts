import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			sans: [
  				'Lato',
  				'ui-sans-serif',
  				'system-ui',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'Roboto',
  				'Helvetica Neue',
  				'Arial',
  				'Noto Sans',
  				'sans-serif'
  			],
  			mono: [
  				'Fira Code',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			],
  			serif: [
  				'EB Garamond',
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			]
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			success: 'hsl(var(--success))',
  			warning: 'hsl(var(--warning))'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
		keyframes: {
			'accordion-down': {
				from: {
					height: '0'
				},
				to: {
					height: 'var(--radix-accordion-content-height)'
				}
			},
			'accordion-up': {
				from: {
					height: 'var(--radix-accordion-content-height)'
				},
				to: {
					height: '0'
				}
			},
			float: {
				'0%, 100%': {
					transform: 'translateY(0px)'
				},
				'50%': {
					transform: 'translateY(-8px)'
				}
			},
			'glow-pulse': {
				'0%, 100%': {
					opacity: '0.4',
					transform: 'scale(1)'
				},
				'50%': {
					opacity: '0.8',
					transform: 'scale(1.05)'
				}
			},
			'fade-in': {
				'0%': {
					opacity: '0',
					transform: 'translateY(10px)'
				},
				'100%': {
					opacity: '1',
					transform: 'translateY(0)'
				}
			},
			'scale-in': {
				'0%': {
					opacity: '0',
					transform: 'scale(0.95)'
				},
				'100%': {
					opacity: '1',
					transform: 'scale(1)'
				}
			},
			'slide-up': {
				'0%': {
					opacity: '0',
					transform: 'translateY(20px)'
				},
				'100%': {
					opacity: '1',
					transform: 'translateY(0)'
				}
			},
			shimmer: {
				'0%': {
					backgroundPosition: '-200% 0'
				},
				'100%': {
					backgroundPosition: '200% 0'
				}
			},
			pulse: {
				'0%, 100%': {
					opacity: '1'
				},
				'50%': {
					opacity: '0.5'
				}
			}
		},
		animation: {
			'accordion-down': 'accordion-down 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
			'accordion-up': 'accordion-up 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
			float: 'float 4s cubic-bezier(0.37, 0, 0.63, 1) infinite',
			'glow-pulse': 'glow-pulse 3s cubic-bezier(0.37, 0, 0.63, 1) infinite',
			'fade-in': 'fade-in 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
			'scale-in': 'scale-in 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
			'slide-up': 'slide-up 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
			shimmer: 'shimmer 2s linear infinite',
			pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
		},
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
