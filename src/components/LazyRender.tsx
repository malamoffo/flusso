import React, { ReactNode } from 'react';
import { useInView } from 'react-intersection-observer';

interface LazyRenderProps {
  children: ReactNode;
  height?: string | number;
}

export const LazyRender = ({ children, height = '120px' }: LazyRenderProps) => {
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '400px 0px 400px 0px', // Buffer to start rendering before it enters viewport
    triggerOnce: false,
  });

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {inView ? children : null}
    </div>
  );
};
