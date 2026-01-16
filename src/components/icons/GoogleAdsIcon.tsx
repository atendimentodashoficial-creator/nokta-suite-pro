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
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-label="Google Ads"
      role="img"
    >
      {/* Google Ads logo path - simplified triangle mark */}
      <path d="M3.5 18.49l6-10.39 2.5 4.33-3.5 6.06a2.994 2.994 0 0 1-4.1 1.1 2.994 2.994 0 0 1-1.1-4.1l.2-.3v3.3zm7.5-6.49l6-10.39a3 3 0 0 1 4.1 1.1 3 3 0 0 1-1.1 4.1l-6 10.39-3-5.2zm9.5 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  );
};

export default GoogleAdsIcon;
