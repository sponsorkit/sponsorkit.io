import { Box, Button, InputAdornment, TextField } from "@material-ui/core";
import React, { useEffect, useState } from "react";
import { sponsorshipOptions, amountButton, separator } from "./amount-picker.module.scss";
import theme from "../../theme";
import { FeeDisplay } from "./fee-display";

export function AmountPicker(props: {
    options: number[],
    onAmountChanged: (amount: number) => void
  }) {
    const [selectedOption, setSelectedOption] = useState(props.options[0] + "");
    useEffect(
      () => props.onAmountChanged(+selectedOption),
      [selectedOption]);
  
    return <Box className={sponsorshipOptions}>
      <Box>
        {props.options.map(option => 
          <Button 
            key={`button-${option}`}
            variant="outlined"
            disableElevation
            onClick={() => setSelectedOption(option.toString())}
            className={amountButton}
            style={{
              backgroundColor: selectedOption == option.toString() ?
                theme.palette.primary.main :
                "",
              color: selectedOption == option.toString() ?
                "white" :
                ""
            }}
          >
            ${option}
          </Button>)}
      </Box>
      <Box className={separator}>- or -</Box>
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
      <FeeDisplay amount={+selectedOption} />
    </Box>;
  }