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
                {...args}
                debugMode
                state={state}
                render={args => {
                    return <div style={{
                        border: '1px solid black'
                    }}>
                        <p>
                            State:&nbsp;
                            {args.state === null && "null"}
                            {args.state === undefined && "undefined"}
                            {args.state ? args.state : ""}
                        </p>
                        <p>
                            Class: {args.className}
                        </p>
                    </div>
                }}
            />
        </div>
    </div>
};

export const Minimal = Template.bind({});

Minimal.args = {
};