import { Dialog, DialogContent, DialogProps, Typography } from '@material-ui/core';
import { Story, Meta } from '@storybook/react';

export default {
    component: Dialog,
    title: 'components/material-ui/dialog',
} as Meta;

const Template: Story<DialogProps> = (args) => {
    return <>
        <img 
            src="https://imgs.xkcd.com/comics/dependency_2x.png"
            style={{
                width: "100%",
                height: "100%"
            }} />
        <Dialog open>
            <DialogContent>
                <Typography>
                    Hello world
                </Typography>
            </DialogContent>
        </Dialog>
    </>
};

export const Minimal = Template.bind({});

Minimal.args = {
};