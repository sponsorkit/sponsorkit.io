import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import {
  AuBankAccountElement,
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  FpxBankElement,
  IbanElement,
  IdealBankElement,
} from '@stripe/react-stripe-js'
import React from 'react'
import { StripeInput } from './input'

type StripeElement =
  | typeof AuBankAccountElement
  | typeof CardCvcElement
  | typeof CardExpiryElement
  | typeof CardNumberElement
  | typeof FpxBankElement
  | typeof IbanElement
  | typeof IdealBankElement

interface StripeTextFieldProps<T extends StripeElement>
  extends Omit<TextFieldProps, 'onChange' | 'inputComponent' | 'inputProps'> {
  onChange?: React.ComponentProps<T>['onChange']
  inputProps?: React.ComponentProps<T>
  stripeElement: T
}

export const StripeTextField = <T extends StripeElement>(
  props: StripeTextFieldProps<T>
) => {
  const {
    InputLabelProps,
    stripeElement,
    InputProps = {},
    inputProps,
    ...other
  } = props

  return (
    <TextField
      fullWidth
      size="small"
      InputLabelProps={{
        ...InputLabelProps,
        shrink: true
      }}
      InputProps={{
        ...InputProps,
        inputProps: {
          ...inputProps,
          ...InputProps.inputProps,
          component: stripeElement,
        },
        inputComponent: StripeInput
      }}
      {...(other as any)}
      style={{
        marginTop: 16,
        marginBottom: 8
      }}
    />
  )
}