import { Theme } from '@material-ui/core/styles';

// ----------------------------------------------------------------------

export default function Container(theme: Theme) {
  return {
    MuiContainer: {
      styleOverrides: {
        root: {}
      }
    }
  };
}
