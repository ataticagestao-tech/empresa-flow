import * as React from "react";
import { Info } from "lucide-react";

interface SectionTitleProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  info?: string;
  count?: { value: number; singular: string; plural?: string };
  action?: React.ReactNode;
  as?: "h2" | "h3";
}

const TITLE_COLOR = "#1D2939";
const SUBTITLE_COLOR = "#667085";
const MUTED_COLOR = "#98A2B3";

export function SectionTitle({
  title,
  subtitle,
  info,
  count,
  action,
  as: Heading = "h3",
}: SectionTitleProps) {
  const countLabel = count
    ? `${count.value} ${count.value === 1 ? count.singular : count.plural ?? count.singular + "s"}`
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <Heading
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: TITLE_COLOR,
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {title}
          {info && (
            <span
              title={info}
              style={{ display: "inline-flex", cursor: "help" }}
            >
              <Info size={14} style={{ color: MUTED_COLOR }} />
            </span>
          )}
        </Heading>
        {(subtitle || countLabel) && (
          <div
            style={{
              fontSize: 13,
              color: SUBTITLE_COLOR,
              marginTop: 3,
              fontWeight: 500,
            }}
          >
            {subtitle}
            {subtitle && countLabel && " · "}
            {countLabel}
          </div>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
