const phpPoints = "https://pipeline2.kindermorgan.com/PortalWeb/PointCatalog.aspx?code=PHP";
const phpTariff = "https://etariff.ferc.gov/TariffBrowser.aspx?tid=6927";
const gcxTariff = "https://etariff.ferc.gov/TariffBrowser.aspx?tid=6453";
const aguaBlanca = "https://www.whitewatermidstream.com/operations";
const phpMap = "https://www.kindermorgan.com/getmedia/b9325d90-2d5e-4b96-b609-a35d22cc23cd/PHP-Expansion-Project-Fact-Sheet-July-2022_-REV4.pdf#page=2";
const phpRates = {
  tariff: 0.5136,
  fuel: 0.045,
  fuelBasis: "Highest mainline cap (Tier 3); actual fuel varies",
  rateSourceUrl: phpTariff,
  rateReference: "FERC SOC v6.1.0 · Arts. VII and XXXI",
  designCapacity: "2,650,000 Dth/day",
  designSourceUrl: phpTariff,
};

export const corridorGraph = {
  nodes: [
    { id: "delaware", name: "Delaware (Agua Blanca)", kind: "receipt", x: 105, y: 112 },
    { id: "waha", name: "Agua Blanca at Waha", kind: "interconnect", x: 285, y: 112 },
    { id: "katy", name: "Katy Oasis", kind: "delivery", x: 690, y: 25 },
    { id: "agua-dulce", name: "Agua Dulce (Tejas)", kind: "delivery", x: 610, y: 205 },
    { id: "lockhart", name: "HPL at Lockhart", kind: "interconnect", x: 472, y: 112 },
    { id: "hsc", name: "Houston Ship Channel", kind: "delivery", x: 690, y: 112 },
  ],
  edges: [
    {
      id: "del-waha", from: "delaware", to: "waha", name: "Agua Blanca",
      points: "Texas Delaware Basin system → Agua Blanca Waha header",
      pointSourceUrl: aguaBlanca,
      mapUrl: "https://www.ogj.com/pipelines-transportation/article/14187326/whitewater-mplx-complete-agua-blanca-permian-gas-gathering-expansion",
      tariff: 0.1950, fuel: 0.0075, fuelBasis: "Cap; actual retention varies",
      rateSourceUrl: "https://etariff.ferc.gov/TariffBrowser.aspx?tid=5999",
      rateReference: "FERC SOC v0.2.0 · Exhibit B",
      designCapacity: "~3.5 Bcf/day",
      designSourceUrl: aguaBlanca,
    },
    {
      id: "php-katy", from: "waha", to: "katy", board: "PHP", name: "Permian Highway",
      points: "Agua Blanca receipt #54226 → Katy Oasis delivery",
      pointSourceUrl: phpPoints,
      deliverySourceUrl: "https://pipeline2.kindermorgan.com/Notices/NoticeDetail.aspx?code=PHP&notc_nbr=203466",
      mapUrl: phpMap,
      ...phpRates,
    },
    {
      id: "gcx-agua", from: "waha", to: "agua-dulce", board: "GCX", name: "Gulf Coast Express",
      points: "Agua Blanca receipt #53710 → KM Tejas interconnect #53668",
      pointSourceUrl: "https://pipeline2.kindermorgan.com/PortalWeb/PointCatalog.aspx?code=GCX",
      mapUrl: "https://pipeline2.kindermorgan.com/Documents/TGP/2018_Customer_Meeting_-_Combined_Presentation_-_FINAL-20180823090312.pdf#page=12",
      tariff: 0.4600, fuel: 0.04, fuelBasis: "Highest cap (Tier 2); actual fuel varies",
      rateSourceUrl: gcxTariff,
      rateReference: "FERC SOC v12.0.0 · Arts. VII and XXX",
      designCapacity: "2,570,000 Dth/day",
      designSourceUrl: gcxTariff,
    },
    {
      id: "php-lockhart", from: "waha", to: "lockhart", board: "PHP", name: "Permian Highway",
      points: "Agua Blanca receipt #54226 → HPL delivery #54578",
      pointSourceUrl: phpPoints, mapUrl: phpMap,
      ...phpRates,
    },
    {
      id: "hpl-hsc", from: "lockhart", to: "hsc", name: "Houston Pipe Line",
      points: "From HPL at Lockhart to HSC Pool (subject to confirmation and separate pooling agreement)",
      pointSourceUrl: "https://hpletconnect.energytransfer.com/intrastate/postedDocs/EBB%20HSC%20Pool%20training%20document%20HOW%20TO(1402111402146).pdf",
      mapUrl: "https://pipelines.energytransfer.com/ipost/main/index?asset=HPL",
      tariff: 0.3125, fuel: 0.013, fuelBasis: "Published fixed retention",
      rateSourceUrl: "https://hpletconnect.energytransfer.com/intrastate/postedDocs/HPL_SOC_Clean_11.pdf#page=35",
      rateReference: "FERC SOC v6.0.0 · Exhibit D",
      designCapacity: "5.3 Bcf/day",
      designSourceUrl: "https://pipelines.energytransfer.com/ipost/capacity/design-capacity-for-intrastates?asset=HPL",
    },
  ].map((edge) => ({ ...edge, capacity: null, capacitySource: "unreported" })),
};

export function validateGraph(graph) {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length || new Set(graph.edges.map((edge) => edge.id)).size !== graph.edges.length) {
    throw new Error("Duplicate graph IDs");
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || !Number.isFinite(edge.tariff) || edge.tariff < 0 ||
      !Number.isFinite(edge.fuel) || edge.fuel < 0 || edge.fuel >= 1 ||
      (edge.capacity !== null && (!Number.isFinite(edge.capacity) || edge.capacity < 0))) {
      throw new Error(`Invalid corridor segment: ${edge.id}`);
    }
  }
  return graph;
}

export function withCapacity(graph, rows) {
  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      const row = rows?.find(({ edgeId }) => edgeId === edge.id);
      return row ? {
        ...edge, capacity: row.oac, capacitySource: "reported", capacityAsOf: row.asOf,
        scheduledVolume: row.scheduledVolume ?? null, capacityUrl: row.sourceUrl,
      } : edge;
    }),
  };
}

export function memoryGraph(graph = corridorGraph) {
  validateGraph(graph);
  return { name: "In-memory", async read() { return structuredClone(graph); } };
}
