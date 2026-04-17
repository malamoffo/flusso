import React, { useRef } from 'react';

export function RenderCounter({ name }: { name: string }) {
  const renderCount = useRef(0);
  renderCount.current += 1;

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed top-0 right-0 z-50 bg-black/80 text-yellow-500 font-mono text-xs px-2 py-1 m-1 rounded-md pointer-events-none">
      {name} Renders: {renderCount.current}
    </div>
  );
}
