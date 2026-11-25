export const boards = {
  EPNG: { label: "EPNG", name: "El Paso Natural Gas", operator: "Kinder Morgan" },
  NGPL: { label: "NGPL", name: "Natural Gas Pipeline Co. of America", operator: "Kinder Morgan" },
  GCX: { label: "GCX", name: "Gulf Coast Express", operator: "Kinder Morgan" },
  PHP: { label: "PHP", name: "Permian Highway Pipeline", operator: "Kinder Morgan" },
  LINK: { label: "Enbridge LINK", name: "Enbridge LINK", operator: "Enbridge" },
  TW: { label: "Transwestern", name: "Transwestern Pipeline", operator: "Energy Transfer" },
  CG: { label: "Carlsbad Gateway", name: "Carlsbad Gateway", operator: "WhiteWater" },
} as const;

export const boardIds = Object.keys(boards) as BoardId[];
export type BoardId = keyof typeof boards;

export const categories = ["OFO", "Force Majeure", "Maintenance", "Critical", "Non-Critical"] as const;
export type Category = typeof categories[number];

export type RawNotice = {
  board: BoardId;
  id: string;
  pipeline: string;
  title: string;
  sourceType: string;
  critical: boolean;
  postedAt: string | null;
  effectiveFrom: string | null;
  effectiveThrough: string | null;
  sourceUrl: string;
  body: string;
  bodyBlocks?: NoticeBlock[];
};

export type NoticeCell = { text: string; header: boolean; colSpan: number; rowSpan: number };
export type NoticeBlock = { type: "text"; text: string } | { type: "table"; caption?: string; rows: NoticeCell[][] };

export type Notice = RawNotice & { hash: string; category: Category; emergency: boolean; tolerances: string[] };

export type BoardStatus = {
  board: BoardId;
  lastAttempt: string;
  lastSuccess: string | null;
  error: string | null;
  count: number;
};

export type Snapshot = {
  notices: Notice[];
  status: BoardStatus[];
  nextSweep: string;
};
