import React from 'react';
import TopLayout from './layout';

export const wrapRootElement = ({ element }) => {
  return <TopLayout>{element}</TopLayout>;
};