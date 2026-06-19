import { createVuetify } from 'vuetify';

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background: '#0f172a',
          surface: '#111827',
          primary: '#f97316',
          secondary: '#22c55e'
        }
      }
    }
  }
});
