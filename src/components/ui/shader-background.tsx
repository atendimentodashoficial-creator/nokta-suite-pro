"use client"
import { MeshGradient } from "@paper-design/shaders-react"

interface ShaderBackgroundProps {
  className?: string;
}

export function ShaderBackground({ className = "" }: ShaderBackgroundProps) {
  // Nokta Clinic brand colors:
  // Primary Cyan: hsl(191 100% 50%) = #00D4FF
  // Deep Blue: hsl(208 100% 20%) = #00406B
  // Darker Blue: hsl(208 50% 8%) = #0A1929
  // Secondary Blue: hsl(208 100% 30%) = #004D99
  
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <MeshGradient
        colors={[
          "#0A1929", // Dark background blue (208 50% 8%)
          "#00406B", // Deep blue (208 100% 20%)
          "#004D99", // Secondary blue (208 100% 30%)
          "#00D4FF", // Primary cyan (191 100% 50%)
        ]}
        speed={0.12}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
      {/* Subtle overlay for better text readability */}
      <div className="absolute inset-0 bg-background/20" />
    </div>
  )
}
