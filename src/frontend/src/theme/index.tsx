import { useMemo, ReactNode } from 'react';

import { CssBaseline } from '@material-ui/core';
import { ThemeProvider, ThemeOptions, createTheme, Direction } from '@material-ui/core/styles';
import { StyledEngineProvider } from '@material-ui/core/styles';

import shape from './shape';
import palette from './palette';
import typography from './typography';
import breakpoints from './breakpoints';
import GlobalStyles from './globalStyles';
import componentsOverride from './overrides';
import shadows, { customShadows } from './shadows';

type ThemeConfigProps = {
  children: ReactNode;
};

export default function ThemeConfig({ children }: ThemeConfigProps) {
  const isLight = true;

  const direction: Direction = "ltr";
  const themeOptions: ThemeOptions = useMemo(
    () => ({
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
    }),
    [isLight, direction]
  );

  const theme = createTheme(themeOptions);
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
