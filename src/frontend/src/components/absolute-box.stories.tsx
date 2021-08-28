import { Box } from '@material-ui/core';
import { Meta, Story } from '@storybook/react';
import AbsoluteBox from "./absolute-box";

export default {
    component: AbsoluteBox,
    title: 'components/absolute-box',
} as Meta;

type Props = {
}

const Template: Story<Props> = (args) => {
    return <Box style={{
        border: "1px dashed blue",
        position: "relative",
        width: "auto",
        height: "auto",
        margin: 30
    }}>
        <AbsoluteBox>
            {ref => <Box ref={ref} style={{
                width: 300,
                height: 300,
                border: "1px dashed red",
                position: "absolute"
            }} />}
        </AbsoluteBox>
    </Box>
};

export const Minimal = Template.bind({});

Minimal.args = {
};