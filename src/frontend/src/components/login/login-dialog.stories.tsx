import { useConfiguration } from '@hooks/configuration';
import { Button } from '@mui/material';
import { Meta, Story } from '@storybook/react';
import { useEffect, useState } from 'react';
import LoginDialog from "./login-dialog";

export default {
    component: LoginDialog,
    title: 'components/login/login-dialog',
} as Meta;

type Props = {}

const Template: Story<Props> = (args) => {
    const [isReady, setIsReady] = useState(false);
    const [shouldLogIn, setShouldLogIn] = useState(false);
    const configuration = useConfiguration();

    useEffect(() => {
        if(typeof localStorage === "undefined")
            return;

        localStorage.clear();
        setIsReady(true);
    }, []);

    if(!isReady || !configuration)
        return <>Not ready yet</>;
    
    return !shouldLogIn ?
        <Button variant="contained" onClick={() => setShouldLogIn(true)}>
            Log in
        </Button> :
        <LoginDialog 
            isOpen
            configuration={configuration}
            onDismissed={() => setShouldLogIn(false)}
        >
            {() => <>Logged in!</>}
        </LoginDialog>
};

export const Minimal = Template.bind({});

Minimal.args = {
};