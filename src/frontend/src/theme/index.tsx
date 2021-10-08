// material
import { CssBaseline } from '@mui/material';
import {
  createTheme, StyledEngineProvider, ThemeOptions,
  ThemeProvider
} from '@mui/material/styles';
import { ReactNode } from 'react';
import breakpoints from './breakpoints';
import componentsOverride from './overrides';
import palette from './palette';
import shadows, { customShadows } from './shadows';
//
import shape from './shape';
import typography from './typography';

// ----------------------------------------------------------------------

type ThemeConfigProps = {
  children: ReactNode;
};

export default function ThemeConfig({ children }: ThemeConfigProps) {

  const themeOptions: ThemeOptions = {
    palette: { ...palette.light, mode: 'light' },
    shape,
    typography,
    breakpoints,
    direction: "ltr",
    shadows: shadows.light,
    customShadows: customShadows.light
  }

  const theme = createTheme(themeOptions);
  theme.components = componentsOverride(theme);

  return (
    <StyledEngineProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}
