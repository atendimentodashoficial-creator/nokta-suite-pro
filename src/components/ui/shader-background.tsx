"use client"
import { MeshGradient } from "@paper-design/shaders-react"

interface ShaderBackgroundProps {
  className?: string;
}

export function ShaderBackground({ className = "" }: ShaderBackgroundProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <MeshGradient
        colors={["#1a1a2e", "#16213e", "#0f3460", "#e94560"]}
        speed={0.15}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
      {/* Overlay to blend with app colors */}
      <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px]" />
    </div>
  )
}
