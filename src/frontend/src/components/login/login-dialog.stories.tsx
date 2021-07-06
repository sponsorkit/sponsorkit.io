import { Button } from '@material-ui/core';
import { Story, Meta } from '@storybook/react';
import { useState, useEffect } from 'react';
import LoginDialog from "./login-dialog";

export default {
    component: LoginDialog,
    title: 'components/login/login-dialog',
} as Meta;

type Props = {}

const Template: Story<Props> = (args) => {
    const [isReady, setIsReady] = useState(false);
    const [shouldLogIn, setShouldLogIn] = useState(false);

    useEffect(() => {
        if(typeof localStorage === "undefined")
            return;

        localStorage.clear();
        setIsReady(true);
    }, []);

    if(!isReady)
        return <>Not ready yet</>;
    
    return !shouldLogIn ?
        <Button variant="contained" onClick={() => setShouldLogIn(true)}>
            Log in
        </Button> :
        <LoginDialog onDismissed={() => setShouldLogIn(false)}>
            {() => <>Logged in!</>}
        </LoginDialog>
};

export const Minimal = Template.bind({});

Minimal.args = {
};