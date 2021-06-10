import { Theme } from '@material-ui/core/styles';

// ----------------------------------------------------------------------

export default function Popover(theme: Theme) {
  return {
    MuiPopover: {
      styleOverrides: {
        paper: {
          boxShadow: theme.customShadows.z12
        }
      }
    }
  };
}
