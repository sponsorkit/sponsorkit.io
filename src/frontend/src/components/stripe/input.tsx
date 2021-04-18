import React, { ChangeEvent, ChangeEventHandler, Component, EventHandler, FocusEvent, FocusEventHandler } from 'react';
import theme from '../../theme';
import * as classes from './input.module.scss';

export default function StripeInput(props: {
    onFocus?: FocusEventHandler<HTMLInputElement>,
    onBlur?: any,
    onChange?: ChangeEventHandler<HTMLInputElement>,
    component?: React.FunctionComponent<{
        className: string,
        onFocus: FocusEventHandler<HTMLInputElement>,
        onChange: ChangeEventHandler<HTMLInputElement>,
        onBlur: any,
        placeholder: string
        style: any
    }>
}) {
    const PropsComponent = props.component;
    if(!PropsComponent)
        return null;

    return <PropsComponent
        className={classes.root}
        onFocus={(e: FocusEvent<HTMLInputElement>) => props.onFocus && props.onFocus(e)}
        onBlur={(e: any) => props.onBlur && props.onBlur(e)}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange && props.onChange(e)}
        placeholder=""
        style={{
            // base: {
            //     fontSize: `${theme.typography.fontSize}px`,
            //     fontFamily: theme.typography.fontFamily,
            //     color: '#000000de'
            // }
        }}
    />
}