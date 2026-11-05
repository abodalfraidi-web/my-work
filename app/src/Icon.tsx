/* أيقونات خطية موحّدة (24×24، سماكة 1.8) */
const P: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-6-4v1a6 6 0 0 0 12 0v-1M12 18v3m-3 0h6",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.9A8 8 0 1 1 21 12Z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  users: "M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 9v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0V6a2 2 0 0 1 2-2h10M16 13.5h.01",
  journal: "M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18m3-13h4m-4 4h4",
  study: "M3 9l9-5 9 5-9 5-9-5Zm4 2.2V16c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.8M21 9v5",
  chart: "M4 20V4m0 16h16M8 16v-4m4 4V8m4 8v-6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z",
  library: "M4 4v16M8 4v16M12 5l4.5 15M17 4l3 .5",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5 10 17l9-10",
  x: "M6 6l12 12M18 6 6 18",
  back: "M9 6l6 6-6 6",
  chevron: "M15 6l-6 6 6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z",
  book: "M12 6.5C10.5 5 8 4.5 4 4.5V18c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4.5c-4 0-6.5.5-8 2Zm0 0V20",
  translate: "M4 5h8M8 3v2m2.5 0c-.8 3.6-3.4 6.4-6.5 8m2-4.5c1 2 2.6 3.6 4.5 4.5M13 21l4-10 4 10m-6.8-3.5h5.6",
  flame: "M12 21c3.9 0 6-2.6 6-6 0-4-3-6-4-9-1.5 2-2 3.5-2 5-1-1-1.5-2-1.5-3C8 10 6 12 6 15c0 3.4 2.1 6 6 6Z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 4 4L15 13l5 5M15.5 9.5h.01",
  send: "M4 12 20 4l-4 16-4-6-8-2Zm8 2 8-10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  cloud: "M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18Z",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 22, className, strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" style={{ flex: "none" }}
    >
      <path d={P[name]} />
    </svg>
  );
}
