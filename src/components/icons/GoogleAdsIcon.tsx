import React from "react";

interface GoogleAdsIconProps {
  className?: string;
  size?: number;
}

/**
 * Renders a monochrome Google Ads icon as inline SVG that inherits currentColor,
 * matching the behavior of lucide-react icons for instant loading.
 */
const GoogleAdsIcon: React.FC<GoogleAdsIconProps> = ({ className = "", size = 24 }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 192 192"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-label="Google Ads"
      role="img"
    >
      {/* Google Ads official logo shape - yellow bar */}
      <path d="M17.578 109.406L64.734 27.75a27.406 27.406 0 0137.516-10.031c13.36 7.687 17.953 24.797 10.266 38.156l-47.157 81.657a27.406 27.406 0 01-37.515 10.03c-13.36-7.687-17.954-24.796-10.266-38.156z" />
      {/* Blue bar */}
      <path d="M174.422 109.406l-47.156-81.656a27.406 27.406 0 00-37.516-10.031c-13.36 7.687-17.953 24.797-10.266 38.156l47.157 81.657a27.406 27.406 0 0037.515 10.03c13.36-7.687 17.954-24.796 10.266-38.156z" />
      {/* Red circle */}
      <circle cx="145.406" cy="147.188" r="27.406" />
    </svg>
  );
};

export default GoogleAdsIcon;
