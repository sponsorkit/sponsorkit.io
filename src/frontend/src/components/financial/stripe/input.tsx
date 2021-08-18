import { InputBaseComponentProps } from '@material-ui/core/InputBase'
import { alpha, useTheme } from '@material-ui/core/styles'
import React from 'react';

const StripeInput = React.forwardRef<any, InputBaseComponentProps>(
  function StripeInput(props, ref) {
    const { component: Component, options, ...other } = props;
    const theme = useTheme();
    const [mountNode, setMountNode] = React.useState<any | null>(null);

    React.useImperativeHandle(
      ref,
      () => ({
        focus: () => mountNode.focus()
      }),
      [mountNode]
    );

    return (
      <Component
        onReady={setMountNode}
        options={{
          ...options,
          style: {
            base: {
              color: theme.palette.text.primary,
              fontSize: "16px",
              lineHeight: "1.4375em",
              fontFamily: theme.typography.fontFamily,
              "::placeholder": {
                color: alpha(theme.palette.text.primary, 0.42)
              }
            },
            invalid: {
              color: theme.palette.text.primary
            }
          }
        }}
        {...other}
      />
    );
  }
);

export default StripeInput;