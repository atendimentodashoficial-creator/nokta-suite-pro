import React from "react";
import googleAdsMark from "@/assets/google-ads-mark.png";

interface GoogleAdsIconProps {
  className?: string;
  size?: number;
}

/**
 * Renders a monochrome icon that follows the same color behavior as lucide icons
 * (inherits currentColor from its container) using CSS masking.
 */
const GoogleAdsIcon: React.FC<GoogleAdsIconProps> = ({ className = "", size = 24 }) => {
  return (
    <span
      aria-label="Google Ads"
      role="img"
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${googleAdsMark})`,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "contain",
        maskImage: `url(${googleAdsMark})`,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "contain",
      }}
    />
  );
};

export default GoogleAdsIcon;
