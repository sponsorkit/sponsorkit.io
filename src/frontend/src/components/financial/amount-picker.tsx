import { Box, Button, InputAdornment, TextField } from "@mui/material";
import React, { useEffect, useState } from "react";
import palette from "../../theme/palette";
import * as classes from "./amount-picker.module.scss";
import { FeeDisplay } from "./fee-display";

export function AmountPicker(props: {
    options: number[],
    onAmountChanged: (amount: number) => void
  }) {
    const [selectedOption, setSelectedOption] = useState(props.options[0] + "");
    useEffect(
      () => props.onAmountChanged(+selectedOption),
      [selectedOption]);
  
    return <Box className={classes.sponsorshipOptions}>
      <Box>
        {props.options.map(option => 
          <Button 
            key={`button-${option}`}
            variant="outlined"
            color="secondary"
            disableElevation
            onClick={() => setSelectedOption(option.toString())}
            className={classes.amountButton}
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
      <FeeDisplay amount={+selectedOption} />
    </Box>;
  }