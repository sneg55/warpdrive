"use client";
import { useReportWebVitals } from "next/web-vitals";
import { capture } from "./capture";

interface WebVitalMetric {
  name: string;
  value: number;
  id: string;
  rating: string;
}

export function WebVitalsReporter(): null {
  useReportWebVitals((metric: WebVitalMetric) => {
    capture("web_vital", {
      metric: metric.name,
      value: metric.value,
      id: metric.id,
      rating: metric.rating,
    });
  });
  return null;
}
