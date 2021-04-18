import { FormControl, FormHelperText, Input, InputLabel, OutlinedInput } from "@material-ui/core";
import React, { ChangeEvent, Component, useState } from "react";
import StripeInput from "./input";

export default function ElementWrapper(props: {
    label: string,
    component: () => React.ReactNode
}) {
    const [focused, setFocused] = useState(false);
    const [error, setError] = useState<any>(null);

    const onBlur = () => setFocused(false);
    const onFocus = () => setFocused(true);
    const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setError((e as any).error);
    };

    return <>
        <FormControl variant="outlined" fullWidth size="medium" margin="dense">
            <InputLabel
                variant="outlined"
                focused={focused}
                shrink={true}
                error={!!error}
            >
                {props.label}
            </InputLabel>
            <OutlinedInput
                fullWidth
                label={props.label}
                inputComponent={StripeInput}
                onFocus={onFocus}
                onBlur={onBlur}
                onChange={onChange}
                inputProps={{ component: props.component }}
            />
        </FormControl>
        {error && <FormHelperText error>{error.message}</FormHelperText>}
    </>
}