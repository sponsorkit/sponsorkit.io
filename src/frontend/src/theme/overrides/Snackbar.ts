import { Theme } from '@material-ui/core/styles';

// ----------------------------------------------------------------------

export default function Snackbar(theme: Theme) {
  return {
    MuiSnackbarContent: {
      styleOverrides: {
        root: {}
      }
    }
  };
}
