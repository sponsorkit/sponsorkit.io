import { Meta, Story } from '@storybook/react';
import { VerificationSuccessPage } from './verification-success';

export default {
    component: VerificationSuccessPage,
    title: 'pages/verification-success',
} as Meta;

type Props = {
}

const Template: Story<Props> = (args) => {
    return <VerificationSuccessPage />
};

export const Minimal = Template.bind({});

Minimal.args = {
};