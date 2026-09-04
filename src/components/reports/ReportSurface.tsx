import type { ReactNode } from "react";

type ReportSurfaceProps = {
  children: ReactNode;
};

export default function ReportSurface({ children }: ReportSurfaceProps) {
  return <div className="professional-report print-report">{children}</div>;
}
