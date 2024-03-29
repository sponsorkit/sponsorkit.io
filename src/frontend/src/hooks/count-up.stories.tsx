import { Box, Button, Typography } from '@mui/material';
import { Meta, Story } from '@storybook/react';
import { useState } from 'react';
import { useAnimatedCount } from './count-up';

export default {
    title: 'hooks/count-up',
} as Meta;

type Props = {}

const Template: Story<Props> = (args) => {
    const [value, setValue] = useState(100);
    const count = useAnimatedCount(
        () => value,
        [value]);

    return <Box>
        <Typography>
            Current: {count.current}
        </Typography>
        <Typography>
            Previous: {count.previous}
        </Typography>
        <Typography>
            Animated: {count.animated}
        </Typography>
        <Button variant="contained" onClick={() => setValue(value + 123)}>
            Increase
        </Button>
    </Box>
};

export const Minimal = Template.bind({});

Minimal.args = {
};