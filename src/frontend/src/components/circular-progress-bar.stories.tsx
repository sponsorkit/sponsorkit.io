import { Box } from '@material-ui/core';
import { Meta, Story } from '@storybook/react';
import CircularProgressBar from './circular-progress-bar';

export default {
    component: CircularProgressBar,
    title: 'components/circular-progress-bar',
} as Meta;

type Props = {
    maximum: number,
    current: number,
    size: number,
    text?: string
}

const Template: Story<Props> = (args) => {
    return <Box style={{
        border: "1px solid gray",
        width: args.size,
        height: args.size
    }}>
        <CircularProgressBar {...args} />
    </Box>
};

export const Minimal = Template.bind({});

Minimal.args = {
    current: 33,
    maximum: 100,
    size: 300,
    text: ""
};