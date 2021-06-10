import { Theme } from '@material-ui/core/styles';

// ----------------------------------------------------------------------

export default function Skeleton(theme: Theme) {
  return {
    MuiSkeleton: {
      defaultProps: {
        animation: 'wave'
      },

      styleOverrides: {
        root: {
          backgroundColor: theme.palette.background.neutral
        }
      }
    }
  };
}
