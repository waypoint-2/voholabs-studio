import React from 'react';

export const LogoTextComponent = () => {
  return (
    <svg
      width="250"
      height="45"
      viewBox="0 0 1830 330"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Voholabs Studio"
      // The wordmark is drawn from x=430 to the right; an RTL page would
      // anchor the text at its end and draw it over the icon.
      direction="ltr"
      style={{ direction: 'ltr' }}
    >
      <rect x="0" y="0" width="340" height="330" rx="58" fill="#FAF9F5" />
      <rect
        x="33"
        y="77.876"
        width="76.4141"
        height="255.191"
        rx="38.2071"
        transform="rotate(-29.714 33 77.876)"
        fill="#091717"
      />
      <circle cx="251.43" cy="97.751" r="45" fill="#20808D" />
      <text
        x="430"
        y="220"
        fontFamily="Instrument Serif, Times New Roman, serif"
        fontSize="200"
        fill="currentColor"
        letterSpacing="-0.02em"
        direction="ltr"
        textAnchor="start"
      >
        voholabs studio
      </text>
    </svg>
  );
};
