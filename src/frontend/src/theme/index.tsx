// material
import { CssBaseline } from '@mui/material';
import {
  createTheme, StyledEngineProvider, ThemeProvider
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
  const theme = createTheme({
    palette: { 
      ...palette.light, 
      mode: 'light' 
    },
    shape,
    typography,
    breakpoints,
    direction: "ltr",
    shadows: shadows.light,
    customShadows: customShadows.light
  });
  theme.components = componentsOverride(theme);

  return (
    <StyledEngineProvider injectFirst={true}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}
