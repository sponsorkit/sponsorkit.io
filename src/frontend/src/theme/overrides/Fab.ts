import { Theme } from '@material-ui/core/styles';

// ----------------------------------------------------------------------

export default function Fab(theme: Theme) {
  return {
    MuiFab: {
      defaultProps: {
        color: 'primary'
      },

      variants: [
        {
          props: { color: 'primary' },
          style: {
            boxShadow: theme.customShadows.primary,
            '&:hover': {
              backgroundColor: theme.palette.primary.dark
            }
          }
        }
      ],

      styleOverrides: {
        root: {
          boxShadow: theme.customShadows.z8,
          '&:hover': {
            boxShadow: 'none',
            backgroundColor: theme.palette.grey[400]
          }
        },
        primary: {},
        extended: {
          '& svg': {
            marginRight: theme.spacing(1)
          }
        }
      }
    }
  };
}
