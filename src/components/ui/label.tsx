import * as React from 'react';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={`block pt-1 text-xs leading-5 text-slate-500 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className || ''}`}
      {...props}
    />
  )
);
Label.displayName = 'Label';

export { Label };