import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import {
  AuBankAccountElement,
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  FpxBankElement,
  IbanElement,
  IdealBankElement
} from '@stripe/react-stripe-js'
import React from 'react'
import StripeInput from './input'

type StripeElement =
  | typeof AuBankAccountElement
  | typeof CardCvcElement
  | typeof CardExpiryElement
  | typeof CardNumberElement
  | typeof FpxBankElement
  | typeof IbanElement
  | typeof IdealBankElement;

interface StripeTextFieldProps<T extends StripeElement>
  extends Omit<TextFieldProps, "onChange" | "inputComponent" | "inputProps"> {
  inputProps?: React.ComponentProps<T>;
  labelErrorMessage?: string;
  onChange?: React.ComponentProps<T>["onChange"];
  stripeElement: T;
}

export const StripeTextField = <T extends StripeElement>(
  props: StripeTextFieldProps<T>
) => {
  const {
    helperText,
    InputLabelProps,
    InputProps = {},
    inputProps,
    error,
    labelErrorMessage,
    stripeElement,
    ...other
  } = props;

  return (
    <TextField
      fullWidth
      InputLabelProps={{
        ...InputLabelProps,
        shrink: true
      }}
      error={error}
      InputProps={{
        ...InputProps,
        inputProps: {
          ...inputProps,
          ...InputProps.inputProps,
          component: stripeElement
        },
        inputComponent: StripeInput
      }}
      helperText={error ? labelErrorMessage : helperText}
      {...(other as any)}
      style={{
        marginTop: 18,
        marginBottom: 8
      }}
    />
  );
};