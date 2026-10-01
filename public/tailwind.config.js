// Tailwind CDN config, shared by index.html and widget.html
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        jarvis: {
          50: '#e6f7fb', 100: '#b3e8f2', 200: '#80d9e9', 300: '#4dcae0',
          400: '#1abbd7', 500: '#00b4d8', 600: '#0090ad', 700: '#006c82',
          800: '#004856', 900: '#00242b',
        },
        dark: {
          50: '#1a1a2e', 100: '#16162a', 200: '#121226', 300: '#0e0e1f',
          400: '#0a0a18', 500: '#060611', 600: '#04040d', 700: '#020209',
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2.5s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'typing-1': 'typingDot 1.4s infinite',
        'typing-2': 'typingDot 1.4s infinite 0.2s',
        'typing-3': 'typingDot 1.4s infinite 0.4s',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(0,180,216,0.5), inset 0 0 8px rgba(0,180,216,0.3)' },
          '50%': { boxShadow: '0 0 24px rgba(0,180,216,0.8), inset 0 0 16px rgba(0,180,216,0.5)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        typingDot: {
          '0%, 60%, 100%': { opacity: '0.2', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-6px)' },
        },
      }
    }
  }
}
