import { CssBaseline } from '@mui/material';
import { createTheme, Direction, StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import { ReactNode } from 'react';
import breakpoints from './breakpoints';
import GlobalStyles from './globalStyles';
import componentsOverride from './overrides';
import palette from './palette';
import shadows, { customShadows } from './shadows';
import shape from './shape';
import typography from './typography';



type ThemeConfigProps = {
  children: ReactNode;
};

export default function ThemeConfig({ children }: ThemeConfigProps) {
  const isLight = true;

  const direction: Direction = "ltr";

  const theme = createTheme({
    palette: isLight ? 
      { 
        ...palette.light, 
        mode: 'light' 
      } : 
      { 
        ...palette.dark, 
        mode: 'dark' 
      },
    shape,
    typography,
    breakpoints,
    direction,
    shadows: isLight ? shadows.light : shadows.dark,
    customShadows: isLight ? customShadows.light : customShadows.dark
  });
  theme.components = componentsOverride(theme);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}
