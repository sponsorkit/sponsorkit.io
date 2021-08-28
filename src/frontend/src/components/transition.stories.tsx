import { Button } from '@material-ui/core';
import { Meta, Story } from '@storybook/react';
import { useState } from 'react';
import { Transition } from './transition';

export default {
    component: Transition,
    title: 'components/transition',
} as Meta;

type Props = {
}

let i=1;

const Template: Story<Props> = (args) => {
    const [state, setState] = useState<string|undefined|null>(undefined);

    return <div>
        <Button onClick={async () => {
            setState(undefined);
        }}>
            Loading
        </Button>
        <Button onClick={async () => {
            setState((++i).toString());
        }}>
            Loaded (found)
        </Button>
        <Button onClick={async () => {
            setState(null);
        }}>
            Loaded (not found)
        </Button>
        <div style={{
            border: "1px solid red"
        }}>
            <Transition
                transitionKey={state}
                timeout={1000}
            >
                <div style={{
                    border: '1px solid black'
                }}>
                    <p>
                        State:&nbsp;
                        {state === null && "null"}
                        {state === undefined && "undefined"}
                        {state ? state : ""}
                    </p>
                </div>
            </Transition>
        </div>
    </div>
};

export const Minimal = Template.bind({});

Minimal.args = {
};