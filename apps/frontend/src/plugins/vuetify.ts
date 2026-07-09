import { createVuetify } from 'vuetify';

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#f0f2f5',
          surface: '#ffffff',
          primary: '#0866ff',
          secondary: '#31a24c',
          success: '#31a24c',
          warning: '#f7b928',
          error: '#e41e3f',
          info: '#0866ff'
        }
      }
    }
  }
});
