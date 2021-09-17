import { Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export default function Slider(theme: Theme) {
  return {
    MuiSlider: {
      styleOverrides: {
        root: {
          '&.Mui-disabled': {
            color: theme.palette.action.disabled
          }
        },
        markLabel: {
          fontSize: 13,
          color: theme.palette.text.disabled
        }
      }
    }
  };
}
