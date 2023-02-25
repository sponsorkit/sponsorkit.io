import { Box, Button, FormHelperText, InputAdornment, TextField } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import palette from "../../theme/palette";
import classes from "./amount-picker.module.scss";

export function AmountPicker(props: {
  options: number[],
  onAmountChanged: (amount: number|null) => void
}) {
  const [selectedOption, setSelectedOption] = useState(props.options[0] + "");

  const getError = () => {
    const amount = +selectedOption;
    if (isNaN(amount))
      return "You must specify a number.";

    const isInteger = amount % 1 === 0;
    if (!isInteger)
      return "Decimals are not allowed.";

    if (amount < 10)
      return "The minimum amount is $10.";

    return null;
  }

  useEffect(
    () => {
      props.onAmountChanged(getError() ?
        null :
        +selectedOption);
    },
    [selectedOption]);

  const amountError = useMemo(
    getError,
    [selectedOption]);

  return <Box className={classes["sponsorship-options"]}>
    <Box>
      {props.options.map(option =>
        <Button
          key={`button-${option}`}
          variant="outlined"
          color="secondary"
          disableElevation
          onClick={() => setSelectedOption(option.toString())}
          className={classes["amount-button"]}
          style={{
            backgroundColor: selectedOption == option.toString() ?
              palette.light.primary.main :
              "",
            color: selectedOption == option.toString() ?
              "white" :
              ""
          }}
        >
          ${option}
        </Button>)}
    </Box>
    <Box className={classes.separator}>- or -</Box>
    <TextField
      label="Custom amount"
      variant="outlined"
      margin="dense"
      fullWidth
      type="number"
      InputProps={{
        startAdornment: <InputAdornment position="start">$</InputAdornment>,
      }}
      value={selectedOption}
      onChange={e => setSelectedOption(e.target.value)}
    />
    {amountError && <FormHelperText 
      className={classes["error-text"]}
      error={!!amountError}
    >
      {amountError}
    </FormHelperText>}
  </Box>;
}